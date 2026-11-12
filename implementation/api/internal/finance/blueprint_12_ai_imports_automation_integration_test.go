package finance_test

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/ai"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

type bp12MockProvider struct {
	name string
	fn   func(ctx context.Context, req ai.ParseMoneyDraftRequest) (ai.StructuredDraftResponse, error)
}

func (m *bp12MockProvider) Name() string       { return m.name }
func (m *bp12MockProvider) Model() string      { return m.name + "-v1" }
func (m *bp12MockProvider) IsConfigured() bool { return true }
func (m *bp12MockProvider) ParseMoneyDraft(ctx context.Context, req ai.ParseMoneyDraftRequest) (ai.StructuredDraftResponse, error) {
	return m.fn(ctx, req)
}

func createBlueprint12Env(t *testing.T, prefix string) (*pgxpool.Pool, int64, int64, int64, int64) {
	t.Helper()
	pool := testPool(t)
	ctx := context.Background()
	suffix := time.Now().UnixNano()

	var ownerID, otherUserID, wsID, otherWS int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, fmt.Sprintf("%s-u1-%d", prefix, suffix)).Scan(&ownerID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, fmt.Sprintf("%s-u2-%d", prefix, suffix)).Scan(&otherUserID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('business', $1, $2, 'NGN', $3) RETURNING id`,
		prefix+" WS", fmt.Sprintf("%s-ws-%d", prefix, suffix), ownerID).Scan(&wsID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('business', $1, $2, 'NGN', $3) RETURNING id`,
		prefix+" Other", fmt.Sprintf("%s-other-%d", prefix, suffix), otherUserID).Scan(&otherWS))

	t.Cleanup(func() {
		for _, id := range []int64{wsID, otherWS} {
			_, _ = pool.Exec(ctx, `DELETE FROM automation_executions WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM automation_rules WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM failed_jobs WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM job_attempts WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM jobs WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM import_reconciliations WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM import_row_results WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM import_row_matches WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM import_rows WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM import_batches WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM import_mapping_profiles WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM import_files WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM ai_drafts WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM ai_provider_usage_logs WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM ai_usage_reservations WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM ai_requests WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM workspace_ai_quotas WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM ledger_lines WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM ledger_entries WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM money_transactions WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM money_accounts WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM categories WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM accounting_periods WHERE workspace_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, id)
		}
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, ownerID, otherUserID)
	})

	return pool, wsID, otherWS, ownerID, otherUserID
}

func TestBlueprint12_AIDraftAuthorityMultiRecordAndRouting(t *testing.T) {
	pool, wsID, otherWS, ownerID, _ := createBlueprint12Env(t, "bp12-ai")
	ctx := context.Background()

	var cashID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO money_accounts (workspace_id, name, account_type, currency) VALUES ($1, 'Main Bank', 'bank', 'NGN') RETURNING id`, wsID).Scan(&cashID))

	mock := &bp12MockProvider{
		name: "gemini",
		fn: func(ctx context.Context, req ai.ParseMoneyDraftRequest) (ai.StructuredDraftResponse, error) {
			accAlias := "acc_1"
			badAlias := "acc_999"
			return ai.StructuredDraftResponse{
				SchemaVersion: ai.SchemaVersionV1,
				Records: []ai.DraftRecord{
					{
						Scope: "business", Direction: "money_in", Purpose: "business_income",
						AmountMajor: "50000", Currency: "NGN", EffectiveDate: "2026-11-10",
						AccountAlias: &accAlias, Description: "Design fee from Ada",
					},
					{
						Scope: "business", Direction: "money_out", Purpose: "business_direct_expense",
						AmountMajor: "8000", Currency: "NGN", EffectiveDate: "2026-11-10",
						AccountAlias: &badAlias, Description: "Data bundle",
					},
					{
						Scope: "business", Direction: "money_in", Purpose: "invoice_allocation",
						AmountMajor: "7000", Currency: "NGN", EffectiveDate: "2026-11-10",
						AccountAlias: &accAlias, Description: "Yusuf Sulaimon payment",
						ClarificationHints: []string{"partial_payment", "customer_deposit", "existing_invoice"},
					},
				},
			}, nil
		},
	}

	svc := finance.NewService(pool, finance.WithAIOrchestrator(ai.NewOrchestrator(mock, nil, 10*time.Second, 2000, 1500)))
	_, err := svc.SeedDefaultChartOfAccounts(ctx, wsID, "business")
	require.NoError(t, err)

	// 1. Parsing creates drafts only — zero posted transactions or ledger entries.
	res, err := svc.ParseAIMoneyDraft(ctx, wsID, ownerID, "idemp-multi-1", finance.CreateAIMoneyDraftInput{
		Narration: "Received 50000 from Ada, spent 8000 on data, Yusuf paid 7000",
	})
	require.NoError(t, err)
	require.Len(t, res.Drafts, 3)

	var txCount int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM money_transactions WHERE workspace_id = $1`, wsID).Scan(&txCount))
	require.Equal(t, int64(0), txCount)

	// 2. Idempotent replay returns exact same request & drafts without charging extra credit.
	replay, err := svc.ParseAIMoneyDraft(ctx, wsID, ownerID, "idemp-multi-1", finance.CreateAIMoneyDraftInput{
		Narration: "Received 50000 from Ada, spent 8000 on data, Yusuf paid 7000",
	})
	require.NoError(t, err)
	require.Equal(t, res.Request.ID, replay.Request.ID)
	usage, err := svc.GetAIUsage(ctx, wsID, ownerID)
	require.NoError(t, err)
	require.Equal(t, int32(1), usage.CreditsUsed)

	// 3. Draft 0 is valid & ready -> preview + confirm uses deterministic CreateTransaction.
	require.Equal(t, "draft", res.Drafts[0].Status)
	preview, err := svc.PreviewAIDraftEffect(ctx, wsID, res.Drafts[0].ID)
	require.NoError(t, err)
	require.Equal(t, preview.TotalDebitMinor, preview.TotalCreditMinor)

	confirmed, err := svc.ConfirmAIDraft(ctx, wsID, ownerID, res.Drafts[0].ID, "confirm-d0")
	require.NoError(t, err)
	require.Equal(t, int64(5000000), confirmed.Transaction.AmountMinor)

	// 4. Draft 1 had unknown/cross-workspace alias -> rejected & requires review.
	require.Equal(t, "needs_review", res.Drafts[1].Status)
	require.False(t, res.Drafts[1].AccountID.Valid)
	_, err = svc.ConfirmAIDraft(ctx, wsID, ownerID, res.Drafts[1].ID, "confirm-d1")
	require.ErrorIs(t, err, finance.ErrAIDraftRequiresReview)

	// 5. Draft 2 has invoice_allocation intent -> routed to /invoices and blocked from blind confirm.
	require.Equal(t, "needs_review", res.Drafts[2].Status)
	require.Equal(t, "/invoices", res.Drafts[2].RouteToManualFlow.String)
	_, err = svc.ConfirmAIDraft(ctx, wsID, ownerID, res.Drafts[2].ID, "confirm-d2")
	require.ErrorIs(t, err, finance.ErrAIDraftRequiresReview)

	// 6. Cross-workspace isolation: otherWS cannot access wsID draft.
	_, err = svc.ConfirmAIDraft(ctx, otherWS, ownerID, res.Drafts[0].ID, "cross-ws")
	require.ErrorIs(t, err, finance.ErrNotFound)
}

func TestBlueprint12_ConcurrentAICreditLimitEnforcement(t *testing.T) {
	pool, wsID, _, ownerID, _ := createBlueprint12Env(t, "bp12-credit")
	ctx := context.Background()

	_, err := pool.Exec(ctx, `INSERT INTO workspace_ai_quotas (workspace_id, monthly_credit_limit, per_user_daily_limit) VALUES ($1, 3, 20)`, wsID)
	require.NoError(t, err)

	mock := &bp12MockProvider{
		name: "gemini",
		fn: func(ctx context.Context, req ai.ParseMoneyDraftRequest) (ai.StructuredDraftResponse, error) {
			return ai.StructuredDraftResponse{
				SchemaVersion: ai.SchemaVersionV1,
				Records: []ai.DraftRecord{{
					Scope: "personal", Direction: "money_out", Purpose: "personal_expense",
					AmountMajor: "500", Currency: "NGN", EffectiveDate: "2026-11-10", Description: "Snack",
				}},
			}, nil
		},
	}
	svc := finance.NewService(pool, finance.WithAIOrchestrator(ai.NewOrchestrator(mock, nil, 5*time.Second, 2000, 1500)))

	var wg sync.WaitGroup
	var okCount int32
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, pErr := svc.ParseAIMoneyDraft(ctx, wsID, ownerID, fmt.Sprintf("conc-%d", idx), finance.CreateAIMoneyDraftInput{
				Narration: "Spent 500 on snack",
			})
			if pErr == nil {
				atomic.AddInt32(&okCount, 1)
			}
		}(i)
	}
	wg.Wait()
	require.Equal(t, int32(3), okCount)
}

func TestBlueprint12_CSVImportDuplicatesConfirmReconcileUndoAndExport(t *testing.T) {
	pool, wsID, _, ownerID, _ := createBlueprint12Env(t, "bp12-csv")
	ctx := context.Background()

	var accID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO money_accounts (workspace_id, name, account_type, currency) VALUES ($1, 'Import Bank', 'bank', 'NGN') RETURNING id`, wsID).Scan(&accID))

	svc := finance.NewService(pool)

	// Existing transaction to trigger probable_match
	_, err := svc.CreateTransaction(ctx, wsID, ownerID, finance.CreateTransactionInput{
		Direction: "money_out", Status: "posted", AmountMinor: 125050, Currency: "NGN",
		EffectiveDate: "2026-11-05", MoneyAccountID: accID, Notes: "Existing internet bill",
	})
	require.NoError(t, err)

	csvBody := "Date,Description,Amount,ExtID\n" +
		"05/11/2026,New client retainer,10000.00,tx-001\n" +
		"05/11/2026,New client retainer,10000.00,tx-001\n" +
		"05/11/2026,Internet bill,-1250.50,tx-002\n" +
		"bad-date,=HYPERLINK(\"http://evil\",\"bad\"),500.00,tx-003\n"

	up, err := svc.CreateImportBatch(ctx, wsID, ownerID, finance.CreateImportInput{
		Filename: "statement.csv", CSVContent: csvBody, TargetAccountID: &accID, DefaultCurrency: "NGN",
	})
	require.NoError(t, err)
	require.Equal(t, []string{"Date", "Description", "Amount", "ExtID"}, up.Headers)

	mapped, err := svc.SetImportMapping(ctx, wsID, up.Batch.ID, finance.ImportColumnMapping{
		DateColumn: "Date", DescriptionColumn: "Description", AmountColumn: "Amount", ExternalIDColumn: "ExtID",
		DateFormat: "DD/MM/YYYY", DecimalSeparator: ".", SignConvention: "signed", TargetAccountID: accID, DefaultCurrency: "NGN",
	})
	require.NoError(t, err)
	require.Len(t, mapped.Preview, 4)

	analyzed, err := svc.AnalyzeImportBatch(ctx, wsID, up.Batch.ID)
	require.NoError(t, err)
	require.Equal(t, int32(4), analyzed.Batch.TotalRows)
	require.Equal(t, int32(1), analyzed.Batch.ValidCount)
	require.Equal(t, int32(1), analyzed.Batch.DuplicateCount)
	require.Equal(t, int32(1), analyzed.Batch.MatchCount)
	require.Equal(t, int32(1), analyzed.Batch.InvalidCount)
	require.NotNil(t, analyzed.Reconciliation)
	require.True(t, analyzed.Reconciliation.Reconciled)

	// Confirm posts only the 1 draft_ready row, and retrying does not duplicate it.
	confirmed, err := svc.ConfirmImportBatch(ctx, wsID, ownerID, up.Batch.ID, nil)
	require.NoError(t, err)
	require.Equal(t, int32(1), confirmed.Batch.PostedCount)

	retried, err := svc.ConfirmImportBatch(ctx, wsID, ownerID, up.Batch.ID, nil)
	require.NoError(t, err)
	require.Equal(t, int32(1), retried.Batch.PostedCount)

	// Formula-injection protection on failure export.
	failCSV, err := svc.ExportImportBatchFailuresCSV(ctx, wsID, up.Batch.ID)
	require.NoError(t, err)
	require.Contains(t, failCSV, "'=HYPERLINK")

	// Undo preview & execute reverses posted record without hard-deleting.
	undoPrev, err := svc.UndoImportBatch(ctx, wsID, ownerID, up.Batch.ID, true)
	require.NoError(t, err)
	require.Equal(t, 1, undoPrev.EligibleCount)

	undoDone, err := svc.UndoImportBatch(ctx, wsID, ownerID, up.Batch.ID, false)
	require.NoError(t, err)
	require.Equal(t, 1, undoDone.ReversedCount)

	// Locked period blocks undo when applicable.
	var txStatus string
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM money_transactions WHERE workspace_id = $1 AND reference = $2`, wsID, fmt.Sprintf("import-b%d-r1", up.Batch.ID)).Scan(&txStatus))
	require.Equal(t, "voided", txStatus)
}

func TestBlueprint12_JobsConcurrencyDeadLetterAndAutomation(t *testing.T) {
	pool, wsID, _, ownerID, _ := createBlueprint12Env(t, "bp12-jobs")
	ctx := context.Background()
	svc := finance.NewService(pool)

	// Insert a job with unsupported type & max_attempts=1 so it enters dead_letter + failed_jobs.
	var jobID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO jobs (workspace_id, user_id, job_type, source_type, source_id, payload, max_attempts, timeout_seconds)
		VALUES ($1, $2, 'unsupported_test_job', 'test', 1, '{}', 1, 10) RETURNING id`, wsID, ownerID).Scan(&jobID))

	// Two concurrent workers try to claim; only one claims & dead-letters it.
	var claimedSum int32
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			did, err := svc.ClaimAndExecuteNextJob(ctx, fmt.Sprintf("w-%d", idx))
			require.NoError(t, err)
			if did {
				atomic.AddInt32(&claimedSum, 1)
			}
		}(i)
	}
	wg.Wait()
	require.Equal(t, int32(1), claimedSum)

	failed, err := svc.ListFailedJobs(ctx, wsID)
	require.NoError(t, err)
	require.Len(t, failed, 1)
	require.Equal(t, jobID, failed[0].JobID)

	retried, err := svc.RetryFailedJob(ctx, wsID, ownerID, jobID)
	require.NoError(t, err)
	require.Equal(t, "queued", retried.State)

	// Deterministic automation rule: versioned, idempotent, alert-only.
	rule, err := svc.UpsertAutomationRule(ctx, wsID, ownerID, "inv-due", finance.UpsertAutomationRuleInput{
		Name: "Invoice due reminder", RuleType: "invoice_due_reminder", IsEnabled: true,
	})
	require.NoError(t, err)
	require.Equal(t, int32(1), rule.Version)

	execRes, err := svc.RunAutomationRule(ctx, wsID, "inv-due")
	require.NoError(t, err)
	require.Equal(t, "succeeded", execRes.Status)
}
