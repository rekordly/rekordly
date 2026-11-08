package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestCounterparties_CustomersAndSuppliersWithoutUserAccount(t *testing.T) {
	pool := testPool(t)
	wsID, _ := createTestWorkspace(t, pool, "cp-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// External customer (no Rekordly user account required)
	cust, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Acme Enterprise",
		PartyType: "customer",
		Email:     "billing@acme.corp",
		Phone:     "+2348011112222",
	})
	require.NoError(t, err)
	require.Equal(t, "Acme Enterprise", cust.Name)
	require.Equal(t, "customer", cust.PartyType)

	// External supplier
	supp, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Global Supplies Ltd",
		PartyType: "supplier",
		Email:     "sales@globalsupplies.test",
	})
	require.NoError(t, err)
	require.Equal(t, "Global Supplies Ltd", supp.Name)
	require.Equal(t, "supplier", supp.PartyType)

	// List customers
	customers, err := svc.ListCounterparties(ctx, wsID, "customer")
	require.NoError(t, err)
	require.Len(t, customers, 1)

	// List suppliers
	suppliers, err := svc.ListCounterparties(ctx, wsID, "supplier")
	require.NoError(t, err)
	require.Len(t, suppliers, 1)
}

func TestSales_FullAndPartialPayment_OverpaymentProtection(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "sales-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	bank, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:        "Corporate Bank",
		AccountType: "bank",
		Currency:    "NGN",
	})
	require.NoError(t, err)

	cust, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Boutique Client",
		PartyType: "customer",
	})
	require.NoError(t, err)

	// 1. Create sale for ₦10,000.00 (1000000 minor)
	saleDetail, err := svc.CreateSale(ctx, wsID, userID, finance.CreateSaleInput{
		CustomerID:       &cust.ID,
		SaleDate:         "2026-11-08",
		TotalAmountMinor: 1000000,
		Currency:         "NGN",
		Notes:            "Web development consulting",
	})
	require.NoError(t, err)
	require.Equal(t, "unpaid", saleDetail.Sale.Status)
	require.Equal(t, int64(0), saleDetail.Sale.PaidAmountMinor)

	// 2. Partial payment: ₦4,000.00 (400000 minor)
	pmt1, err := svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction:        "incoming",
		PaymentDate:      "2026-11-08",
		TotalAmountMinor: 400000,
		Currency:         "NGN",
		CounterpartyID:   &cust.ID,
		LinkedRecordType: "sale",
		LinkedRecordID:   &saleDetail.Sale.ID,
		PaymentLegs: []finance.PaymentLegInput{
			{MoneyAccountID: bank.ID, AmountMinor: 400000},
		},
	})
	require.NoError(t, err)
	require.Equal(t, int64(400000), pmt1.Payment.TotalAmountMinor)

	// Verify sale updated to 'partially_paid'
	saleCheck1, err := svc.GetSale(ctx, wsID, saleDetail.Sale.ID)
	require.NoError(t, err)
	require.Equal(t, "partially_paid", saleCheck1.Sale.Status)
	require.Equal(t, int64(400000), saleCheck1.Sale.PaidAmountMinor)

	// 3. OVERPAYMENT PROTECTION: Attempting to pay ₦7,000.00 when outstanding is ₦6,000.00 must FAIL!
	_, err = svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction:        "incoming",
		PaymentDate:      "2026-11-08",
		TotalAmountMinor: 700000,
		Currency:         "NGN",
		CounterpartyID:   &cust.ID,
		LinkedRecordType: "sale",
		LinkedRecordID:   &saleDetail.Sale.ID,
		PaymentLegs: []finance.PaymentLegInput{
			{MoneyAccountID: bank.ID, AmountMinor: 700000},
		},
	})
	require.ErrorIs(t, err, finance.ErrOverpayment)

	// 4. Pay remaining ₦6,000.00 (600000 minor) -> status becomes 'paid'
	pmt2, err := svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction:        "incoming",
		PaymentDate:      "2026-11-08",
		TotalAmountMinor: 600000,
		Currency:         "NGN",
		CounterpartyID:   &cust.ID,
		LinkedRecordType: "sale",
		LinkedRecordID:   &saleDetail.Sale.ID,
		PaymentLegs: []finance.PaymentLegInput{
			{MoneyAccountID: bank.ID, AmountMinor: 600000},
		},
	})
	require.NoError(t, err)
	require.Equal(t, int64(600000), pmt2.Payment.TotalAmountMinor)

	// Verify sale updated to 'paid'
	saleCheck2, err := svc.GetSale(ctx, wsID, saleDetail.Sale.ID)
	require.NoError(t, err)
	require.Equal(t, "paid", saleCheck2.Sale.Status)
	require.Equal(t, int64(1000000), saleCheck2.Sale.PaidAmountMinor)
	require.Len(t, saleCheck2.Payments, 2)

	// 5. Attempting to pay anything more on a fully paid sale fails
	_, err = svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction:        "incoming",
		PaymentDate:      "2026-11-08",
		TotalAmountMinor: 1000,
		Currency:         "NGN",
		CounterpartyID:   &cust.ID,
		LinkedRecordType: "sale",
		LinkedRecordID:   &saleDetail.Sale.ID,
		PaymentLegs: []finance.PaymentLegInput{
			{MoneyAccountID: bank.ID, AmountMinor: 1000},
		},
	})
	require.ErrorIs(t, err, finance.ErrAlreadyFullyPaid)
}

func TestSplitPayment_MultiplePaymentLegs_DoubleEntryBalances(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "split-pmt-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	cashAcc, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:        "Physical Till Cash",
		AccountType: "cash",
		Currency:    "NGN",
	})
	require.NoError(t, err)

	bankAcc, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:        "POS Terminal Bank",
		AccountType: "bank",
		Currency:    "NGN",
	})
	require.NoError(t, err)

	// Customer buys goods for ₦50,000.00 (5000000 minor)
	// Settled via Split Payment: ₦20,000 cash + ₦30,000 bank
	detail, err := svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction:        "incoming",
		PaymentDate:      "2026-11-08",
		TotalAmountMinor: 5000000,
		Currency:         "NGN",
		CounterpartyName: "Walk-in Guest",
		PaymentLegs: []finance.PaymentLegInput{
			{MoneyAccountID: cashAcc.ID, AmountMinor: 2000000},
			{MoneyAccountID: bankAcc.ID, AmountMinor: 3000000},
		},
		Notes: "Split settlement: cash + POS transfer",
	})
	require.NoError(t, err)
	require.Len(t, detail.Legs, 2)

	// Verify ledger entries balance atomically
	require.NotNil(t, detail.Ledger)
	require.Len(t, detail.Lines, 3) // 2 Debits (cash, bank) + 1 Credit (revenue)

	var totalDebit, totalCredit int64
	for _, l := range detail.Lines {
		totalDebit += l.DebitMinor
		totalCredit += l.CreditMinor
	}
	require.Equal(t, int64(5000000), totalDebit)
	require.Equal(t, int64(5000000), totalCredit)

	// Verify account balances
	cashCheck, err := svc.GetAccount(ctx, wsID, cashAcc.ID)
	require.NoError(t, err)
	require.Equal(t, int64(2000000), cashCheck.CurrentBalanceMinor)

	bankCheck, err := svc.GetAccount(ctx, wsID, bankAcc.ID)
	require.NoError(t, err)
	require.Equal(t, int64(3000000), bankCheck.CurrentBalanceMinor)

	// Split legs mismatch fails validation
	_, err = svc.CreatePayment(ctx, wsID, userID, finance.CreatePaymentInput{
		Direction:        "incoming",
		PaymentDate:      "2026-11-08",
		TotalAmountMinor: 5000000,
		Currency:         "NGN",
		PaymentLegs: []finance.PaymentLegInput{
			{MoneyAccountID: cashAcc.ID, AmountMinor: 2000000}, // sum is 2000000 != 5000000
		},
	})
	require.ErrorIs(t, err, finance.ErrLegsSumMismatch)
}

func TestPurchases_And_TenantIsolation(t *testing.T) {
	pool := testPool(t)
	wsA, userA := createTestWorkspace(t, pool, "purch-ws-a")
	wsB, _ := createTestWorkspace(t, pool, "purch-ws-b")
	svc := finance.NewService(pool)
	ctx := context.Background()

	suppA, err := svc.CreateCounterparty(ctx, wsA, finance.CreateCounterpartyInput{
		Name:      "Supplier A",
		PartyType: "supplier",
	})
	require.NoError(t, err)

	suppB, err := svc.CreateCounterparty(ctx, wsB, finance.CreateCounterpartyInput{
		Name:      "Supplier B",
		PartyType: "supplier",
	})
	require.NoError(t, err)

	bankA, err := svc.CreateAccount(ctx, wsA, finance.CreateAccountInput{
		Name:        "Bank A",
		AccountType: "bank",
		Currency:    "NGN",
	})
	require.NoError(t, err)

	// 1. Tenant Isolation: Trying to create purchase in Workspace A linking Supplier B fails
	_, err = svc.CreatePurchase(ctx, wsA, userA, finance.CreatePurchaseInput{
		SupplierID:       &suppB.ID,
		PurchaseDate:     "2026-11-08",
		TotalAmountMinor: 500000,
	})
	require.ErrorIs(t, err, finance.ErrForbiddenParty)

	// 2. Normal purchase in Workspace A
	purchA, err := svc.CreatePurchase(ctx, wsA, userA, finance.CreatePurchaseInput{
		SupplierID:       &suppA.ID,
		PurchaseDate:     "2026-11-08",
		TotalAmountMinor: 800000,
		Currency:         "NGN",
		IdempotencyKey:   "idemp-purch-1",
	})
	require.NoError(t, err)
	require.Equal(t, "unpaid", purchA.Purchase.Status)

	// 3. Idempotency test: duplicate request returns existing purchase
	purchDup, err := svc.CreatePurchase(ctx, wsA, userA, finance.CreatePurchaseInput{
		SupplierID:       &suppA.ID,
		PurchaseDate:     "2026-11-08",
		TotalAmountMinor: 800000,
		Currency:         "NGN",
		IdempotencyKey:   "idemp-purch-1",
	})
	require.NoError(t, err)
	require.Equal(t, purchA.Purchase.ID, purchDup.Purchase.ID)

	// 4. Tenant isolation: Workspace B cannot link a payment to Workspace A's purchase
	_, err = svc.CreatePayment(ctx, wsB, 999, finance.CreatePaymentInput{
		Direction:        "outgoing",
		PaymentDate:      "2026-11-08",
		TotalAmountMinor: 400000,
		LinkedRecordType: "purchase",
		LinkedRecordID:   &purchA.Purchase.ID,
		PaymentLegs: []finance.PaymentLegInput{
			{MoneyAccountID: bankA.ID, AmountMinor: 400000},
		},
	})
	require.Error(t, err)

	// 5. Successful outgoing payment for purchase in Workspace A
	pmt, err := svc.CreatePayment(ctx, wsA, userA, finance.CreatePaymentInput{
		Direction:        "outgoing",
		PaymentDate:      "2026-11-08",
		TotalAmountMinor: 800000,
		LinkedRecordType: "purchase",
		LinkedRecordID:   &purchA.Purchase.ID,
		PaymentLegs: []finance.PaymentLegInput{
			{MoneyAccountID: bankA.ID, AmountMinor: 800000},
		},
	})
	require.NoError(t, err)
	require.Equal(t, int64(800000), pmt.Payment.TotalAmountMinor)

	// Verify purchase is now fully 'paid'
	purchCheck, err := svc.GetPurchase(ctx, wsA, purchA.Purchase.ID)
	require.NoError(t, err)
	require.Equal(t, "paid", purchCheck.Purchase.Status)
	require.Equal(t, int64(800000), purchCheck.Purchase.PaidAmountMinor)
}
