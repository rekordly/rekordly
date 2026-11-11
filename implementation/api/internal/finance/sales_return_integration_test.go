package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestSalesReturnLifecycle_CreditAndApplication(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "return-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	cust, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Returning Customer",
		PartyType: "customer",
	})
	require.NoError(t, err)

	// 1. Create a finalized invoice
	invDetail, err := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID: cust.ID,
		IssueDate:  "2026-11-10",
		DueDate:    "2026-11-24",
		Currency:   "NGN",
		Status:     "finalized",
		Items: []finance.InvoiceItemInput{
			{Description: "Mechanical Keyboard", Quantity: 2, UnitPriceMinor: 2500000}, // ₦50,000.00
		},
	})
	require.NoError(t, err)
	require.Equal(t, int64(5000000), invDetail.Invoice.TotalAmountMinor)

	// 2. Issue a Sales Return / Credit Note for 1 returned keyboard (₦25,000.00)
	retDetail, err := svc.CreateSalesReturn(ctx, wsID, userID, finance.CreateSalesReturnInput{
		CustomerID:   cust.ID,
		InvoiceID:    invDetail.Invoice.ID,
		ReturnDate:   "2026-11-11",
		Currency:     "NGN",
		Reason:       "Wrong switch type ordered",
		ActionTaken:  "customer_credit",
		Items: []finance.SalesReturnItemInput{
			{Description: "Mechanical Keyboard (Return)", Quantity: "1", UnitPriceMinor: 2500000},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "issued", retDetail.SalesReturn.Status)
	require.Equal(t, int64(2500000), retDetail.SalesReturn.TotalAmountMinor)

	// 3. Verify Customer Credit balance is ₦25,000.00
	creditDetail, err := svc.GetCustomerCredit(ctx, wsID, cust.ID, "NGN")
	require.NoError(t, err)
	require.NotNil(t, creditDetail.Credit)
	require.Equal(t, int64(2500000), creditDetail.Credit.BalanceMinor)
	require.Len(t, creditDetail.Transactions, 1)
	require.Equal(t, "credit", creditDetail.Transactions[0].Direction)

	// 4. Apply Customer Credit (₦25,000.00) towards the invoice
	updatedInv, err := svc.ApplyCustomerCreditToInvoice(ctx, wsID, userID, cust.ID, invDetail.Invoice.ID, 2500000)
	require.NoError(t, err)
	require.Equal(t, int64(2500000), updatedInv.Invoice.PaidAmountMinor)

	// 5. Verify Customer Credit balance is now 0
	afterApply, err := svc.GetCustomerCredit(ctx, wsID, cust.ID, "NGN")
	require.NoError(t, err)
	require.Equal(t, int64(0), afterApply.Credit.BalanceMinor)
	require.Len(t, afterApply.Transactions, 2)
	require.Equal(t, "debit", afterApply.Transactions[0].Direction)
}
