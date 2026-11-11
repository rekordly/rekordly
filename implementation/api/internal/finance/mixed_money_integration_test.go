package finance_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func createOwnedMixedWorkspaces(t *testing.T, name string) (*pgxpool.Pool, int64, int64, int64) {
	t.Helper()
	pool := testPool(t)
	ctx := context.Background()
	var userID, personalWorkspaceID, businessWorkspaceID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, name+"-owner").Scan(&userID))
	suffix := time.Now().UnixNano()
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('personal', $1, $2, 'NGN', $3) RETURNING id`, name+" personal", fmt.Sprintf("%s-personal-%d", name, suffix), userID).Scan(&personalWorkspaceID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('business', $1, $2, 'NGN', $3) RETURNING id`, name+" business", fmt.Sprintf("%s-business-%d", name, suffix), userID).Scan(&businessWorkspaceID))
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM idempotency_records WHERE actor_user_id = $1 AND operation IN ('confirm_mixed_money_record', 'reimburse_mixed_money')`, userID)
		for _, workspaceID := range []int64{personalWorkspaceID, businessWorkspaceID} {
			_, _ = pool.Exec(ctx, `DELETE FROM outbox_jobs WHERE aggregate_type = 'mixed_money_group' AND payload->>'workspace_id' = $1`, fmt.Sprint(workspaceID))
			_, _ = pool.Exec(ctx, `DELETE FROM audit_events WHERE workspace_id = $1`, workspaceID)
		}
		_, _ = pool.Exec(ctx, `DELETE FROM mixed_money_reimbursements WHERE mixed_money_group_id IN (SELECT id FROM mixed_money_groups WHERE personal_workspace_id = $1 OR business_workspace_id = $1)`, personalWorkspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM mixed_money_groups WHERE personal_workspace_id = $1 OR business_workspace_id = $1`, personalWorkspaceID)
		for _, workspaceID := range []int64{personalWorkspaceID, businessWorkspaceID} {
			_, _ = pool.Exec(ctx, `DELETE FROM money_record_links WHERE workspace_id = $1`, workspaceID)
			_, _ = pool.Exec(ctx, `DELETE FROM money_record_parts WHERE workspace_id = $1`, workspaceID)
			_, _ = pool.Exec(ctx, `DELETE FROM money_records WHERE workspace_id = $1`, workspaceID)
			_, _ = pool.Exec(ctx, `DELETE FROM ledger_lines WHERE workspace_id = $1`, workspaceID)
			_, _ = pool.Exec(ctx, `DELETE FROM ledger_entries WHERE workspace_id = $1`, workspaceID)
			_, _ = pool.Exec(ctx, `DELETE FROM money_transactions WHERE workspace_id = $1`, workspaceID)
			_, _ = pool.Exec(ctx, `DELETE FROM categories WHERE workspace_id = $1`, workspaceID)
			_, _ = pool.Exec(ctx, `DELETE FROM money_accounts WHERE workspace_id = $1`, workspaceID)
			_, _ = pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, workspaceID)
		}
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	})
	return pool, userID, personalWorkspaceID, businessWorkspaceID
}

func TestMixedExpenseAndPartialAtomicReimbursements(t *testing.T) {
	pool, userID, personalWorkspaceID, businessWorkspaceID := createOwnedMixedWorkspaces(t, "mixed-expense")
	svc := finance.NewService(pool)
	ctx := context.Background()
	personalAccount, err := svc.CreateAccount(ctx, personalWorkspaceID, finance.CreateAccountInput{Name: "Personal cash", AccountType: "cash", Currency: "NGN", OpeningBalance: 2_000_000})
	require.NoError(t, err)
	businessAccount, err := svc.CreateAccount(ctx, businessWorkspaceID, finance.CreateAccountInput{Name: "Business bank", AccountType: "bank", Currency: "NGN", OpeningBalance: 2_000_000})
	require.NoError(t, err)
	personalCategory, err := svc.CreateCategory(ctx, personalWorkspaceID, finance.CreateCategoryInput{Name: "Personal data", Direction: "money_out", Scope: "personal", AccountClass: "expense"})
	require.NoError(t, err)
	businessCategory, err := svc.CreateCategory(ctx, businessWorkspaceID, finance.CreateCategoryInput{Name: "Business data", Direction: "money_out", Scope: "business", AccountClass: "expense"})
	require.NoError(t, err)

	confirmed, err := svc.ConfirmMixedMoneyRecord(ctx, userID, personalWorkspaceID, "mixed-expense-key-1", finance.ConfirmMixedMoneyRecordInput{
		PersonalWorkspaceID: personalWorkspaceID, BusinessWorkspaceID: businessWorkspaceID, PayingWorkspaceID: personalWorkspaceID, PayingMoneyAccountID: personalAccount.ID,
		AmountMinor: "1000000", PersonalAmountMinor: "400000", BusinessAmountMinor: "600000", Currency: "NGN", EffectiveDate: "2026-11-10",
		PersonalCategoryID: personalCategory.ID, BusinessCategoryID: businessCategory.ID, Description: "Shared mobile data",
	})
	require.NoError(t, err)
	require.Equal(t, int64(1_000_000), confirmed.Group.TotalAmountMinor)
	require.Equal(t, int64(600_000), confirmed.Group.BusinessAmountMinor)
	require.Equal(t, "open", confirmed.Group.Status)

	var payerPartsTotal int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT coalesce(sum(amount_minor), 0) FROM money_record_parts WHERE money_record_id = $1`, confirmed.PersonalRecord.ID).Scan(&payerPartsTotal))
	require.Equal(t, int64(1_000_000), payerPartsTotal)

	personalAfterPayment, err := svc.GetAccount(ctx, personalWorkspaceID, personalAccount.ID)
	require.NoError(t, err)
	require.Equal(t, int64(1_000_000), personalAfterPayment.CurrentBalanceMinor)
	businessAfterPayment, err := svc.GetAccount(ctx, businessWorkspaceID, businessAccount.ID)
	require.NoError(t, err)
	require.Equal(t, int64(2_000_000), businessAfterPayment.CurrentBalanceMinor)

	firstSettlement, err := svc.ReimburseMixedMoney(ctx, userID, personalWorkspaceID, confirmed.Group.ID, "mixed-reimburse-key-1", finance.ReimburseMixedMoneyInput{
		FromWorkspaceID: businessWorkspaceID, ToWorkspaceID: personalWorkspaceID, FromMoneyAccountID: businessAccount.ID, ToMoneyAccountID: personalAccount.ID,
		AmountMinor: "250000", EffectiveDate: "2026-11-10", ExpectedVersion: confirmed.Group.SettlementVersion,
	})
	require.NoError(t, err)
	require.Equal(t, int64(250_000), firstSettlement.Group.ReimbursedAmountMinor)
	require.Equal(t, int64(350_000), firstSettlement.Group.BusinessAmountMinor-firstSettlement.Group.ReimbursedAmountMinor)
	require.Equal(t, "open", firstSettlement.Group.Status)

	_, err = svc.ReimburseMixedMoney(ctx, userID, personalWorkspaceID, confirmed.Group.ID, "mixed-reimburse-key-too-large", finance.ReimburseMixedMoneyInput{
		FromWorkspaceID: businessWorkspaceID, ToWorkspaceID: personalWorkspaceID, FromMoneyAccountID: businessAccount.ID, ToMoneyAccountID: personalAccount.ID,
		AmountMinor: "350001", EffectiveDate: "2026-11-10", ExpectedVersion: firstSettlement.Group.SettlementVersion,
	})
	require.ErrorIs(t, err, finance.ErrMixedSettlementState)

	var outsiderUserID, outsiderWorkspaceID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ('mixed-outsider') RETURNING id`).Scan(&outsiderUserID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('personal', 'Outsider', $1, 'NGN', $2) RETURNING id`, fmt.Sprintf("mixed-outsider-%d", time.Now().UnixNano()), outsiderUserID).Scan(&outsiderWorkspaceID))
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, outsiderWorkspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, outsiderUserID)
	})
	_, err = svc.ReimburseMixedMoney(ctx, outsiderUserID, outsiderWorkspaceID, confirmed.Group.ID, "mixed-reimburse-key-outsider", finance.ReimburseMixedMoneyInput{ExpectedVersion: firstSettlement.Group.SettlementVersion})
	require.ErrorIs(t, err, finance.ErrNotFound)

	secondSettlement, err := svc.ReimburseMixedMoney(ctx, userID, businessWorkspaceID, confirmed.Group.ID, "mixed-reimburse-key-2", finance.ReimburseMixedMoneyInput{
		FromWorkspaceID: businessWorkspaceID, ToWorkspaceID: personalWorkspaceID, FromMoneyAccountID: businessAccount.ID, ToMoneyAccountID: personalAccount.ID,
		AmountMinor: "350000", EffectiveDate: "2026-11-10", ExpectedVersion: firstSettlement.Group.SettlementVersion,
	})
	require.NoError(t, err)
	require.Equal(t, "settled", secondSettlement.Group.Status)
	require.Equal(t, int64(600_000), secondSettlement.Group.ReimbursedAmountMinor)

	duplicate, err := svc.ReimburseMixedMoney(ctx, userID, personalWorkspaceID, confirmed.Group.ID, "mixed-reimburse-key-2", finance.ReimburseMixedMoneyInput{
		FromWorkspaceID: businessWorkspaceID, ToWorkspaceID: personalWorkspaceID, FromMoneyAccountID: businessAccount.ID, ToMoneyAccountID: personalAccount.ID,
		AmountMinor: "350000", EffectiveDate: "2026-11-10", ExpectedVersion: firstSettlement.Group.SettlementVersion,
	})
	require.NoError(t, err)
	require.True(t, duplicate.WasDuplicate)
	require.Equal(t, secondSettlement.Reimbursement.ID, duplicate.Reimbursement.ID)

	_, err = svc.ReimburseMixedMoney(ctx, userID, personalWorkspaceID, confirmed.Group.ID, "mixed-reimburse-key-3", finance.ReimburseMixedMoneyInput{
		FromWorkspaceID: businessWorkspaceID, ToWorkspaceID: personalWorkspaceID, FromMoneyAccountID: businessAccount.ID, ToMoneyAccountID: personalAccount.ID,
		AmountMinor: "1", EffectiveDate: "2026-11-10", ExpectedVersion: secondSettlement.Group.SettlementVersion,
	})
	require.ErrorIs(t, err, finance.ErrMixedSettlementState)

	personalFinal, err := svc.GetAccount(ctx, personalWorkspaceID, personalAccount.ID)
	require.NoError(t, err)
	require.Equal(t, int64(1_600_000), personalFinal.CurrentBalanceMinor)
	businessFinal, err := svc.GetAccount(ctx, businessWorkspaceID, businessAccount.ID)
	require.NoError(t, err)
	require.Equal(t, int64(1_400_000), businessFinal.CurrentBalanceMinor)

	var unbalanced int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM (SELECT ledger_entry_id FROM ledger_lines WHERE workspace_id IN ($1, $2) GROUP BY ledger_entry_id HAVING sum(debit_minor) <> sum(credit_minor)) AS bad`, personalWorkspaceID, businessWorkspaceID).Scan(&unbalanced))
	require.Zero(t, unbalanced)
}
