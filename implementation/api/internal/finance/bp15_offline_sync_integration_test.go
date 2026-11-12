package finance_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func TestBlueprint15_OfflineCapabilitiesAndLaunchGate(t *testing.T) {
	pool, personalWS, _, ownerID, _ := createBlueprint13Env(t, "bp15-cap")
	ctx := context.Background()
	svc := finance.NewService(pool)

	wsCtx := finance.WorkspaceContext{
		UserID:      ownerID,
		WorkspaceID: personalWS,
		Kind:        "personal",
		Permissions: []string{"money.create", "money.confirm"},
	}

	// Free plan receives read_only offline access.
	t.Setenv("REKORDLY_OFFLINE_MAX_MODE", "")
	manifest, err := svc.GetOfflineCapabilities(ctx, wsCtx)
	require.NoError(t, err)
	require.Equal(t, finance.OfflineManifestVersion, manifest.ManifestVersion)
	require.Equal(t, finance.OfflineModeReadOnly, manifest.OfflineMode)
	require.Equal(t, "draft_review_only", manifest.Commands["money_entry.confirm"].Mode)
	require.Equal(t, "draft_review_only", manifest.Commands["payment.allocate"].Mode)
	require.Equal(t, "online_only", manifest.Commands["billing.checkout"].Mode)
	require.True(t, manifest.ExpiresAt.After(time.Now().UTC()))

	// Upgrade to personal_plus_monthly: launch gate still caps at draft_only.
	_, err = pool.Exec(ctx, `
		UPDATE subscriptions s
		SET plan_version_id = (SELECT id FROM plan_versions WHERE plan_code = 'personal_plus_monthly' LIMIT 1)
		FROM billing_subjects bs
		WHERE s.billing_subject_id = bs.id AND bs.workspace_id = $1
	`, personalWS)
	require.NoError(t, err)
	manifestPlus, err := svc.GetOfflineCapabilities(ctx, wsCtx)
	require.NoError(t, err)
	require.Equal(t, finance.OfflineModeDraftOnly, manifestPlus.OfflineMode)
}

func TestBlueprint15_IdempotencyReplayConflictAndIsolation(t *testing.T) {
	pool, personalWS, businessWS, ownerID, staffID := createBlueprint13Env(t, "bp15-idemp")
	ctx := context.Background()
	svc := finance.NewService(pool)

	wsCtx := finance.WorkspaceContext{
		UserID:      ownerID,
		WorkspaceID: personalWS,
		Kind:        "personal",
		Permissions: []string{"money.create", "money.confirm"},
	}
	_, err := svc.GetOfflineCapabilities(ctx, wsCtx)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		UPDATE subscriptions s
		SET plan_version_id = (SELECT id FROM plan_versions WHERE plan_code = 'personal_plus_monthly' LIMIT 1)
		FROM billing_subjects bs
		WHERE s.billing_subject_id = bs.id AND bs.workspace_id = $1
	`, personalWS)
	require.NoError(t, err)

	var acctID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO money_accounts (workspace_id, name, account_type, currency, opening_balance_minor, current_balance_minor)
		VALUES ($1, 'Cash Wallet', 'cash', 'NGN', 0, 0)
		RETURNING id
	`, personalWS).Scan(&acctID))

	sess, err := svc.CreateSyncSession(ctx, wsCtx, finance.CreateSyncSessionInput{
		InstallationID:      "inst-test-001",
		ClientAppVersion:    "2.0.0",
		ClientSchemaVersion: 1,
		ManifestVersion:     finance.OfflineManifestVersion,
		ClientTimezone:      "Africa/Lagos",
	})
	require.NoError(t, err)
	require.NotEmpty(t, sess.SyncSessionID)

	payload1, _ := json.Marshal(map[string]any{
		"entry_method":     "offline",
		"direction":        "money_out",
		"scope_type":       "personal",
		"purpose":          "normal_expense",
		"amount":           "2500.00",
		"currency":         "NGN",
		"effective_date":   "2026-11-12",
		"money_account_id": acctID,
		"description":      "Offline fuel receipt",
	})
	hash1 := sha256Hex(payload1)

	batchRes, err := svc.ProcessSyncCommandBatch(ctx, wsCtx, finance.SyncBatchInput{
		InstallationID: "inst-test-001",
		SyncSessionID:  sess.SyncSessionID,
		Commands: []finance.SyncCommandEnvelope{
			{
				ClientCommandID: "cmd-001",
				IdempotencyKey:  "off_key_001",
				CommandType:     "money_draft.create",
				SchemaVersion:   1,
				PayloadHash:     hash1,
				Payload:         payload1,
			},
		},
	})
	require.NoError(t, err)
	require.Len(t, batchRes.Results, 1)
	first := batchRes.Results[0]
	require.Equal(t, "confirmed", first.Status, "conflict=%s msg=%s", first.ConflictCode, first.SafeMessage)
	require.False(t, first.Replayed)
	require.NotEmpty(t, first.ServerResourceID)

	// Lost-response retry with exact same key & payload hash -> replay original result, no duplicate.
	retryRes, err := svc.ProcessSyncCommandBatch(ctx, wsCtx, finance.SyncBatchInput{
		InstallationID: "inst-test-001",
		Commands: []finance.SyncCommandEnvelope{
			{
				ClientCommandID: "cmd-001",
				IdempotencyKey:  "off_key_001",
				CommandType:     "money_draft.create",
				SchemaVersion:   1,
				PayloadHash:     hash1,
				Payload:         payload1,
			},
		},
	})
	require.NoError(t, err)
	require.Len(t, retryRes.Results, 1)
	require.Equal(t, "confirmed", retryRes.Results[0].Status)
	require.True(t, retryRes.Results[0].Replayed)
	require.Equal(t, first.ServerResourceID, retryRes.Results[0].ServerResourceID)

	// Verify only 1 draft exists and posted account balance is still 0.
	var draftCount int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM money_record_drafts WHERE workspace_id = $1`, personalWS).Scan(&draftCount))
	require.Equal(t, 1, draftCount)

	var acctBal int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT current_balance_minor FROM money_accounts WHERE id = $1`, acctID).Scan(&acctBal))
	require.Equal(t, int64(0), acctBal)

	// Same idempotency key with different payload hash -> IDEMPOTENCY_CONFLICT.
	payload2, _ := json.Marshal(map[string]any{
		"entry_method":     "offline",
		"direction":        "money_out",
		"scope_type":       "personal",
		"purpose":          "normal_expense",
		"amount":           "9999.00",
		"currency":         "NGN",
		"effective_date":   "2026-11-12",
		"money_account_id": acctID,
		"description":      "Tampered amount",
	})
	conflictRes, err := svc.ProcessSyncCommandBatch(ctx, wsCtx, finance.SyncBatchInput{
		InstallationID: "inst-test-001",
		Commands: []finance.SyncCommandEnvelope{
			{
				ClientCommandID: "cmd-001-tamper",
				IdempotencyKey:  "off_key_001",
				CommandType:     "money_draft.create",
				SchemaVersion:   1,
				PayloadHash:     sha256Hex(payload2),
				Payload:         payload2,
			},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "failed_permanent", conflictRes.Results[0].Status)
	require.Equal(t, "IDEMPOTENCY_CONFLICT", conflictRes.Results[0].ConflictCode)

	// Cross-user / cross-workspace lookup isolation.
	otherUserCtx := finance.WorkspaceContext{UserID: staffID, WorkspaceID: personalWS, Kind: "personal"}
	_, err = svc.GetIdempotencyRecordForSync(ctx, otherUserCtx, "off_key_001")
	require.ErrorIs(t, err, finance.ErrNotFound)

	otherWsCtx := finance.WorkspaceContext{UserID: ownerID, WorkspaceID: businessWS, Kind: "business"}
	_, err = svc.GetSyncCommandStatus(ctx, otherWsCtx, "cmd-001")
	require.ErrorIs(t, err, finance.ErrNotFound)

	completedSess, err := svc.CompleteSyncSession(ctx, wsCtx, sess.SyncSessionID, finance.CompleteSyncSessionInput{
		CommandCount:   1,
		ConfirmedCount: 1,
	})
	require.NoError(t, err)
	require.Equal(t, "completed", completedSess.Status)
}

func TestBlueprint15_DependenciesConflictsAndPermissions(t *testing.T) {
	pool, personalWS, _, ownerID, _ := createBlueprint13Env(t, "bp15-dep")
	ctx := context.Background()
	svc := finance.NewService(pool)

	wsCtx := finance.WorkspaceContext{
		UserID:      ownerID,
		WorkspaceID: personalWS,
		Kind:        "personal",
		Permissions: []string{}, // permission revoked while offline
	}
	_, err := svc.GetOfflineCapabilities(ctx, wsCtx)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		UPDATE subscriptions s
		SET plan_version_id = (SELECT id FROM plan_versions WHERE plan_code = 'personal_plus_monthly' LIMIT 1)
		FROM billing_subjects bs
		WHERE s.billing_subject_id = bs.id AND bs.workspace_id = $1
	`, personalWS)
	require.NoError(t, err)

	// 1. Cycle detection.
	_, err = svc.ProcessSyncCommandBatch(ctx, wsCtx, finance.SyncBatchInput{
		InstallationID: "inst-dep-1",
		Commands: []finance.SyncCommandEnvelope{
			{ClientCommandID: "a", IdempotencyKey: "k-a", CommandType: "money_draft.create", SchemaVersion: 1, Dependencies: []string{"b"}, Payload: []byte(`{}`)},
			{ClientCommandID: "b", IdempotencyKey: "k-b", CommandType: "money_draft.create", SchemaVersion: 1, Dependencies: []string{"a"}, Payload: []byte(`{}`)},
		},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "DEPENDENCY_CYCLE")

	// 2. Permission revoked + dependant blocked + review-only + unsupported schema.
	res, err := svc.ProcessSyncCommandBatch(ctx, wsCtx, finance.SyncBatchInput{
		InstallationID: "inst-dep-1",
		Commands: []finance.SyncCommandEnvelope{
			{
				ClientCommandID: "dep-parent",
				IdempotencyKey:  fmt.Sprintf("k-parent-%d", time.Now().UnixNano()),
				CommandType:     "money_draft.create",
				SchemaVersion:   1,
				Payload:         []byte(`{"direction":"money_out"}`),
			},
			{
				ClientCommandID: "dep-child",
				IdempotencyKey:  fmt.Sprintf("k-child-%d", time.Now().UnixNano()),
				CommandType:     "money_draft.create",
				SchemaVersion:   1,
				Dependencies:    []string{"dep-parent"},
				Payload:         []byte(`{"direction":"money_out"}`),
			},
			{
				ClientCommandID: "alloc-cmd",
				IdempotencyKey:  fmt.Sprintf("k-alloc-%d", time.Now().UnixNano()),
				CommandType:     "payment.allocate",
				SchemaVersion:   1,
				Payload:         []byte(`{}`),
			},
			{
				ClientCommandID: "old-schema-cmd",
				IdempotencyKey:  fmt.Sprintf("k-old-%d", time.Now().UnixNano()),
				CommandType:     "money_draft.create",
				SchemaVersion:   99,
				Payload:         []byte(`{}`),
			},
		},
	})
	require.NoError(t, err)
	require.Len(t, res.Results, 4)

	byID := map[string]finance.SyncCommandResult{}
	for _, r := range res.Results {
		byID[r.ClientCommandID] = r
	}

	require.Equal(t, "needs_review", byID["dep-parent"].Status, "safe_message=%s", byID["dep-parent"].SafeMessage)
	require.Equal(t, "PERMISSION_CHANGED", byID["dep-parent"].ConflictCode)

	require.Equal(t, "dependency_blocked", byID["dep-child"].Status)
	require.Equal(t, "DEPENDENCY_UNRESOLVED", byID["dep-child"].ConflictCode)

	require.Equal(t, "needs_review", byID["alloc-cmd"].Status)
	require.Equal(t, "OFFLINE_COMMAND_NOT_ALLOWED", byID["alloc-cmd"].ConflictCode)

	require.Equal(t, "unsupported_version", byID["old-schema-cmd"].Status)
	require.Equal(t, "COMMAND_SCHEMA_UNSUPPORTED", byID["old-schema-cmd"].ConflictCode)
}
