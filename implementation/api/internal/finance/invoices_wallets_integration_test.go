package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestInvoiceLifecycle_DraftUpdateAndFinalize(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "inv-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	cust, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Premium Client",
		PartyType: "customer",
	})
	require.NoError(t, err)

	// 1. Create Draft Invoice
	invDetail, err := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID: cust.ID,
		IssueDate:  "2026-11-08",
		DueDate:    "2026-11-22",
		Currency:   "NGN",
		Status:     "draft",
		Items: []finance.InvoiceItemInput{
			{Description: "Design System", Quantity: 1, UnitPriceMinor: 1500000}, // ₦15,000.00
		},
		TaxAmountMinor: 112500, // ₦1,125.00 (7.5% VAT)
	})
	require.NoError(t, err)
	require.Equal(t, "draft", invDetail.Invoice.Status)
	require.Equal(t, int64(1500000), invDetail.Invoice.SubtotalMinor)
	require.Equal(t, int64(1612500), invDetail.Invoice.TotalAmountMinor)

	// 2. Update Draft Invoice (PATCH)
	updated, err := svc.UpdateDraftInvoice(ctx, wsID, userID, invDetail.Invoice.ID, finance.UpdateDraftInvoiceInput{
		Items: []finance.InvoiceItemInput{
			{Description: "Design System V2", Quantity: 2, UnitPriceMinor: 1000000}, // ₦20,000.00
		},
		TaxAmountMinor: 150000,
	})
	require.NoError(t, err)
	require.Equal(t, int64(2000000), updated.Invoice.SubtotalMinor)
	require.Equal(t, int64(2150000), updated.Invoice.TotalAmountMinor)

	// 3. Finalize Invoice
	finalized, err := svc.FinalizeInvoice(ctx, wsID, userID, invDetail.Invoice.ID)
	require.NoError(t, err)
	require.Equal(t, "finalized", finalized.Invoice.Status)
	require.NotNil(t, finalized.Invoice.FinalizedAt)

	// 4. Attempting to edit a finalized invoice must FAIL!
	_, err = svc.UpdateDraftInvoice(ctx, wsID, userID, invDetail.Invoice.ID, finance.UpdateDraftInvoiceInput{
		Items: []finance.InvoiceItemInput{
			{Description: "Unauthorized change", Quantity: 1, UnitPriceMinor: 100},
		},
	})
	require.ErrorIs(t, err, finance.ErrCannotEditFinalizedInvoice)
}

func TestCustomerWallet_DepositAndInvoicePayment_NoNegativeWallet(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "wallet-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	bank, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:        "Deposit Receiving Bank",
		AccountType: "bank",
		Currency:    "NGN",
	})
	require.NoError(t, err)

	cust, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Valued Patron",
		PartyType: "customer",
	})
	require.NoError(t, err)

	// 1. Initial wallet balance is 0
	walletInit, err := svc.GetCustomerWallet(ctx, wsID, cust.ID, "NGN")
	require.NoError(t, err)
	require.Equal(t, int64(0), walletInit.BalanceMinor)

	// 2. Record Customer Deposit of ₦50,000.00 (5000000 minor)
	depResult, err := svc.DepositToCustomerWallet(ctx, wsID, userID, cust.ID, finance.CustomerWalletDepositInput{
		AmountMinor:    5000000,
		Currency:       "NGN",
		MoneyAccountID: bank.ID,
		Notes:          "Retainer deposit advance",
		IdempotencyKey: "dep-key-101",
	})
	require.NoError(t, err)
	require.Equal(t, int64(5000000), depResult.Wallet.BalanceMinor)

	// Bank balance increased by 5000000
	updatedBank, err := svc.GetAccount(ctx, wsID, bank.ID)
	require.NoError(t, err)
	require.Equal(t, int64(5000000), updatedBank.CurrentBalanceMinor)

	// Ledger entry was created
	require.NotNil(t, depResult.Ledger)

	// 3. Create and finalize Invoice for ₦30,000.00 (3000000 minor)
	inv, err := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID: cust.ID,
		IssueDate:  "2026-11-08",
		DueDate:    "2026-11-15",
		Currency:   "NGN",
		Status:     "finalized",
		Items: []finance.InvoiceItemInput{
			{Description: "Monthly Retainer", Quantity: 1, UnitPriceMinor: 3000000},
		},
	})
	require.NoError(t, err)

	// 4. Pay Invoice using Customer Wallet balance (₦30,000.00)
	paidInv, err := svc.PayInvoiceWithWallet(ctx, wsID, userID, inv.Invoice.ID, 3000000)
	require.NoError(t, err)
	require.Equal(t, "paid", paidInv.Invoice.Status)
	require.Equal(t, int64(3000000), paidInv.Invoice.PaidAmountMinor)

	// Verify wallet balance decreased to 2000000 (5000000 - 3000000)
	walletAfter, err := svc.GetCustomerWallet(ctx, wsID, cust.ID, "NGN")
	require.NoError(t, err)
	require.Equal(t, int64(2000000), walletAfter.BalanceMinor)

	// 5. Create second invoice for ₦50,000.00
	inv2, err := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID: cust.ID,
		IssueDate:  "2026-11-08",
		DueDate:    "2026-11-20",
		Currency:   "NGN",
		Status:     "finalized",
		Items: []finance.InvoiceItemInput{
			{Description: "Additional Scope", Quantity: 1, UnitPriceMinor: 5000000},
		},
	})
	require.NoError(t, err)

	// 6. NO NEGATIVE WALLET: Customer only has ₦20,000 in wallet. Attempting to pay ₦30,000 must FAIL!
	_, err = svc.PayInvoiceWithWallet(ctx, wsID, userID, inv2.Invoice.ID, 3000000)
	require.ErrorIs(t, err, finance.ErrInsufficientWalletBalance)

	// 7. OVER-ALLOCATION PROTECTION: Attempting to pay ₦60,000 when invoice is ₦50,000 must FAIL!
	_, err = svc.PayInvoiceWithWallet(ctx, wsID, userID, inv2.Invoice.ID, 6000000)
	require.ErrorIs(t, err, finance.ErrOverpayment)

	// 8. Partial payment from wallet: ₦20,000
	paidPartially, err := svc.PayInvoiceWithWallet(ctx, wsID, userID, inv2.Invoice.ID, 2000000)
	require.NoError(t, err)
	require.Equal(t, "partially_paid", paidPartially.Invoice.Status)
	require.Equal(t, int64(2000000), paidPartially.Invoice.PaidAmountMinor)

	// Wallet balance is now exactly 0
	walletEmpty, err := svc.GetCustomerWallet(ctx, wsID, cust.ID, "NGN")
	require.NoError(t, err)
	require.Equal(t, int64(0), walletEmpty.BalanceMinor)
}

func TestDirectInvoicePaymentClearsReceivableWithoutNewRevenue(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "direct-invoice-payment")
	svc := finance.NewService(pool)
	ctx := context.Background()

	bank, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{Name: "Invoice bank", AccountType: "bank", Currency: "NGN"})
	require.NoError(t, err)
	customer, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{Name: "Invoice customer", PartyType: "customer"})
	require.NoError(t, err)
	created, err := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID: customer.ID, IssueDate: "2026-11-10", DueDate: "2026-11-30", Currency: "NGN", Status: "finalized",
		Items: []finance.InvoiceItemInput{{Description: "Design work", Quantity: 1, UnitPriceMinor: 1_000_000}},
	})
	require.NoError(t, err)

	paid, err := svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction: "incoming", PaymentDate: "2026-11-10", TotalAmountMinor: 400_000, Currency: "NGN",
		LinkedRecordType: "invoice", LinkedRecordID: &created.Invoice.ID,
		PaymentLegs:    []finance.PaymentLegInput{{MoneyAccountID: bank.ID, AmountMinor: 400_000}},
		IdempotencyKey: "invoice-payment-001",
	})
	require.NoError(t, err)
	require.Len(t, paid.Lines, 2)
	require.Equal(t, "asset", paid.Lines[0].AccountClass)
	require.Equal(t, "asset", paid.Lines[1].AccountClass)
	require.Equal(t, int64(400_000), paid.Lines[0].DebitMinor)
	require.Equal(t, int64(400_000), paid.Lines[1].CreditMinor)

	invoiceDetail, err := svc.GetInvoice(ctx, wsID, created.Invoice.ID)
	require.NoError(t, err)
	require.Equal(t, "partially_paid", invoiceDetail.Invoice.Status)
	require.Equal(t, int64(400_000), invoiceDetail.Invoice.PaidAmountMinor)

	duplicate, err := svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction: "incoming", PaymentDate: "2026-11-10", TotalAmountMinor: 400_000, Currency: "NGN",
		LinkedRecordType: "invoice", LinkedRecordID: &created.Invoice.ID,
		PaymentLegs:    []finance.PaymentLegInput{{MoneyAccountID: bank.ID, AmountMinor: 400_000}},
		IdempotencyKey: "invoice-payment-001",
	})
	require.NoError(t, err)
	require.Equal(t, paid.Payment.ID, duplicate.Payment.ID)

	invoiceDetail, err = svc.GetInvoice(ctx, wsID, created.Invoice.ID)
	require.NoError(t, err)
	require.Equal(t, int64(400_000), invoiceDetail.Invoice.PaidAmountMinor)

	_, err = svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction: "incoming", PaymentDate: "2026-11-10", TotalAmountMinor: 700_000, Currency: "NGN",
		LinkedRecordType: "invoice", LinkedRecordID: &created.Invoice.ID,
		PaymentLegs: []finance.PaymentLegInput{{MoneyAccountID: bank.ID, AmountMinor: 700_000}},
	})
	require.ErrorIs(t, err, finance.ErrOverpayment)
}

func TestCustomerReceiptAllocatesAtomicallyAcrossInvoices(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "multi-invoice-allocation")
	svc := finance.NewService(pool)
	ctx := context.Background()

	bank, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{Name: "Collection account", AccountType: "bank", Currency: "NGN"})
	require.NoError(t, err)
	customer, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{Name: "Allocated customer", PartyType: "customer"})
	require.NoError(t, err)
	otherCustomer, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{Name: "Other customer", PartyType: "customer"})
	require.NoError(t, err)

	createInvoice := func(customerID int64, amount int64) int64 {
		detail, createErr := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
			CustomerID: customerID, IssueDate: "2026-11-10", DueDate: "2026-11-30", Currency: "NGN", Status: "finalized",
			Items: []finance.InvoiceItemInput{{Description: "Allocated service", Quantity: 1, UnitPriceMinor: amount}},
		})
		require.NoError(t, createErr)
		return detail.Invoice.ID
	}
	firstInvoiceID := createInvoice(customer.ID, 600_000)
	secondInvoiceID := createInvoice(customer.ID, 400_000)
	foreignInvoiceID := createInvoice(otherCustomer.ID, 100_000)

	paid, err := svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction: "incoming", PaymentDate: "2026-11-10", TotalAmountMinor: 1_000_000, Currency: "NGN",
		PaymentLegs: []finance.PaymentLegInput{{MoneyAccountID: bank.ID, AmountMinor: 1_000_000}},
		Allocations: []finance.PaymentAllocationInput{
			{DocumentType: "invoice", DocumentID: secondInvoiceID, AmountMinor: 400_000},
			{DocumentType: "invoice", DocumentID: firstInvoiceID, AmountMinor: 600_000},
		},
		IdempotencyKey: "multi-invoice-receipt-001",
	})
	require.NoError(t, err)
	require.Len(t, paid.Allocations, 2)
	require.Len(t, paid.Lines, 2)
	require.Equal(t, "asset", paid.Lines[0].AccountClass)
	require.Equal(t, "asset", paid.Lines[1].AccountClass)

	for _, invoiceID := range []int64{firstInvoiceID, secondInvoiceID} {
		detail, getErr := svc.GetInvoice(ctx, wsID, invoiceID)
		require.NoError(t, getErr)
		require.Equal(t, "paid", detail.Invoice.Status)
	}

	replayed, err := svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction: "incoming", PaymentDate: "2026-11-10", TotalAmountMinor: 1_000_000, Currency: "NGN",
		PaymentLegs: []finance.PaymentLegInput{{MoneyAccountID: bank.ID, AmountMinor: 1_000_000}},
		Allocations: []finance.PaymentAllocationInput{
			{DocumentType: "invoice", DocumentID: firstInvoiceID, AmountMinor: 600_000},
			{DocumentType: "invoice", DocumentID: secondInvoiceID, AmountMinor: 400_000},
		},
		IdempotencyKey: "multi-invoice-receipt-001",
	})
	require.NoError(t, err)
	require.Equal(t, paid.Payment.ID, replayed.Payment.ID)
	require.Len(t, replayed.Allocations, 2)

	// A cross-customer allocation must roll back its earlier invoice lock/update too.
	thirdInvoiceID := createInvoice(customer.ID, 100_000)
	_, err = svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction: "incoming", PaymentDate: "2026-11-10", TotalAmountMinor: 200_000, Currency: "NGN",
		PaymentLegs: []finance.PaymentLegInput{{MoneyAccountID: bank.ID, AmountMinor: 200_000}},
		Allocations: []finance.PaymentAllocationInput{
			{DocumentType: "invoice", DocumentID: thirdInvoiceID, AmountMinor: 100_000},
			{DocumentType: "invoice", DocumentID: foreignInvoiceID, AmountMinor: 100_000},
		},
	})
	require.ErrorIs(t, err, finance.ErrInvalidAllocation)
	thirdInvoice, err := svc.GetInvoice(ctx, wsID, thirdInvoiceID)
	require.NoError(t, err)
	require.Equal(t, int64(0), thirdInvoice.Invoice.PaidAmountMinor)
}

func TestVoidInvoice_ReversalLedgerAndProtection(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "void-inv-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	cust, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Client Gamma",
		PartyType: "customer",
	})
	require.NoError(t, err)

	inv, err := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID: cust.ID,
		IssueDate:  "2026-11-08",
		DueDate:    "2026-11-30",
		Currency:   "NGN",
		Status:     "finalized",
		Items: []finance.InvoiceItemInput{
			{Description: "Consulting", Quantity: 1, UnitPriceMinor: 800000},
		},
		TaxAmountMinor: 60000,
	})
	require.NoError(t, err)

	// Void invoice
	voided, err := svc.VoidInvoice(ctx, wsID, userID, inv.Invoice.ID, "Client cancelled contract")
	require.NoError(t, err)
	require.Equal(t, "voided", voided.Invoice.Status)
	require.Equal(t, "Client cancelled contract", voided.Invoice.VoidReason.String)

	// Cannot void twice
	_, err = svc.VoidInvoice(ctx, wsID, userID, inv.Invoice.ID, "Second attempt")
	require.ErrorIs(t, err, finance.ErrInvoiceAlreadyVoided)
}
