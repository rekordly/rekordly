package finance_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestMoneyCaptureDraftPreviewAndConfirmationAreAtomicAndIdempotent(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "money-capture")
	svc := finance.NewService(pool)
	ctx := context.Background()

	account, err := svc.CreateAccount(ctx, workspaceID, finance.CreateAccountInput{
		Name: "Capture Bank", AccountType: "bank", Currency: "NGN", OpeningBalance: 1_000_000,
	})
	require.NoError(t, err)
	category, err := svc.CreateCategory(ctx, workspaceID, finance.CreateCategoryInput{
		Name: "Capture expense", Direction: "money_out", Scope: "business", AccountClass: "expense",
	})
	require.NoError(t, err)

	draft, err := svc.CreateMoneyRecordDraft(ctx, workspaceID, userID, "business", finance.MoneyRecordDraftInput{
		EntryMethod: "offline", Direction: "money_out", ScopeType: "business", Purpose: "immediate_purchase",
		Amount: "8500.00", Currency: "NGN", EffectiveDate: "2026-11-10", MoneyAccountID: &account.ID,
		CategoryID: &category.ID, Description: "Fuel purchase", ClientCommandID: "offline-capture-001",
	})
	require.NoError(t, err)
	require.Equal(t, int64(850000), draft.AmountMinor)
	require.Equal(t, "saved", draft.State)

	preview, err := svc.PreviewMoneyRecordDraft(ctx, workspaceID, "business", draft.ID)
	require.NoError(t, err)
	require.True(t, preview.CanConfirm)
	require.Contains(t, preview.BalanceEffect, "8500.00")
	require.NotNil(t, preview.AccountingEffects)
	require.NotNil(t, preview.Warnings)
	require.Empty(t, preview.Warnings)

	confirmed, err := svc.ConfirmMoneyRecord(ctx, workspaceID, userID, "business", "capture-confirm-key-001", finance.ConfirmMoneyRecordInput{DraftID: draft.ID, ExpectedVersion: draft.Version})
	require.NoError(t, err)
	require.Equal(t, "confirmed", confirmed.Draft.State)
	require.Equal(t, int64(850000), confirmed.Record.AmountMinor)
	require.Equal(t, "posted", confirmed.Transaction.Status)
	require.Len(t, confirmed.LedgerLines, 2)
	require.Equal(t, confirmed.LedgerLines[0].DebitMinor+confirmed.LedgerLines[1].DebitMinor, confirmed.LedgerLines[0].CreditMinor+confirmed.LedgerLines[1].CreditMinor)
	var auditCount, outboxCount int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM audit_events WHERE workspace_id = $1 AND subject_type = 'money_record' AND subject_id = $2`, workspaceID, fmt.Sprint(confirmed.Record.ID)).Scan(&auditCount))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM outbox_jobs WHERE aggregate_type = 'money_record' AND aggregate_id = $1`, fmt.Sprint(confirmed.Record.ID)).Scan(&outboxCount))
	require.Equal(t, 1, auditCount)
	require.Equal(t, 1, outboxCount)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM outbox_jobs WHERE aggregate_type = 'money_record' AND aggregate_id = $1`, fmt.Sprint(confirmed.Record.ID))
	})

	duplicate, err := svc.ConfirmMoneyRecord(ctx, workspaceID, userID, "business", "capture-confirm-key-001", finance.ConfirmMoneyRecordInput{DraftID: draft.ID, ExpectedVersion: draft.Version})
	require.NoError(t, err)
	require.True(t, duplicate.WasDuplicate)
	require.Equal(t, confirmed.Record.ID, duplicate.Record.ID)

	updatedAccount, err := svc.GetAccount(ctx, workspaceID, account.ID)
	require.NoError(t, err)
	require.Equal(t, int64(150000), updatedAccount.CurrentBalanceMinor)
}

func TestMoneyCaptureAIDraftIsNeedsReviewAndMixedIsNotSilentlyPosted(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "money-capture-ai")
	svc := finance.NewService(pool)
	ctx := context.Background()
	account, err := svc.CreateAccount(ctx, workspaceID, finance.CreateAccountInput{Name: "AI Cash", AccountType: "cash", Currency: "NGN"})
	require.NoError(t, err)

	draft, err := svc.CreateMoneyRecordDraft(ctx, workspaceID, userID, "business", finance.MoneyRecordDraftInput{
		EntryMethod: "ai_assisted", Direction: "money_in", ScopeType: "business", Purpose: "not_yet_known",
		AmountMinor: "250000", Currency: "NGN", EffectiveDate: "2026-11-10", MoneyAccountID: &account.ID,
		AIMetadata: []byte(`{"confidence":"low","provider":"test"}`),
	})
	require.NoError(t, err)
	require.Equal(t, "needs_review", draft.State)

	_, err = svc.CreateMoneyRecordDraft(ctx, workspaceID, userID, "business", finance.MoneyRecordDraftInput{
		Direction: "money_out", ScopeType: "mixed", Purpose: "immediate_purchase", AmountMinor: "100", Currency: "NGN", EffectiveDate: "2026-11-10",
	})
	require.ErrorIs(t, err, finance.ErrMixedRuleNotConfigured)
}

func TestOfflineDraftReplayReturnsOriginalAndRejectsChangedIntent(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "offline-draft-replay")
	svc := finance.NewService(pool)
	ctx := context.Background()
	account, err := svc.CreateAccount(ctx, workspaceID, finance.CreateAccountInput{Name: "Offline cash", AccountType: "cash", Currency: "NGN"})
	require.NoError(t, err)
	category, err := svc.CreateCategory(ctx, workspaceID, finance.CreateCategoryInput{Name: "Offline expense", Direction: "money_out", Scope: "business", AccountClass: "expense"})
	require.NoError(t, err)

	input := finance.MoneyRecordDraftInput{
		EntryMethod: "offline", Direction: "money_out", ScopeType: "business", Purpose: "immediate_purchase",
		Amount: "125.50", Currency: "NGN", EffectiveDate: "2026-11-10", MoneyAccountID: &account.ID,
		CategoryID: &category.ID, Description: "Captured without service", ClientCommandID: "offline-command-replay-001",
	}
	first, err := svc.CreateMoneyRecordDraft(ctx, workspaceID, userID, "business", input)
	require.NoError(t, err)
	loaded, err := svc.GetMoneyRecordDraft(ctx, workspaceID, first.ID)
	require.NoError(t, err)
	require.Equal(t, first.ID, loaded.ID)
	replayed, err := svc.CreateMoneyRecordDraft(ctx, workspaceID, userID, "business", input)
	require.NoError(t, err)
	require.Equal(t, first.ID, replayed.ID)

	input.Amount = "130.00"
	_, err = svc.CreateMoneyRecordDraft(ctx, workspaceID, userID, "business", input)
	require.ErrorIs(t, err, finance.ErrIdempotencyConflict)
	var count int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM money_record_drafts WHERE workspace_id = $1 AND client_command_id = $2`, workspaceID, "offline-command-replay-001").Scan(&count))
	require.Equal(t, 1, count)

	otherWorkspaceID, _ := createTestWorkspace(t, pool, "offline-draft-other-workspace")
	_, err = svc.GetMoneyRecordDraft(ctx, otherWorkspaceID, first.ID)
	require.ErrorIs(t, err, finance.ErrNotFound)
}

func TestMoneyRecordDraftDetailReturnsOnlyItsWorkspaceSupportingData(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "money-draft-supporting-data")
	svc := finance.NewService(pool)
	ctx := context.Background()
	account, err := svc.CreateAccount(ctx, workspaceID, finance.CreateAccountInput{Name: "Supporting cash", AccountType: "cash", Currency: "NGN"})
	require.NoError(t, err)

	draft, err := svc.CreateMoneyRecordDraft(ctx, workspaceID, userID, "business", finance.MoneyRecordDraftInput{
		EntryMethod: "manual", Direction: "money_in", ScopeType: "business", Purpose: "not_yet_known",
		Amount: "2500.00", Currency: "NGN", EffectiveDate: "2026-11-10", MoneyAccountID: &account.ID,
	})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO money_record_draft_links (draft_id, workspace_id, link_type, linked_record_id) VALUES ($1, $2, 'other', 9001)`, draft.ID, workspaceID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO evidence_assets (workspace_id, draft_id, uploaded_by_user_id, asset_id, original_file_name, byte_size, mime_type, status) VALUES ($1, $2, $3, $4, 'receipt.pdf', 1024, 'application/pdf', 'verified')`, workspaceID, draft.ID, userID, fmt.Sprintf("rekordly/evidence/test/%d", draft.ID))
	require.NoError(t, err)

	detail, err := svc.GetMoneyRecordDraftDetail(ctx, workspaceID, draft.ID)
	require.NoError(t, err)
	require.Equal(t, draft.ID, detail.Draft.ID)
	require.Len(t, detail.Links, 1)
	require.Equal(t, "other", detail.Links[0].LinkType)
	require.Len(t, detail.Evidence, 1)
	require.Equal(t, "receipt.pdf", detail.Evidence[0].OriginalFileName)

	accessService := finance.NewService(pool, finance.WithCloudinaryEvidence(finance.CloudinaryEvidenceConfig{CloudName: "demo", APIKey: "key", APISecret: "secret"}))
	access, err := accessService.GetEvidenceAccess(ctx, workspaceID, detail.Evidence[0].ID)
	require.NoError(t, err)
	require.Contains(t, access.URL, "api.cloudinary.com/v1_1/demo/image/download")

	otherWorkspaceID, _ := createTestWorkspace(t, pool, "money-draft-supporting-data-other")
	_, err = svc.GetMoneyRecordDraftDetail(ctx, otherWorkspaceID, draft.ID)
	require.ErrorIs(t, err, finance.ErrNotFound)
	_, err = accessService.GetEvidenceAccess(ctx, otherWorkspaceID, detail.Evidence[0].ID)
	require.ErrorIs(t, err, finance.ErrNotFound)
}
