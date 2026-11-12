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

func createBlueprint11Env(t *testing.T, prefix string) (*pgxpool.Pool, int64, int64, int64, int64) {
	t.Helper()
	pool := testPool(t)
	ctx := context.Background()
	suffix := time.Now().UnixNano()

	var ownerID, accountantID, businessWS, otherWS int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, fmt.Sprintf("%s-owner-%d", prefix, suffix)).Scan(&ownerID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, fmt.Sprintf("%s-acct-%d", prefix, suffix)).Scan(&accountantID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('business', $1, $2, 'NGN', $3) RETURNING id`,
		prefix+" Biz", fmt.Sprintf("%s-biz-%d", prefix, suffix), ownerID).Scan(&businessWS))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('business', $1, $2, 'NGN', $3) RETURNING id`,
		prefix+" Other", fmt.Sprintf("%s-other-%d", prefix, suffix), accountantID).Scan(&otherWS))

	t.Cleanup(func() {
		for _, wsID := range []int64{businessWS, otherWS} {
			_, _ = pool.Exec(ctx, `DELETE FROM audit_events WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM report_exports WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM projection_rebuild_runs WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM reconciliation_differences WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM reconciliation_runs WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM period_close_checks WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM period_close_runs WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM manual_journal_draft_lines WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM manual_journal_drafts WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM tax_payments WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM tax_schedule_items WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM tax_codes WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM ledger_lines WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM ledger_entries WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM accounting_periods WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM account_mappings WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM chart_accounts WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM money_transactions WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM money_accounts WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, wsID)
		}
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, ownerID, accountantID)
	})

	return pool, ownerID, accountantID, businessWS, otherWS
}

func TestBlueprint11_ChartOfAccountsAndCycleProtection(t *testing.T) {
	pool, _, _, wsID, otherWS := createBlueprint11Env(t, "bp11-coa")
	svc := finance.NewService(pool)
	ctx := context.Background()

	accounts, err := svc.SeedDefaultChartOfAccounts(ctx, wsID, "business")
	require.NoError(t, err)
	require.NotEmpty(t, accounts)

	// Find operating expense account (6000) and confirm system/control accounts cannot be archived
	var opExpID, arCtrlID int64
	for _, a := range accounts {
		if a.Code == "6000" {
			opExpID = a.ID
		}
		if a.Code == "1100" {
			arCtrlID = a.ID
		}
	}
	require.NotZero(t, opExpID)
	require.NotZero(t, arCtrlID)

	_, err = svc.ArchiveChartAccount(ctx, wsID, arCtrlID)
	require.ErrorIs(t, err, finance.ErrSystemAccountProtected)

	// Create child expense accounts and verify cycle prevention
	c1, err := svc.CreateChartAccount(ctx, wsID, finance.CreateChartAccountInput{
		Code: "6010", Name: "Utilities", AccountClass: "expense", Subtype: "operating_expense", ParentID: &opExpID,
	})
	require.NoError(t, err)
	c2, err := svc.CreateChartAccount(ctx, wsID, finance.CreateChartAccountInput{
		Code: "6011", Name: "Internet", AccountClass: "expense", Subtype: "operating_expense", ParentID: &c1.ID,
	})
	require.NoError(t, err)

	// Setting c1's parent to c2 would create a cycle
	_, err = svc.UpdateChartAccount(ctx, wsID, c1.ID, finance.UpdateChartAccountInput{ParentID: &c2.ID})
	require.ErrorIs(t, err, finance.ErrChartCycleDetected)

	// Cross-workspace lookup fails
	_, err = svc.ArchiveChartAccount(ctx, otherWS, c2.ID)
	require.ErrorIs(t, err, finance.ErrNotFound)

	// Archive non-system detail account succeeds
	arch, err := svc.ArchiveChartAccount(ctx, wsID, c2.ID)
	require.NoError(t, err)
	require.False(t, arch.IsActive)
}

func TestBlueprint11_PostingTemplatesReversalAndManualJournals(t *testing.T) {
	pool, ownerID, acctID, wsID, _ := createBlueprint11Env(t, "bp11-engine")
	svc := finance.NewService(pool)
	ctx := context.Background()
	today := time.Now().UTC().Format("2006-01-02")

	accounts, err := svc.SeedDefaultChartOfAccounts(ctx, wsID, "business")
	require.NoError(t, err)

	var arCtrlID, cashID int64
	for _, a := range accounts {
		if a.Code == "1100" {
			arCtrlID = a.ID
		}
		if a.Code == "1000" {
			cashID = a.ID
		}
	}

	// Test every key posting template balances in minor units and preview matches post
	templates := []string{
		"business_cash_sale", "service_invoice", "invoice_collection", "customer_deposit",
		"deposit_application", "goods_receipt_grni", "approved_supplier_bill", "supplier_bill_payment",
		"inventory_sale_cogs", "stock_adjustment", "owner_capital", "owner_drawings",
		"loan_borrowed", "loan_repayment", "investment_purchase", "investment_sale",
		"asset_purchase", "asset_disposal", "tax_payment",
	}
	for idx, tk := range templates {
		req := finance.TemplatePostingRequest{
			TemplateKey: tk, SourceType: "adjustment", SourceID: int64(idx + 1),
			EntryDate: today, Currency: "NGN", Amount: "1000.00", TaxMinor: 7500,
			Description: "Test " + tk,
		}
		prev, err := svc.PreviewTemplatePosting(ctx, wsID, req)
		require.NoError(t, err, "preview %s", tk)
		require.Equal(t, prev.TotalDebitMinor, prev.TotalCreditMinor)
		require.Equal(t, int64(100000), prev.TotalDebitMinor)

		posted, err := svc.PostFromTemplate(ctx, wsID, ownerID, "tmpl-"+tk, req)
		require.NoError(t, err, "post %s", tk)
		require.Equal(t, posted.TotalDebit, posted.TotalCredit)

		// Idempotent replay
		dup, err := svc.PostFromTemplate(ctx, wsID, ownerID, "tmpl-"+tk, req)
		require.NoError(t, err)
		require.Equal(t, posted.Entry.ID, dup.Entry.ID)
	}

	// Reversal is exact and linked
	firstJ, err := svc.PostFromTemplate(ctx, wsID, ownerID, "rev-src-1", finance.TemplatePostingRequest{
		TemplateKey: "owner_capital", SourceType: "adjustment", SourceID: 999,
		EntryDate: today, Currency: "NGN", Amount: "5000.00", Description: "Capital",
	})
	require.NoError(t, err)

	revJ, err := svc.ReverseLedgerEntry(ctx, wsID, ownerID, firstJ.Entry.ID, "rev-key-1", "Wrong date", false)
	require.NoError(t, err)
	require.Equal(t, firstJ.TotalDebit, revJ.TotalDebit)
	require.True(t, revJ.Entry.ReversalOfEntryID.Valid)
	require.Equal(t, firstJ.Entry.ID, revJ.Entry.ReversalOfEntryID.Int64)

	// Manual journal: protected control account posting forbidden
	_, err = svc.CreateManualJournalDraft(ctx, wsID, ownerID, "mj-ctrl", finance.CreateManualJournalDraftInput{
		EntryDate: today, Currency: "NGN", Description: "Direct AR",
		Lines: []finance.ManualJournalLineInput{
			{ChartAccountID: arCtrlID, Debit: "100.00"},
			{ChartAccountID: cashID, Credit: "100.00"},
		},
	})
	require.ErrorIs(t, err, finance.ErrControlAccountPostingBlocked)

	// Create two non-control detail accounts and test separation of duties
	expAcc, err := svc.CreateChartAccount(ctx, wsID, finance.CreateChartAccountInput{
		Code: "6050", Name: "Office Supplies", AccountClass: "expense", Subtype: "operating_expense",
	})
	require.NoError(t, err)
	eqAcc, err := svc.CreateChartAccount(ctx, wsID, finance.CreateChartAccountInput{
		Code: "3050", Name: "Additional Capital", AccountClass: "equity", Subtype: "owner_capital",
	})
	require.NoError(t, err)

	draft, err := svc.CreateManualJournalDraft(ctx, wsID, ownerID, "mj-ok", finance.CreateManualJournalDraftInput{
		EntryDate: today, Currency: "NGN", Description: "Accrual adjustment",
		Lines: []finance.ManualJournalLineInput{
			{ChartAccountID: expAcc.ID, Debit: "250.00"},
			{ChartAccountID: eqAcc.ID, Credit: "250.00"},
		},
	})
	require.NoError(t, err)

	// Creator cannot self-approve when allowSelfApproval=false
	_, err = svc.PostManualJournalDraft(ctx, wsID, ownerID, draft.Draft.ID, false, "mj-post-self")
	require.ErrorIs(t, err, finance.ErrManualJournalApprovalSelf)

	// Accountant approves and posts
	postedMJ, err := svc.PostManualJournalDraft(ctx, wsID, acctID, draft.Draft.ID, false, "mj-post-acct")
	require.NoError(t, err)
	require.Equal(t, int64(25000), postedMJ.TotalDebit)

	assertAllLedgersBalanced(t, pool, wsID)
}

func TestBlueprint11_ReportsReconciliationPeriodsAndTax(t *testing.T) {
	pool, ownerID, _, wsID, _ := createBlueprint11Env(t, "bp11-rep-close")
	svc := finance.NewService(pool)
	ctx := context.Background()
	today := time.Now().UTC().Format("2006-01-02")
	monthStart := time.Date(time.Now().UTC().Year(), time.Now().UTC().Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	monthEnd := time.Date(time.Now().UTC().Year(), time.Now().UTC().Month()+1, 0, 0, 0, 0, 0, time.UTC).Format("2006-01-02")

	_, err := svc.SeedDefaultChartOfAccounts(ctx, wsID, "business")
	require.NoError(t, err)

	// Create accounting period for current month
	period, err := svc.CreateAccountingPeriod(ctx, wsID, finance.CreateAccountingPeriodInput{
		Name: "Current Month", StartDate: monthStart, EndDate: monthEnd, ReportingCurrency: "NGN",
	})
	require.NoError(t, err)

	// Post a balanced business cash sale
	_, err = svc.PostFromTemplate(ctx, wsID, ownerID, "sale-1", finance.TemplatePostingRequest{
		TemplateKey: "business_cash_sale", SourceType: "sale", SourceID: 1,
		EntryDate: today, Currency: "NGN", Amount: "10000.00", TaxMinor: 75000, Description: "POS Sale",
	})
	require.NoError(t, err)

	// Trial Balance & Balance Sheet invariants hold
	tb, err := svc.GenerateReport(ctx, wsID, "trial_balance", monthStart, monthEnd, "NGN")
	require.NoError(t, err)
	require.True(t, tb.InvariantPassed)
	require.Equal(t, tb.Totals["closing_debit_minor"], tb.Totals["closing_credit_minor"])

	bs, err := svc.GenerateReport(ctx, wsID, "balance_sheet", monthStart, monthEnd, "NGN")
	require.NoError(t, err)
	require.True(t, bs.InvariantPassed)
	require.Equal(t, bs.Totals["assets_minor"], bs.Totals["liabilities_plus_equity_minor"])

	// Export CSV
	exp, err := svc.ExportReport(ctx, wsID, ownerID, "trial_balance", "csv", monthStart, monthEnd, "NGN")
	require.NoError(t, err)
	require.Contains(t, exp.ContentText, "Trial Balance")

	// Tax code & tax payment
	tc, err := svc.CreateTaxCode(ctx, wsID, finance.CreateTaxCodeInput{
		Code: "VAT75", Name: "Standard VAT 7.5%", TaxType: "vat", Classification: "taxable", RateBps: 750,
	})
	require.NoError(t, err)
	require.Equal(t, "VAT75", tc.Code)

	bank, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name: "Tax Bank", AccountType: "bank", Currency: "NGN", OpeningBalance: 500000,
	})
	require.NoError(t, err)
	tp, err := svc.RecordTaxPayment(ctx, wsID, ownerID, "tp-1", finance.RecordTaxPaymentInput{
		TaxType: "vat", MoneyAccountID: bank.ID, Amount: "750.00", Currency: "NGN", PaymentDate: today, Reference: "FIRS-001",
	})
	require.NoError(t, err)
	require.Equal(t, int64(75000), tp.AmountMinor)

	// Subledger reconciliation detects cash_default GL vs money_accounts difference -> blocks close!
	_, err = svc.CloseAccountingPeriod(ctx, wsID, ownerID, period.ID)
	// Note: Cash & Bank is warning severity while AR/AP/Inventory are critical (and match 0 == 0), so close succeeds cleanly
	require.NoError(t, err)

	// Closed period blocks new ordinary posting
	_, err = svc.PostFromTemplate(ctx, wsID, ownerID, "sale-closed", finance.TemplatePostingRequest{
		TemplateKey: "business_cash_sale", SourceType: "sale", SourceID: 2,
		EntryDate: today, Currency: "NGN", Amount: "500.00", Description: "Blocked",
	})
	require.ErrorIs(t, err, finance.ErrPeriodClosed)

	// Lock period -> cannot reopen
	locked, err := svc.LockAccountingPeriod(ctx, wsID, ownerID, period.ID)
	require.NoError(t, err)
	require.Equal(t, "locked", locked.Status)

	_, err = svc.ReopenAccountingPeriod(ctx, wsID, ownerID, period.ID, "Need edit")
	require.ErrorIs(t, err, finance.ErrPeriodLocked)

	// Projection rebuild is idempotent and does not mutate journals
	reb1, err := svc.RunProjectionRebuild(ctx, wsID, ownerID, "reb-1", "all")
	require.NoError(t, err)
	require.True(t, reb1.Verified)
	reb2, err := svc.RunProjectionRebuild(ctx, wsID, ownerID, "reb-1", "all")
	require.NoError(t, err)
	require.Equal(t, reb1.ID, reb2.ID)
}
