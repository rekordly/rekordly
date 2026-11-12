package finance_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func createPersonalAndBusinessEnv(t *testing.T, prefix string) (*pgxpool.Pool, int64, int64, int64, int64) {
	t.Helper()
	pool := testPool(t)
	ctx := context.Background()
	suffix := time.Now().UnixNano()

	var ownerID, memberID, personalWS, businessWS int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, fmt.Sprintf("%s-owner-%d", prefix, suffix)).Scan(&ownerID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, fmt.Sprintf("%s-member-%d", prefix, suffix)).Scan(&memberID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('personal', $1, $2, 'NGN', $3) RETURNING id`,
		prefix+" Personal", fmt.Sprintf("%s-pers-%d", prefix, suffix), ownerID).Scan(&personalWS))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('business', $1, $2, 'NGN', $3) RETURNING id`,
		prefix+" Business", fmt.Sprintf("%s-biz-%d", prefix, suffix), ownerID).Scan(&businessWS))

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM owner_transfer_groups WHERE owner_user_id = $1`, ownerID)
		for _, wsID := range []int64{personalWS, businessWS} {
			_, _ = pool.Exec(ctx, `DELETE FROM budget_alert_events WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM budget_versions WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM budget_lines WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM budgets WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM loan_schedule_items WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM loan_events WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM loans WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM investment_valuations WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM investment_events WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM investments WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM asset_valuations WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM asset_events WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM assets WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM personal_tags WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM ledger_lines WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM ledger_entries WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM money_transactions WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM categories WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM money_accounts WHERE workspace_id = $1`, wsID)
			_, _ = pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, wsID)
		}
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, ownerID, memberID)
	})

	return pool, ownerID, memberID, personalWS, businessWS
}

func assertAllLedgersBalanced(t *testing.T, pool *pgxpool.Pool, workspaceIDs ...int64) {
	t.Helper()
	var unbalanced int
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT count(*) FROM (
			SELECT ledger_entry_id FROM ledger_lines
			WHERE workspace_id = ANY($1)
			GROUP BY ledger_entry_id
			HAVING sum(debit_minor) <> sum(credit_minor)
		) bad`, workspaceIDs).Scan(&unbalanced))
	require.Equal(t, 0, unbalanced, "all ledger entries must balance")
}

func TestBlueprint10_AccountsOpeningBalanceAndCategories(t *testing.T) {
	pool, ownerID, _, personalWS, businessWS := createPersonalAndBusinessEnv(t, "bp10-acc")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// Creating a Personal account must create zero balance even if opening_balance is passed
	acc, err := svc.CreatePersonalAccount(ctx, personalWS, finance.CreateAccountInput{
		Name:           "GTBank Savings",
		AccountType:    "bank",
		Currency:       "NGN",
		OpeningBalance: 99999,
	})
	require.NoError(t, err)
	require.Equal(t, int64(0), acc.CurrentBalanceMinor)

	// Card/credit account supported
	card, err := svc.CreatePersonalAccount(ctx, personalWS, finance.CreateAccountInput{
		Name:        "Visa Credit",
		AccountType: "card",
		Currency:    "NGN",
	})
	require.NoError(t, err)
	require.Equal(t, "card", card.AccountType)

	// Opening balance command is idempotent and balanced against equity, not income/expense
	today := time.Now().UTC().Format("2006-01-02")
	ob1, err := svc.RecordAccountOpeningBalance(ctx, personalWS, ownerID, acc.ID, "ob-key-1", finance.OpeningBalanceInput{
		Amount:   "5000.00",
		AsOfDate: today,
		Note:     "Initial bank balance",
	})
	require.NoError(t, err)
	ob2, err := svc.RecordAccountOpeningBalance(ctx, personalWS, ownerID, acc.ID, "ob-key-1", finance.OpeningBalanceInput{
		Amount:   "5000.00",
		AsOfDate: today,
	})
	require.NoError(t, err)
	require.Equal(t, ob1.ID, ob2.ID)

	updatedAcc, err := svc.GetAccount(ctx, personalWS, acc.ID)
	require.NoError(t, err)
	require.Equal(t, int64(500000), updatedAcc.CurrentBalanceMinor)

	// Cross-workspace isolation: businessWS cannot touch personalWS account
	_, err = svc.ArchivePersonalAccount(ctx, businessWS, acc.ID, true)
	require.ErrorIs(t, err, finance.ErrNotFound)

	// Archive with non-zero balance returns warning
	archRes, err := svc.ArchivePersonalAccount(ctx, personalWS, acc.ID, true)
	require.NoError(t, err)
	require.False(t, archRes.Account.IsActive)
	require.NotEmpty(t, archRes.Warning)

	// Seed default categories and tags
	cats, err := svc.SeedDefaultPersonalCategories(ctx, personalWS)
	require.NoError(t, err)
	require.NotEmpty(t, cats)

	tag, err := svc.CreatePersonalTag(ctx, personalWS, finance.CreatePersonalTagInput{Name: "vacation", Color: "#009e10"})
	require.NoError(t, err)
	require.Equal(t, "vacation", tag.Name)

	assertAllLedgersBalanced(t, pool, personalWS)
}

func TestBlueprint10_DashboardBudgetsAndAlertDeduplication(t *testing.T) {
	pool, ownerID, _, personalWS, _ := createPersonalAndBusinessEnv(t, "bp10-dash-bud")
	svc := finance.NewService(pool)
	ctx := context.Background()
	today := time.Now().UTC().Format("2006-01-02")
	monthStart := time.Now().UTC().AddDate(0, 0, -time.Now().UTC().Day()+1).Format("2006-01-02")
	monthEnd := time.Now().UTC().AddDate(0, 1, -time.Now().UTC().Day()).Format("2006-01-02")

	cash, err := svc.CreatePersonalAccount(ctx, personalWS, finance.CreateAccountInput{Name: "Wallet", AccountType: "cash", Currency: "NGN"})
	require.NoError(t, err)
	bank, err := svc.CreatePersonalAccount(ctx, personalWS, finance.CreateAccountInput{Name: "Bank", AccountType: "bank", Currency: "NGN"})
	require.NoError(t, err)

	_, err = svc.RecordAccountOpeningBalance(ctx, personalWS, ownerID, cash.ID, "ob-cash", finance.OpeningBalanceInput{
		Amount: "10000.00", AsOfDate: today,
	})
	require.NoError(t, err)

	foodParent, err := svc.CreateCategory(ctx, personalWS, finance.CreateCategoryInput{
		Name: "Food", Direction: "money_out", Scope: "personal", AccountClass: "expense",
	})
	require.NoError(t, err)
	salaryCat, err := svc.CreateCategory(ctx, personalWS, finance.CreateCategoryInput{
		Name: "Salary", Direction: "money_in", Scope: "personal", AccountClass: "income",
	})
	require.NoError(t, err)

	// Record 1000 income + 600 food expense + 500 own-account transfer
	_, err = svc.CreateTransaction(ctx, personalWS, ownerID, finance.CreateTransactionInput{
		Direction: "money_in", AmountMinor: 100000, Currency: "NGN", EffectiveDate: today,
		MoneyAccountID: bank.ID, CategoryID: &salaryCat.ID, Purpose: "salary", Status: "posted", IdempotencyKey: "tx-inc-1",
	})
	require.NoError(t, err)

	_, err = svc.CreateTransaction(ctx, personalWS, ownerID, finance.CreateTransactionInput{
		Direction: "money_out", AmountMinor: 60000, Currency: "NGN", EffectiveDate: today,
		MoneyAccountID: cash.ID, CategoryID: &foodParent.ID, Purpose: "groceries", Status: "posted", IdempotencyKey: "tx-exp-1",
	})
	require.NoError(t, err)

	_, err = svc.CreateTransaction(ctx, personalWS, ownerID, finance.CreateTransactionInput{
		Direction: "transfer", AmountMinor: 50000, Currency: "NGN", EffectiveDate: today,
		MoneyAccountID: cash.ID, DestinationAccountID: &bank.ID, Purpose: "transfer", Status: "posted", IdempotencyKey: "tx-trf-1",
	})
	require.NoError(t, err)

	// Create a borrowed loan of 2000 (cash inflow, NOT income)
	_, err = svc.OpenBorrowedLoan(ctx, personalWS, ownerID, "loan-in-1", finance.CreateLoanInput{
		CounterpartyName: "Friend", Principal: "2000.00", Currency: "NGN", StartDate: today, MoneyAccountID: &bank.ID,
	})
	require.NoError(t, err)

	// Create a budget of 1000 for Food (actual is 600 -> 60% -> crosses 50% threshold!)
	bud, err := svc.CreatePersonalBudget(ctx, personalWS, ownerID, "bud-1", finance.CreatePersonalBudgetInput{
		Name: "Monthly Food", CategoryID: &foodParent.ID, Period: "monthly",
		Amount: "1000.00", IncomeGoal: "5000.00", Currency: "NGN",
		StartDate: monthStart, EndDate: monthEnd,
	})
	require.NoError(t, err)
	require.Equal(t, int64(60000), bud.ActualSpendingMinor)
	require.Equal(t, int64(40000), bud.RemainingMinor)

	// Evaluate alerts twice -> 50% alert must be deduplicated (only 1 alert row)
	alerts1, err := svc.EvaluatePersonalBudgetAlerts(ctx, personalWS, bud.Budget.ID)
	require.NoError(t, err)
	require.Len(t, alerts1, 1)
	require.Equal(t, int32(50), alerts1[0].ThresholdPercent)

	alerts2, err := svc.EvaluatePersonalBudgetAlerts(ctx, personalWS, bud.Budget.ID)
	require.NoError(t, err)
	require.Len(t, alerts2, 1)

	// Copy budget to next period
	copied, err := svc.CopyPersonalBudget(ctx, personalWS, ownerID, bud.Budget.ID, "bud-copy-1", finance.CopyBudgetInput{
		StartDate: monthStart, EndDate: monthEnd,
	})
	require.NoError(t, err)
	require.Equal(t, "draft", copied.Budget.Status)

	// Verify Dashboard separates cash flow from income/expense
	dash, err := svc.GetPersonalDashboard(ctx, personalWS, monthStart, monthEnd, "NGN")
	require.NoError(t, err)
	require.Equal(t, int64(300000), dash.CashInflowMinor) // 1000 salary + 2000 borrowed loan
	require.Equal(t, int64(60000), dash.CashOutflowMinor) // 600 food (transfer excluded!)
	require.Equal(t, int64(100000), dash.IncomeMinor)     // 1000 salary only (loan excluded!)
	require.Equal(t, int64(60000), dash.ExpenseMinor)     // 600 food

	assertAllLedgersBalanced(t, pool, personalWS)
}

func TestBlueprint10_LoansRepaymentConcurrencyAndReversal(t *testing.T) {
	pool, ownerID, _, personalWS, _ := createPersonalAndBusinessEnv(t, "bp10-loan")
	svc := finance.NewService(pool)
	ctx := context.Background()
	today := time.Now().UTC().Format("2006-01-02")

	bank, err := svc.CreatePersonalAccount(ctx, personalWS, finance.CreateAccountInput{Name: "Bank", AccountType: "bank", Currency: "NGN"})
	require.NoError(t, err)
	_, err = svc.RecordAccountOpeningBalance(ctx, personalWS, ownerID, bank.ID, "ob-loan-bank", finance.OpeningBalanceInput{
		Amount: "10000.00", AsOfDate: today,
	})
	require.NoError(t, err)

	// Lent money (outflow, not expense)
	lent, err := svc.LendMoney(ctx, personalWS, ownerID, "lent-1", finance.CreateLoanInput{
		CounterpartyName: "Bob", Principal: "1000.00", Currency: "NGN", StartDate: today, MoneyAccountID: &bank.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(100000), lent.Loan.OutstandingPrincipalMinor)

	// Component mismatch rejected
	_, err = svc.RecordLoanRepayment(ctx, personalWS, ownerID, "rep-bad", finance.RecordLoanRepaymentInput{
		LoanID: lent.Loan.ID, MoneyAccountID: bank.ID, EffectiveDate: today,
		TotalAmount: "500.00", Principal: "400.00", Interest: "50.00", Fee: "0.00",
	})
	require.ErrorIs(t, err, finance.ErrLoanComponentsMismatch)

	// Concurrent repayments: two goroutines each try to repay 600.00 principal on a 1000.00 loan;
	// exactly one must succeed and the other must fail with ErrLoanBalanceInsufficient!
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, errs[idx] = svc.RecordLoanRepayment(ctx, personalWS, ownerID, fmt.Sprintf("conc-rep-%d", idx), finance.RecordLoanRepaymentInput{
				LoanID: lent.Loan.ID, MoneyAccountID: bank.ID, EffectiveDate: today,
				TotalAmount: "650.00", Principal: "600.00", Interest: "50.00", Fee: "0.00",
			})
		}(i)
	}
	wg.Wait()

	successCount := 0
	insufficientCount := 0
	for _, e := range errs {
		if e == nil {
			successCount++
		} else if e == finance.ErrLoanBalanceInsufficient {
			insufficientCount++
		}
	}
	require.Equal(t, 1, successCount)
	require.Equal(t, 1, insufficientCount)

	// Reverse the successful repayment -> restores outstanding principal to 1000.00
	afterRep, err := svc.GetPersonalLoanDetail(ctx, personalWS, lent.Loan.ID)
	require.NoError(t, err)
	var repEventID int64
	for _, ev := range afterRep.Events {
		if ev.EventType == "repayment" && !ev.IsReversed {
			repEventID = ev.ID
			break
		}
	}
	require.NotZero(t, repEventID)

	afterRev, err := svc.ReverseLoanEvent(ctx, personalWS, ownerID, lent.Loan.ID, repEventID, "wrong amount")
	require.NoError(t, err)
	require.Equal(t, int64(100000), afterRev.Loan.OutstandingPrincipalMinor)

	assertAllLedgersBalanced(t, pool, personalWS)
}

func TestBlueprint10_InvestmentsAndAssets(t *testing.T) {
	pool, ownerID, _, personalWS, _ := createPersonalAndBusinessEnv(t, "bp10-inv-ast")
	svc := finance.NewService(pool)
	ctx := context.Background()
	today := time.Now().UTC().Format("2006-01-02")

	bank, err := svc.CreatePersonalAccount(ctx, personalWS, finance.CreateAccountInput{Name: "Bank", AccountType: "bank", Currency: "NGN"})
	require.NoError(t, err)
	_, err = svc.RecordAccountOpeningBalance(ctx, personalWS, ownerID, bank.ID, "ob-inv-bank", finance.OpeningBalanceInput{
		Amount: "50000.00", AsOfDate: today,
	})
	require.NoError(t, err)

	// Investment: shell -> purchase -> manual valuation -> income -> disposal
	inv, err := svc.CreateInvestment(ctx, personalWS, ownerID, "inv-1", finance.CreateInvestmentInput{
		Name: "T-Bills", InvestmentType: "fixed_income", InstitutionName: "Stanbic", Currency: "NGN",
	})
	require.NoError(t, err)

	inv, err = svc.RecordInvestmentEvent(ctx, personalWS, ownerID, "inv-ev-1", finance.RecordInvestmentEventInput{
		InvestmentID: inv.Investment.ID, EventType: "purchase", EffectiveDate: today,
		Amount: "10000.00", UnitsDelta: "100", MoneyAccountID: &bank.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1000000), inv.Investment.CostBasisMinor)

	inv, err = svc.RecordInvestmentValuation(ctx, personalWS, ownerID, inv.Investment.ID, finance.CreateValuationInput{
		ValuationDate: today, Value: "11200.00", Source: "user_manual",
	})
	require.NoError(t, err)
	require.Equal(t, int64(1000000), inv.Investment.CostBasisMinor) // cost basis untouched!
	require.True(t, inv.Investment.LatestManualValueMinor.Valid)
	require.Equal(t, int64(1120000), inv.Investment.LatestManualValueMinor.Int64)

	// Asset: shell -> acquisition -> valuation -> disposal -> second disposal blocked
	ast, err := svc.CreatePersonalAsset(ctx, personalWS, ownerID, "ast-1", finance.CreateAssetInput{
		Name: "MacBook Pro", AssetType: "electronics_equipment", Currency: "NGN",
	})
	require.NoError(t, err)

	ast, err = svc.AcquirePersonalAsset(ctx, personalWS, ownerID, "ast-acq-1", finance.AcquireAssetInput{
		AssetID: ast.Asset.ID, AcquisitionDate: today, Cost: "2000.00", MoneyAccountID: &bank.ID,
	})
	require.NoError(t, err)
	require.Equal(t, "active", ast.Asset.Status)

	ast, err = svc.DisposePersonalAsset(ctx, personalWS, ownerID, "ast-disp-1", finance.DisposeAssetInput{
		AssetID: ast.Asset.ID, DisposalDate: today, Proceeds: "1500.00", DisposalCost: "50.00", MoneyAccountID: bank.ID,
	})
	require.NoError(t, err)
	require.Equal(t, "disposed", ast.Asset.Status)

	_, err = svc.DisposePersonalAsset(ctx, personalWS, ownerID, "ast-disp-2", finance.DisposeAssetInput{
		AssetID: ast.Asset.ID, DisposalDate: today, Proceeds: "100.00", MoneyAccountID: bank.ID,
	})
	require.ErrorIs(t, err, finance.ErrAssetAlreadyDisposed)

	assertAllLedgersBalanced(t, pool, personalWS)
}

func TestBlueprint10_OwnerTransfersAndAllSummaryElimination(t *testing.T) {
	pool, ownerID, memberID, personalWS, businessWS := createPersonalAndBusinessEnv(t, "bp10-owner-trf")
	svc := finance.NewService(pool)
	ctx := context.Background()
	today := time.Now().UTC().Format("2006-01-02")

	// Create an invited business workspace owned by someone else (memberID)
	var invitedWS int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id) VALUES ('business', 'Invited Biz', $1, 'NGN', $2) RETURNING id`,
		fmt.Sprintf("invited-%d", time.Now().UnixNano()), memberID).Scan(&invitedWS))
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, invitedWS)
	})

	pAcc, err := svc.CreatePersonalAccount(ctx, personalWS, finance.CreateAccountInput{Name: "Personal Bank", AccountType: "bank", Currency: "NGN"})
	require.NoError(t, err)
	_, err = svc.RecordAccountOpeningBalance(ctx, personalWS, ownerID, pAcc.ID, "ob-p", finance.OpeningBalanceInput{Amount: "10000.00", AsOfDate: today})
	require.NoError(t, err)

	bAcc, err := svc.CreateAccount(ctx, businessWS, finance.CreateAccountInput{Name: "Business Bank", AccountType: "bank", Currency: "NGN"})
	require.NoError(t, err)

	// Missing purpose rejected
	_, err = svc.TransferBetweenSpaces(ctx, ownerID, "trf-bad-purpose", finance.OwnerTransferInput{
		FromWorkspaceID: personalWS, ToWorkspaceID: businessWS, FromMoneyAccountID: pAcc.ID, ToMoneyAccountID: bAcc.ID,
		Purpose: "", Amount: "3000.00", Currency: "NGN", EffectiveDate: today,
	})
	require.ErrorIs(t, err, finance.ErrOwnerTransferPurpose)

	// Valid atomic owner capital contribution
	res, err := svc.TransferBetweenSpaces(ctx, ownerID, "trf-cap-1", finance.OwnerTransferInput{
		FromWorkspaceID: personalWS, ToWorkspaceID: businessWS, FromMoneyAccountID: pAcc.ID, ToMoneyAccountID: bAcc.ID,
		Purpose: "owner_capital_contribution", Amount: "3000.00", Currency: "NGN", EffectiveDate: today,
	})
	require.NoError(t, err)
	require.False(t, res.WasDuplicate)

	// Idempotent replay returns duplicate
	dup, err := svc.TransferBetweenSpaces(ctx, ownerID, "trf-cap-1", finance.OwnerTransferInput{
		FromWorkspaceID: personalWS, ToWorkspaceID: businessWS, FromMoneyAccountID: pAcc.ID, ToMoneyAccountID: bAcc.ID,
		Purpose: "owner_capital_contribution", Amount: "3000.00", Currency: "NGN", EffectiveDate: today,
	})
	require.NoError(t, err)
	require.True(t, dup.WasDuplicate)
	require.Equal(t, res.Group.ID, dup.Group.ID)

	// All summary excludes invitedWS and eliminates the 3000.00 mirrored owner transfer
	summary, err := svc.GetAllOwnerSummary(ctx, ownerID, today, today)
	require.NoError(t, err)
	require.Len(t, summary.Workspaces, 2)
	require.Len(t, summary.CombinedByCurrency, 1)
	comb := summary.CombinedByCurrency[0]
	require.Equal(t, int64(300000), comb.EliminatedTransferMinor)
	require.Equal(t, int64(0), comb.NetCashInflowMinor)
	require.Equal(t, int64(0), comb.NetCashOutflowMinor)
	require.Equal(t, int64(1000000), comb.CombinedCashMinor)

	assertAllLedgersBalanced(t, pool, personalWS, businessWS)
}
