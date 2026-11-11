package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestBankReconciliationLifecycle_MatchBalanceGuardAndComplete(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "recon-test")
	svc := finance.NewService(pool)
	reconSvc := finance.NewBankReconciliationService(pool, db.New(pool))
	ctx := context.Background()

	// Create money account with NGN 50,000.00 balance (5,000,000 minor)
	acct, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:           "GTBank Settlement",
		AccountType:    "bank",
		Currency:       "NGN",
		OpeningBalance: 5000000,
		IsActive:       true,
	})
	require.NoError(t, err)

	// 1. Mismatched reconciliation must refuse completion
	unbalanced, err := reconSvc.StartReconciliation(ctx, wsID, finance.StartReconciliationInput{
		MoneyAccountID:        acct.ID,
		StatementDate:         "2026-11-11",
		StatementBalanceMinor: 4500000,
		ReconciliationType:    "bank",
	})
	require.NoError(t, err)
	require.Equal(t, int64(-500000), unbalanced.DifferenceMinor)

	_, err = reconSvc.CompleteReconciliation(ctx, wsID, userID, unbalanced.ID)
	require.ErrorIs(t, err, finance.ErrReconciliationUnbalanced)

	// 2. Balanced reconciliation completes cleanly
	balanced, err := reconSvc.StartReconciliation(ctx, wsID, finance.StartReconciliationInput{
		MoneyAccountID:        acct.ID,
		StatementDate:         "2026-11-11",
		StatementBalanceMinor: 5000000,
		ReconciliationType:    "bank",
	})
	require.NoError(t, err)
	require.Equal(t, int64(0), balanced.DifferenceMinor)

	completed, err := reconSvc.CompleteReconciliation(ctx, wsID, userID, balanced.ID)
	require.NoError(t, err)
	require.Equal(t, "reconciled", completed.Status)
}

func TestPublicEstimateAndStatementPortals_WithDiscountsAndDelivery(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "portal-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	cust, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Acme Logistics Ltd",
		PartyType: "customer",
		Email:     "billing@acme.test",
	})
	require.NoError(t, err)

	// 1. Create Estimate with Discount (₦5,000) & Delivery Fee (₦2,500)
	est, err := svc.CreateEstimate(ctx, wsID, userID, finance.CreateEstimateInput{
		CustomerID:       cust.ID,
		CustomerName:     cust.Name,
		IssueDate:        "2026-11-10",
		ExpiryDate:       "2026-11-24",
		Currency:         "NGN",
		DiscountMinor:    500000,
		DeliveryFeeMinor: 250000,
		TaxAmountMinor:   100000,
		Status:           "sent",
		Items: []finance.EstimateItemInput{
			{Description: "Custom Server Rack", Quantity: "1", UnitPriceMinor: 2000000}, // ₦20,000
		},
	})
	require.NoError(t, err)
	// Total: 20,000 - 5,000 + 1,000 + 2,500 = 18,500 (1,850,000 minor)
	require.Equal(t, int64(1850000), est.Estimate.TotalAmountMinor)

	// 2. Create public share and accept as guest
	estToken, _, err := svc.CreateEstimateShare(ctx, wsID, est.Estimate.ID, userID, 14, true)
	require.NoError(t, err)

	pubEst, err := svc.GetPublicEstimate(ctx, estToken)
	require.NoError(t, err)
	require.Equal(t, est.Estimate.EstimateNumber, pubEst.Estimate.EstimateNumber)

	acceptedEst, err := svc.RespondPublicEstimate(ctx, estToken, "accepted", "Jane Buyer", "Approved for delivery")
	require.NoError(t, err)
	require.Equal(t, "accepted", acceptedEst.Status)

	// 3. Create public statement share & inspect
	stmtToken, _, err := svc.CreateCustomerStatementShare(ctx, wsID, cust.ID, userID, "2026-11-01", "2026-11-30", 14)
	require.NoError(t, err)

	stmtView, err := svc.GetPublicCustomerStatement(ctx, stmtToken)
	require.NoError(t, err)
	require.Equal(t, cust.ID, stmtView.Customer.ID)
}

func TestCounterpartyUpdateAndMerge(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "merge-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	primary, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Primary Client",
		PartyType: "customer",
	})
	require.NoError(t, err)

	dup, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Primary Client Duplicate",
		PartyType: "customer",
	})
	require.NoError(t, err)

	// Update primary details
	updated, err := svc.UpdateCounterparty(ctx, wsID, primary.ID, finance.CreateCounterpartyInput{
		Name:      "Primary Client Ltd",
		PartyType: "customer",
		Phone:     "08012345678",
	})
	require.NoError(t, err)
	require.Equal(t, "Primary Client Ltd", updated.Name)

	// Issue invoice under duplicate
	inv, err := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID: dup.ID,
		IssueDate:  "2026-11-11",
		DueDate:    "2026-11-25",
		Currency:   "NGN",
		Items: []finance.InvoiceItemInput{
			{Description: "Consulting", Quantity: 1, UnitPriceMinor: 1000000},
		},
	})
	require.NoError(t, err)

	// Merge duplicate into primary
	_, err = svc.MergeCounterparties(ctx, wsID, dup.ID, primary.ID)
	require.NoError(t, err)

	// Invoice now belongs to primary
	reassignedInv, err := svc.GetInvoice(ctx, wsID, inv.Invoice.ID)
	require.NoError(t, err)
	require.Equal(t, primary.ID, reassignedInv.Invoice.CustomerID)
}
