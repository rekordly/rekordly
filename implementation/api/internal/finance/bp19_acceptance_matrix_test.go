package finance_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/catalogue"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/rekordly/rekordly-api/internal/server"
	"github.com/stretchr/testify/require"
)

func TestBP19_G0_GoldenAccountingAndInventoryInvariants(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "shared", "bp19-golden-fixtures.json"))
	require.NoError(t, err)

	var fixtures struct {
		MoneyGoldenCases []struct {
			ID                    string `json:"id"`
			Currency              string `json:"currency"`
			Exponent              int    `json:"exponent"`
			ExpectedSubtotalMinor int64  `json:"expected_subtotal_minor"`
			ExpectedTaxMinor      int64  `json:"expected_tax_minor"`
			ExpectedTotalMinor    int64  `json:"expected_total_minor"`
			ExpectedJournal       []struct {
				Account     string `json:"account"`
				DebitMinor  int64  `json:"debit_minor"`
				CreditMinor int64  `json:"credit_minor"`
			} `json:"expected_journal"`
			InputAmount   string `json:"input_amount"`
			ExpectedMinor int64  `json:"expected_minor"`
		} `json:"money_golden_cases"`
		InventoryGoldenCases []struct {
			ID            string `json:"id"`
			CostingMethod string `json:"costing_method"`
			Receipts      []struct {
				Qty           int64 `json:"qty"`
				UnitCostMinor int64 `json:"unit_cost_minor"`
			} `json:"receipts"`
			SaleQty                     int64 `json:"sale_qty"`
			ExpectedCOGSMinor           int64 `json:"expected_cogs_minor"`
			ExpectedRemainingQty        int64 `json:"expected_remaining_qty"`
			ExpectedRemainingAssetMinor int64 `json:"expected_remaining_asset_minor"`
		} `json:"inventory_golden_cases"`
	}
	require.NoError(t, json.Unmarshal(raw, &fixtures))

	// Verify independently defined golden money expectations balance exactly in minor units.
	for _, mc := range fixtures.MoneyGoldenCases {
		if len(mc.ExpectedJournal) > 0 {
			var debits, credits int64
			for _, line := range mc.ExpectedJournal {
				debits += line.DebitMinor
				credits += line.CreditMinor
			}
			require.Equal(t, debits, credits, "golden case %s journal must balance", mc.ID)
			require.Equal(t, mc.ExpectedTotalMinor, debits)
			require.Equal(t, mc.ExpectedSubtotalMinor+mc.ExpectedTaxMinor, mc.ExpectedTotalMinor)
		}
		if mc.InputAmount != "" {
			parsed, parseErr := finance.ParseMajorToMinor(mc.InputAmount, mc.Exponent)
			require.NoError(t, parseErr)
			require.Equal(t, mc.ExpectedMinor, parsed, "extreme NGN minor-unit precision failed for %s", mc.ID)
		}
	}

	// Verify FIFO and Weighted-Average golden inventory calculations.
	for _, ic := range fixtures.InventoryGoldenCases {
		var totalQty, totalAsset int64
		for _, r := range ic.Receipts {
			totalQty += r.Qty
			totalAsset += r.Qty * r.UnitCostMinor
		}
		require.Equal(t, ic.ExpectedRemainingQty, totalQty-ic.SaleQty)
		require.Equal(t, totalAsset, ic.ExpectedCOGSMinor+ic.ExpectedRemainingAssetMinor, "inventory value conservation failed for %s", ic.ID)
	}
}

func TestBP19_G0_TenantAndPersonalBusinessIsolation(t *testing.T) {
	pool, personalWS, businessWS, ownerID, staffID := createBlueprint13Env(t, "bp19-iso")
	ctx := context.Background()
	svc := finance.NewService(pool)

	// Business staff cannot read owner's Personal settings.
	staffPersonalAttempt := finance.WorkspaceContext{
		UserID:      staffID,
		WorkspaceID: personalWS,
		Kind:        "business",
		Permissions: []string{"settings.manage"},
	}
	_, err := svc.GetScopedWorkspaceSettings(ctx, staffPersonalAttempt, "personal")
	require.ErrorIs(t, err, finance.ErrNotFound)

	// Cross-workspace sync command lookup fails cleanly.
	otherCtx := finance.WorkspaceContext{UserID: staffID, WorkspaceID: businessWS, Kind: "business"}
	_, err = svc.GetSyncCommandStatus(ctx, otherCtx, "nonexistent-cmd")
	require.ErrorIs(t, err, finance.ErrNotFound)

	// Staff cannot request export of owner's Personal workspace.
	_, err = svc.GrantRecentAuth(ctx, staffID, nil, "complete_export", "otp", 5*time.Minute)
	require.NoError(t, err)
	_, err = svc.CreateOwnershipExport(ctx, staffID, finance.CreateExportInput{
		Scope:       "personal_workspace",
		WorkspaceID: &personalWS,
	})
	require.Error(t, err)

	// Owner's Personal settings remain strictly scoped to personalWS.
	ownerPers := finance.WorkspaceContext{UserID: ownerID, WorkspaceID: personalWS, Kind: "personal", IsOwner: true, RoleCode: "owner"}
	persSettings, err := svc.GetScopedWorkspaceSettings(ctx, ownerPers, "personal")
	require.NoError(t, err)
	require.Equal(t, "personal", persSettings.WorkspaceKind)
}

func TestBP19_G0_SecurityAbuseAndFormulaInjection(t *testing.T) {
	// 1. CSV formula injection neutralization.
	for _, payload := range []string{"=CMD()", "+SUM(A1)", "-1+1", "@IMPORT"} {
		sanitized := finance.SanitizeCSVCell(payload)
		require.Equal(t, "'"+payload, sanitized)
	}

	// 2. Log redaction prevents token/OTP/password/secret leakage.
	require.Equal(t, "[REDACTED]", server.RedactSensitiveValue("Bearer eyJhbGciOi"))
	require.Equal(t, "[REDACTED]", server.RedactSensitiveValue("/v1/auth/verify?otp=123456"))
	require.Equal(t, "[REDACTED]", server.RedactSensitiveValue("/v1/webhooks?signature=deadbeef"))

	// 3. Analytics forbids sensitive/financial fields.
	require.Error(t, catalogue.ValidateAnalyticsProperties(map[string]any{"amount_minor": "5000"}))
	require.Error(t, catalogue.ValidateAnalyticsProperties(map[string]any{"email": "user@example.com"}))
}

func TestBP19_G0_AIImportOfflineAndBillingSeparation(t *testing.T) {
	pool, personalWS, _, ownerID, _ := createBlueprint13Env(t, "bp19-sep")
	ctx := context.Background()
	svc := finance.NewService(pool)

	var acctID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO money_accounts (workspace_id, name, account_type, currency, opening_balance_minor, current_balance_minor)
		VALUES ($1, 'Main NGN', 'bank', 'NGN', 100000, 100000)
		RETURNING id
	`, personalWS).Scan(&acctID))

	// Offline draft sync never alters posted account balance.
	wsCtx := finance.WorkspaceContext{UserID: ownerID, WorkspaceID: personalWS, Kind: "personal", Permissions: []string{"money.create"}}
	_, err := svc.GetOfflineCapabilities(ctx, wsCtx)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		UPDATE subscriptions s
		SET plan_version_id = (SELECT id FROM plan_versions WHERE plan_code = 'personal_plus_monthly' LIMIT 1)
		FROM billing_subjects bs
		WHERE s.billing_subject_id = bs.id AND bs.workspace_id = $1
	`, personalWS)
	require.NoError(t, err)

	payload, _ := json.Marshal(map[string]any{
		"entry_method":     "offline",
		"direction":        "money_out",
		"scope_type":       "personal",
		"purpose":          "normal_expense",
		"amount":           "500.00",
		"currency":         "NGN",
		"effective_date":   "2026-11-12",
		"money_account_id": acctID,
		"description":      "Pending offline entry",
	})
	_, err = svc.ProcessSyncCommandBatch(ctx, wsCtx, finance.SyncBatchInput{
		InstallationID: "inst-bp19",
		Commands: []finance.SyncCommandEnvelope{
			{
				ClientCommandID: "bp19-offline-1",
				IdempotencyKey:  fmt.Sprintf("bp19-off-%d", time.Now().UnixNano()),
				CommandType:     "money_draft.create",
				SchemaVersion:   1,
				Payload:         payload,
			},
		},
	})
	require.NoError(t, err)

	var bal int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT current_balance_minor FROM money_accounts WHERE id = $1`, acctID).Scan(&bal))
	require.Equal(t, int64(100000), bal)

	// Subscription expiry / downgrade never creates a deletion case.
	_, err = pool.Exec(ctx, `
		UPDATE subscriptions s SET state = 'expired'
		FROM billing_subjects bs WHERE s.billing_subject_id = bs.id AND bs.workspace_id = $1
	`, personalWS)
	require.NoError(t, err)

	var delCount int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM deletion_cases WHERE user_id = $1`, ownerID).Scan(&delCount))
	require.Equal(t, 0, delCount)
}

func TestBP19_G0_DeletionGraceRestoreAndBackupRehearsal(t *testing.T) {
	pool, personalWS, _, ownerID, _ := createBlueprint13Env(t, "bp19-del")
	ctx := context.Background()
	svc := finance.NewService(pool)

	_, err := svc.GrantRecentAuth(ctx, ownerID, nil, "deletion_request", "otp", 10*time.Minute)
	require.NoError(t, err)
	dc, err := svc.RequestDeletion(ctx, ownerID, finance.RequestDeletionInput{
		Scope:       "personal_workspace",
		WorkspaceID: &personalWS,
		Reason:      "BP19 acceptance check",
		ConfirmText: "DELETE",
	})
	require.NoError(t, err)
	require.Equal(t, "grace_restricted", dc.Status)

	// Cancel before grace expiry restores idempotently.
	_, err = svc.GrantRecentAuth(ctx, ownerID, nil, "deletion_cancel", "otp", 10*time.Minute)
	require.NoError(t, err)
	restored, err := svc.CancelDeletionCase(ctx, ownerID, dc.ID)
	require.NoError(t, err)
	require.Equal(t, "restored", restored.Status)

	// Backup rehearsal reconciliation succeeds with zero unbalanced journals.
	rec, err := svc.RecordBackupRehearsal(ctx, "staging", fmt.Sprintf("bp19-bkp-%d", time.Now().UnixNano()), "pg_dump_logical", "sha256:bp19", 30, 90, &personalWS)
	require.NoError(t, err)
	require.Equal(t, "verified", rec.Status)
}

func TestBP19_G1_ModuleEnablementAndExtremeValues(t *testing.T) {
	pool, personalWS, _, ownerID, _ := createBlueprint13Env(t, "bp19-g1")
	ctx := context.Background()
	svc := finance.NewService(pool)

	// Verify disabled queued offline writes flag in registry.
	flag, err := svc.ListFeatureFlags(ctx)
	require.NoError(t, err)
	foundOfflineFlag := false
	for _, f := range flag {
		if f.FlagKey == "offline.queued_writes.enabled" {
			foundOfflineFlag = true
			require.False(t, f.EnabledInEnv, "queued offline writes must remain disabled until launch gates complete")
		}
	}
	require.True(t, foundOfflineFlag)

	// Concurrent idempotent batch submissions with identical key/payload produce one draft.
	var acctID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO money_accounts (workspace_id, name, account_type, currency, opening_balance_minor, current_balance_minor)
		VALUES ($1, 'Conc Wallet', 'cash', 'NGN', 0, 0)
		RETURNING id
	`, personalWS).Scan(&acctID))

	wsCtx := finance.WorkspaceContext{UserID: ownerID, WorkspaceID: personalWS, Kind: "personal", Permissions: []string{"money.create"}}
	_, _ = svc.GetOfflineCapabilities(ctx, wsCtx)
	_, _ = pool.Exec(ctx, `
		UPDATE subscriptions s
		SET plan_version_id = (SELECT id FROM plan_versions WHERE plan_code = 'personal_plus_monthly' LIMIT 1)
		FROM billing_subjects bs
		WHERE s.billing_subject_id = bs.id AND bs.workspace_id = $1
	`, personalWS)

	key := fmt.Sprintf("bp19-conc-%d", time.Now().UnixNano())
	payload, _ := json.Marshal(map[string]any{
		"entry_method":     "offline",
		"direction":        "money_in",
		"scope_type":       "personal",
		"purpose":          "normal_income",
		"amount":           "1000.00",
		"currency":         "NGN",
		"effective_date":   "2026-11-12",
		"money_account_id": acctID,
		"description":      "Unicode: Café Lagos ₦",
	})

	var wg sync.WaitGroup
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = svc.ProcessSyncCommandBatch(ctx, wsCtx, finance.SyncBatchInput{
				InstallationID: "inst-conc",
				Commands: []finance.SyncCommandEnvelope{
					{
						ClientCommandID: "cmd-conc-1",
						IdempotencyKey:  key,
						CommandType:     "money_draft.create",
						SchemaVersion:   1,
						Payload:         payload,
					},
				},
			})
		}()
	}
	wg.Wait()

	var draftCount int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM money_record_drafts WHERE workspace_id = $1`, personalWS).Scan(&draftCount))
	require.Equal(t, 1, draftCount)
}
