package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestBudgetLifecycle_CreateUpdateStatusAndOverBudget(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "budget-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	cat, err := svc.CreateCategory(ctx, wsID, finance.CreateCategoryInput{
		Name:         "Software Subscriptions",
		Direction:    "money_out",
		AccountClass: "expense",
		Scope:        "business",
	})
	require.NoError(t, err)

	acc, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:        "Corporate Debit Card",
		AccountType: "bank",
		Currency:    "NGN",
	})
	require.NoError(t, err)

	// 1. Create Budget
	budgetDetail, err := svc.CreateBudget(ctx, wsID, userID, finance.CreateBudgetInput{
		Name:             "November Cloud Budget",
		CategoryID:       &cat.ID,
		Scope:            "business",
		Period:           "monthly",
		AmountMinor:      10000000, // ₦100,000.00
		Currency:         "NGN",
		CurrencyExponent: 2,
		StartDate:        "2026-11-01",
		EndDate:          "2026-11-30",
		Notes:            "Cap for AWS & SaaS",
	})
	require.NoError(t, err)
	require.Equal(t, "November Cloud Budget", budgetDetail.Budget.Name)
	require.Equal(t, int64(10000000), budgetDetail.Budget.AmountMinor)
	require.True(t, budgetDetail.Budget.IsActive)

	// 2. Initial status: zero spending
	statusInit, err := svc.GetBudgetStatus(ctx, wsID, budgetDetail.Budget.ID)
	require.NoError(t, err)
	require.Equal(t, int64(0), statusInit.ActualSpendingMinor)
	require.Equal(t, int64(10000000), statusInit.RemainingMinor)
	require.Equal(t, int64(0), statusInit.UsageBasisPoints)
	require.Equal(t, "0.00%", statusInit.UsagePercentageFormatted)
	require.False(t, statusInit.IsOverBudget)

	// 3. Post an expense within budget period: ₦40,000.00 (4,000,000 minor)
	_, err = svc.CreateTransaction(ctx, wsID, userID, finance.CreateTransactionInput{
		Direction:      "money_out",
		MoneyAccountID: acc.ID,
		CategoryID:     &cat.ID,
		AmountMinor:    4000000,
		EffectiveDate:  "2026-11-10",
		Status:         "posted",
		Notes:          "AWS Hosting",
	})
	require.NoError(t, err)

	// Post an expense OUTSIDE period (October 25) -> should NOT count
	_, err = svc.CreateTransaction(ctx, wsID, userID, finance.CreateTransactionInput{
		Direction:      "money_out",
		MoneyAccountID: acc.ID,
		CategoryID:     &cat.ID,
		AmountMinor:    2000000,
		EffectiveDate:  "2026-10-25",
		Status:         "posted",
		Notes:          "Prior month hosting",
	})
	require.NoError(t, err)

	// Post a DRAFT expense in November -> should NOT count towards posted actuals
	_, err = svc.CreateTransaction(ctx, wsID, userID, finance.CreateTransactionInput{
		Direction:      "money_out",
		MoneyAccountID: acc.ID,
		CategoryID:     &cat.ID,
		AmountMinor:    3000000,
		EffectiveDate:  "2026-11-15",
		Status:         "draft",
		Notes:          "Unconfirmed draft",
	})
	require.NoError(t, err)

	// Check status: 40% usage
	statusMid, err := svc.GetBudgetStatus(ctx, wsID, budgetDetail.Budget.ID)
	require.NoError(t, err)
	require.Equal(t, int64(4000000), statusMid.ActualSpendingMinor)
	require.Equal(t, int64(6000000), statusMid.RemainingMinor)
	require.Equal(t, int64(4000), statusMid.UsageBasisPoints) // 40.00%
	require.Equal(t, "40.00%", statusMid.UsagePercentageFormatted)
	require.False(t, statusMid.IsOverBudget)

	// 4. Post another expense pushing spending to ₦115,000.00 (11,500,000 minor) -> OVER BUDGET!
	_, err = svc.CreateTransaction(ctx, wsID, userID, finance.CreateTransactionInput{
		Direction:      "money_out",
		MoneyAccountID: acc.ID,
		CategoryID:     &cat.ID,
		AmountMinor:    7500000,
		EffectiveDate:  "2026-11-20",
		Status:         "posted",
		Notes:          "Enterprise SaaS annual",
	})
	require.NoError(t, err)

	statusOver, err := svc.GetBudgetStatus(ctx, wsID, budgetDetail.Budget.ID)
	require.NoError(t, err)
	require.Equal(t, int64(11500000), statusOver.ActualSpendingMinor)
	require.Equal(t, int64(-1500000), statusOver.RemainingMinor)
	require.Equal(t, int64(11500), statusOver.UsageBasisPoints) // 115.00%
	require.Equal(t, "115.00%", statusOver.UsagePercentageFormatted)
	require.True(t, statusOver.IsOverBudget)

	// 5. Update Budget (increase limit to ₦150,000.00)
	updated, err := svc.UpdateBudget(ctx, wsID, userID, budgetDetail.Budget.ID, finance.UpdateBudgetInput{
		AmountMinor: 15000000,
		Notes:       "Increased limit to accommodate enterprise license",
	})
	require.NoError(t, err)
	require.Equal(t, int64(15000000), updated.Budget.AmountMinor)

	// Verify status after limit increase: no longer over budget!
	statusAfterUpdate, err := svc.GetBudgetStatus(ctx, wsID, budgetDetail.Budget.ID)
	require.NoError(t, err)
	require.False(t, statusAfterUpdate.IsOverBudget)
	require.Equal(t, int64(3500000), statusAfterUpdate.RemainingMinor)
}

func TestBudget_PlanLimitEnforcement(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "budget-limit-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// Enforce strict limit of 2 active budgets
	customChecker := finance.NewDefaultPlanLimitChecker(db.New(pool), 2)
	svc.SetPlanLimitChecker(customChecker)

	// Budget 1: Success
	_, err := svc.CreateBudget(ctx, wsID, userID, finance.CreateBudgetInput{
		Name:        "Budget Alpha",
		AmountMinor: 1000000,
		StartDate:   "2026-11-01",
		EndDate:     "2026-11-30",
	})
	require.NoError(t, err)

	// Budget 2: Success
	_, err = svc.CreateBudget(ctx, wsID, userID, finance.CreateBudgetInput{
		Name:        "Budget Beta",
		AmountMinor: 2000000,
		StartDate:   "2026-11-01",
		EndDate:     "2026-11-30",
	})
	require.NoError(t, err)

	// Budget 3: Exceeds plan limit!
	_, err = svc.CreateBudget(ctx, wsID, userID, finance.CreateBudgetInput{
		Name:        "Budget Gamma",
		AmountMinor: 3000000,
		StartDate:   "2026-11-01",
		EndDate:     "2026-11-30",
	})
	require.ErrorIs(t, err, finance.ErrPlanLimitExceeded)

	// Reset checker
	svc.SetPlanLimitChecker(nil)
}

func TestBudget_ValidationAndTenantIsolation(t *testing.T) {
	pool := testPool(t)
	wsA, userA := createTestWorkspace(t, pool, "ws-a")
	wsB, _ := createTestWorkspace(t, pool, "ws-b")
	svc := finance.NewService(pool)
	ctx := context.Background()

	catA, err := svc.CreateCategory(ctx, wsA, finance.CreateCategoryInput{
		Name:         "Workspace A Category",
		Direction:    "money_out",
		AccountClass: "expense",
		Scope:        "business",
	})
	require.NoError(t, err)

	// Cannot use Category from Workspace A in Workspace B!
	_, err = svc.CreateBudget(ctx, wsB, userA, finance.CreateBudgetInput{
		Name:        "Cross Workspace Budget",
		CategoryID:  &catA.ID,
		AmountMinor: 5000000,
		StartDate:   "2026-11-01",
		EndDate:     "2026-11-30",
	})
	require.ErrorIs(t, err, finance.ErrForbiddenCategory)

	// Validation: End date < start date rejected
	_, err = svc.CreateBudget(ctx, wsA, userA, finance.CreateBudgetInput{
		Name:        "Invalid Dates",
		AmountMinor: 1000000,
		StartDate:   "2026-12-01",
		EndDate:     "2026-11-01",
	})
	require.ErrorIs(t, err, finance.ErrInvalidBudgetDates)

	// Validation: Non-positive amount rejected
	_, err = svc.CreateBudget(ctx, wsA, userA, finance.CreateBudgetInput{
		Name:        "Zero Amount",
		AmountMinor: 0,
		StartDate:   "2026-11-01",
		EndDate:     "2026-11-30",
	})
	require.ErrorIs(t, err, finance.ErrInvalidBudgetAmount)
}

func TestTaxReadinessReport_OutputInputAndNetVAT(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "tax-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	cust, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Enterprise Tax Client",
		PartyType: "customer",
	})
	require.NoError(t, err)

	// 1. Finalized Invoice: Subtotal ₦100,000 (10,000,000 minor), VAT 7.5% = ₦7,500 (750,000 minor)
	invDetail, err := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID:     cust.ID,
		IssueDate:      "2026-11-05",
		DueDate:        "2026-11-20",
		TaxAmountMinor: 750000,
		Status:         "finalized",
		Items: []finance.InvoiceItemInput{
			{Description: "Enterprise Software License", Quantity: 1, UnitPriceMinor: 10000000},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "finalized", invDetail.Invoice.Status)

	// 2. Draft Invoice: Subtotal ₦50,000, VAT ₦3,750 -> Draft MUST be excluded from tax aggregates!
	_, err = svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID:     cust.ID,
		IssueDate:      "2026-11-07",
		DueDate:        "2026-11-22",
		TaxAmountMinor: 375000,
		Status:         "draft",
		Items: []finance.InvoiceItemInput{
			{Description: "Unconfirmed Quote", Quantity: 1, UnitPriceMinor: 5000000},
		},
	})
	require.NoError(t, err)

	// 3. Voided Invoice -> Voided records MUST be excluded!
	toVoid, err := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID:     cust.ID,
		IssueDate:      "2026-11-08",
		DueDate:        "2026-11-23",
		TaxAmountMinor: 150000,
		Status:         "finalized",
		Items: []finance.InvoiceItemInput{
			{Description: "Erroneous invoice", Quantity: 1, UnitPriceMinor: 2000000},
		},
	})
	require.NoError(t, err)
	_, err = svc.VoidInvoice(ctx, wsID, userID, toVoid.Invoice.ID, "Customer cancellation")
	require.NoError(t, err)

	// 4. Workspace Tax Settings
	taxSet, err := svc.UpdateTaxSettings(ctx, wsID, finance.UpdateTaxSettingsInput{
		TaxIdentificationNumber:   "TIN-NIGERIA-009988",
		DefaultVatRateBasisPoints: int32Ptr(750),
		IsVatRegistered:           boolPtr(true),
	})
	require.NoError(t, err)
	require.True(t, taxSet.IsVatRegistered)
	require.Equal(t, "TIN-NIGERIA-009988", taxSet.TaxIdentificationNumber)

	// 5. Query Tax-Readiness Aggregate Report
	report, err := svc.GetTaxReadinessReport(ctx, wsID, "2026-11-01", "2026-11-30", "business")
	require.NoError(t, err)

	// Output VAT check:
	// Only the 1 finalized active invoice counts:
	// Taxable Subtotal = 10,000,000 minor
	// Output VAT = 750,000 minor
	// Gross Total = 10,750,000 minor
	require.Equal(t, int64(10000000), report.OutputVAT.TaxableSalesMinor)
	require.Equal(t, int64(750000), report.OutputVAT.OutputVatMinor)
	require.Equal(t, int64(10750000), report.OutputVAT.TotalGrossMinor)
	require.Equal(t, int64(1), report.OutputVAT.TotalCount)

	// Net VAT check:
	// Input VAT = 0
	// Net VAT = 750,000 (payable)
	require.Equal(t, int64(750000), report.NetVAT.NetVatPayableMinor)
	require.Equal(t, "payable", report.NetVAT.Status)

	// Settings check
	require.Equal(t, "TIN-NIGERIA-009988", report.TaxSettings.TaxIdentificationNumber)
	require.True(t, report.TaxSettings.IsVatRegistered)
}

func int32Ptr(i int32) *int32 {
	return &i
}

func boolPtr(b bool) *bool {
	return &b
}
