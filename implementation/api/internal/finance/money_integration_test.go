package finance_test

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is required for finance integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Fatalf("ping database: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func createTestWorkspace(t *testing.T, pool *pgxpool.Pool, name string) (int64, int64) {
	t.Helper()
	ctx := context.Background()

	var userID int64
	err := pool.QueryRow(ctx, `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, name+"-user").Scan(&userID)
	require.NoError(t, err)

	slug := fmt.Sprintf("%s-%d", name, time.Now().UnixNano())
	var workspaceID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO workspaces (kind, name, slug, base_currency, owner_user_id)
		VALUES ('business', $1, $2, 'NGN', $3)
		RETURNING id
	`, name, slug, userID).Scan(&workspaceID)
	require.NoError(t, err)

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM ledger_lines WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM ledger_entries WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM attachments_metadata WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM money_transactions WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM categories WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM money_accounts WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, workspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	})

	return workspaceID, userID
}

func TestMoneyAccountsAndCategories(t *testing.T) {
	pool := testPool(t)
	wsID, _ := createTestWorkspace(t, pool, "acc-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// 1. Create money account
	acc, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:           "GTBank Main",
		AccountType:    "bank",
		Currency:       "NGN",
		OpeningBalance: 5000000, // ₦50,000.00
	})
	require.NoError(t, err)
	require.Equal(t, "GTBank Main", acc.Name)
	require.Equal(t, int64(5000000), acc.CurrentBalanceMinor)

	// List accounts
	accounts, err := svc.ListAccounts(ctx, wsID)
	require.NoError(t, err)
	require.Len(t, accounts, 1)

	// 2. Create category
	cat, err := svc.CreateCategory(ctx, wsID, finance.CreateCategoryInput{
		Name:         "Office Lunch",
		Direction:    "money_out",
		Scope:        "business",
		AccountClass: "expense",
	})
	require.NoError(t, err)
	require.Equal(t, "Office Lunch", cat.Name)

	// List categories
	cats, err := svc.ListCategories(ctx, wsID, "money_out", "")
	require.NoError(t, err)
	require.Len(t, cats, 1)
}

func TestDefaultCategoriesAreIdempotentAndWorkspaceScoped(t *testing.T) {
	pool := testPool(t)
	wsID, _ := createTestWorkspace(t, pool, "default-categories")
	svc := finance.NewService(pool)
	ctx := context.Background()

	require.NoError(t, svc.SeedDefaultCategories(ctx, wsID, "business"))
	require.NoError(t, svc.SeedDefaultCategories(ctx, wsID, "business"))

	income, err := svc.ListCategories(ctx, wsID, "money_in", "business")
	require.NoError(t, err)
	require.Len(t, income, 3)
	require.Equal(t, []string{"Other Income", "Sales Revenue", "Service Revenue"}, []string{income[0].Name, income[1].Name, income[2].Name})

	expenses, err := svc.ListCategories(ctx, wsID, "money_out", "business")
	require.NoError(t, err)
	require.NotEmpty(t, expenses)
	for _, category := range expenses {
		require.NotEqual(t, "personal", category.Scope)
	}
}

func TestMoneyTransaction_MoneyIn_DoubleEntryBalances(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "money-in-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// Create account
	bank, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:           "Zenith Checking",
		AccountType:    "bank",
		Currency:       "NGN",
		OpeningBalance: 100000, // ₦1,000.00
	})
	require.NoError(t, err)

	// Create transaction: Income ₦5,000.00 (500000 minor)
	detail, err := svc.CreateTransaction(ctx, wsID, userID, finance.CreateTransactionInput{
		Direction:        "money_in",
		Status:           "posted",
		AmountMinor:      500000,
		EffectiveDate:    "2026-11-08",
		MoneyAccountID:   bank.ID,
		CounterpartyName: "Client Alpha",
		Purpose:          "Direct service payment",
		Notes:            "Invoice deposit",
		IdempotencyKey:   "idemp-money-in-1",
		Attachments: []finance.AttachmentInput{
			{
				StorageKey: "receipts/1.pdf",
				FileName:   "receipt.pdf",
				SizeBytes:  1024,
				MimeType:   "application/pdf",
				SHA256Hash: "hash-123",
			},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "posted", detail.Transaction.Status)
	require.Equal(t, int64(500000), detail.Transaction.AmountMinor)
	require.Len(t, detail.Attachments, 1)

	// Verify ledger entry and balancing
	require.NotNil(t, detail.LedgerEntry)
	require.Len(t, detail.LedgerLines, 2)

	var totalDebit, totalCredit int64
	for _, line := range detail.LedgerLines {
		totalDebit += line.DebitMinor
		totalCredit += line.CreditMinor
	}
	require.Equal(t, int64(500000), totalDebit)
	require.Equal(t, int64(500000), totalCredit)

	// Verify updated account balance (100000 + 500000 = 600000)
	updatedBank, err := svc.GetAccount(ctx, wsID, bank.ID)
	require.NoError(t, err)
	require.Equal(t, int64(600000), updatedBank.CurrentBalanceMinor)
}

func TestMoneyTransaction_MoneyOut_And_VoidReversal(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "money-out-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// Create account
	bank, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:           "Kuda Operations",
		AccountType:    "bank",
		Currency:       "NGN",
		OpeningBalance: 1000000, // ₦10,000.00
	})
	require.NoError(t, err)

	// Spend ₦2,500.00 (250000 minor)
	detail, err := svc.CreateTransaction(ctx, wsID, userID, finance.CreateTransactionInput{
		Direction:      "money_out",
		Status:         "posted",
		AmountMinor:    250000,
		EffectiveDate:  "2026-11-08",
		MoneyAccountID: bank.ID,
		Purpose:        "Internet data subscription",
	})
	require.NoError(t, err)

	// Account balance decreased to 750000
	updatedBank, err := svc.GetAccount(ctx, wsID, bank.ID)
	require.NoError(t, err)
	require.Equal(t, int64(750000), updatedBank.CurrentBalanceMinor)

	// VOID the transaction
	voidedDetail, err := svc.VoidTransaction(ctx, wsID, userID, detail.Transaction.ID, "Incorrect subscription amount entered")
	require.NoError(t, err)
	require.Equal(t, "voided", voidedDetail.Transaction.Status)
	require.True(t, voidedDetail.Transaction.IsVoid)
	require.Equal(t, "Incorrect subscription amount entered", voidedDetail.Transaction.VoidReason.String)

	// Check reversal ledger balancing
	require.NotNil(t, voidedDetail.LedgerEntry)
	require.Len(t, voidedDetail.LedgerLines, 2)
	var totalDebit, totalCredit int64
	for _, line := range voidedDetail.LedgerLines {
		totalDebit += line.DebitMinor
		totalCredit += line.CreditMinor
	}
	require.Equal(t, int64(250000), totalDebit)
	require.Equal(t, int64(250000), totalCredit)

	// Account balance restored back to 1000000!
	restoredBank, err := svc.GetAccount(ctx, wsID, bank.ID)
	require.NoError(t, err)
	require.Equal(t, int64(1000000), restoredBank.CurrentBalanceMinor)

	// Attempting to void again fails
	_, err = svc.VoidTransaction(ctx, wsID, userID, detail.Transaction.ID, "Try again")
	require.ErrorIs(t, err, finance.ErrAlreadyVoided)
}

func TestMoneyTransaction_Transfer(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "transfer-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	acc1, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:           "Account A",
		AccountType:    "bank",
		Currency:       "NGN",
		OpeningBalance: 500000, // ₦5,000.00
	})
	require.NoError(t, err)

	acc2, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:           "Account B",
		AccountType:    "cash",
		Currency:       "NGN",
		OpeningBalance: 0,
	})
	require.NoError(t, err)

	// Transfer ₦2,000.00 (200000 minor) from A to B
	detail, err := svc.CreateTransaction(ctx, wsID, userID, finance.CreateTransactionInput{
		Direction:            "transfer",
		Status:               "posted",
		AmountMinor:          200000,
		EffectiveDate:        "2026-11-08",
		MoneyAccountID:       acc1.ID,
		DestinationAccountID: &acc2.ID,
		Notes:                "Cash withdrawal from bank",
	})
	require.NoError(t, err)
	require.Equal(t, "posted", detail.Transaction.Status)

	// Account A: 500000 - 200000 = 300000
	updatedA, err := svc.GetAccount(ctx, wsID, acc1.ID)
	require.NoError(t, err)
	require.Equal(t, int64(300000), updatedA.CurrentBalanceMinor)

	// Account B: 0 + 200000 = 200000
	updatedB, err := svc.GetAccount(ctx, wsID, acc2.ID)
	require.NoError(t, err)
	require.Equal(t, int64(200000), updatedB.CurrentBalanceMinor)

	// Verify ledger entries balance
	var totalDebit, totalCredit int64
	for _, line := range detail.LedgerLines {
		totalDebit += line.DebitMinor
		totalCredit += line.CreditMinor
	}
	require.Equal(t, int64(200000), totalDebit)
	require.Equal(t, int64(200000), totalCredit)
}

func TestIdempotencyAndTenantIsolation(t *testing.T) {
	pool := testPool(t)
	wsA, userA := createTestWorkspace(t, pool, "ws-a")
	wsB, _ := createTestWorkspace(t, pool, "ws-b")
	svc := finance.NewService(pool)
	ctx := context.Background()

	accA, err := svc.CreateAccount(ctx, wsA, finance.CreateAccountInput{
		Name:           "Workspace A Bank",
		AccountType:    "bank",
		Currency:       "NGN",
		OpeningBalance: 100000,
	})
	require.NoError(t, err)

	accB, err := svc.CreateAccount(ctx, wsB, finance.CreateAccountInput{
		Name:           "Workspace B Bank",
		AccountType:    "bank",
		Currency:       "NGN",
		OpeningBalance: 100000,
	})
	require.NoError(t, err)

	// 1. Idempotency test: post twice with same key
	idempKey := "unique-idemp-12345"
	txn1, err := svc.CreateTransaction(ctx, wsA, userA, finance.CreateTransactionInput{
		Direction:      "money_in",
		Status:         "posted",
		AmountMinor:    50000,
		EffectiveDate:  "2026-11-08",
		MoneyAccountID: accA.ID,
		IdempotencyKey: idempKey,
	})
	require.NoError(t, err)

	txn2, err := svc.CreateTransaction(ctx, wsA, userA, finance.CreateTransactionInput{
		Direction:      "money_in",
		Status:         "posted",
		AmountMinor:    50000,
		EffectiveDate:  "2026-11-08",
		MoneyAccountID: accA.ID,
		IdempotencyKey: idempKey,
	})
	require.NoError(t, err)
	require.Equal(t, txn1.Transaction.ID, txn2.Transaction.ID)

	// Balance increased only once! (100000 + 50000 = 150000)
	accACheck, err := svc.GetAccount(ctx, wsA, accA.ID)
	require.NoError(t, err)
	require.Equal(t, int64(150000), accACheck.CurrentBalanceMinor)

	// 2. Tenant isolation test:
	// Trying to use Workspace B's account in Workspace A fails
	_, err = svc.CreateTransaction(ctx, wsA, userA, finance.CreateTransactionInput{
		Direction:      "money_in",
		Status:         "posted",
		AmountMinor:    50000,
		EffectiveDate:  "2026-11-08",
		MoneyAccountID: accB.ID, // belongs to wsB!
	})
	require.ErrorIs(t, err, finance.ErrForbiddenAccount)

	// Workspace B cannot fetch Workspace A's transaction
	_, err = svc.GetTransaction(ctx, wsB, txn1.Transaction.ID)
	require.ErrorIs(t, err, finance.ErrNotFound)
}

func TestConcurrentTransactions(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "concurrency-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	bank, err := svc.CreateAccount(ctx, wsID, finance.CreateAccountInput{
		Name:           "Concurrency Bank",
		AccountType:    "bank",
		Currency:       "NGN",
		OpeningBalance: 0,
	})
	require.NoError(t, err)

	const workerCount = 5
	const depositPerWorker = 10000 // ₦100.00 each

	var wg sync.WaitGroup
	errCh := make(chan error, workerCount)

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			_, txnErr := svc.CreateTransaction(ctx, wsID, userID, finance.CreateTransactionInput{
				Direction:      "money_in",
				Status:         "posted",
				AmountMinor:    depositPerWorker,
				EffectiveDate:  "2026-11-08",
				MoneyAccountID: bank.ID,
				IdempotencyKey: fmt.Sprintf("worker-deposit-%d", workerID),
			})
			if txnErr != nil {
				errCh <- txnErr
			}
		}(i)
	}

	wg.Wait()
	close(errCh)

	for e := range errCh {
		require.NoError(t, e)
	}

	// Total balance must be exactly workerCount * depositPerWorker
	finalBank, err := svc.GetAccount(ctx, wsID, bank.ID)
	require.NoError(t, err)
	require.Equal(t, int64(workerCount*depositPerWorker), finalBank.CurrentBalanceMinor)
}
