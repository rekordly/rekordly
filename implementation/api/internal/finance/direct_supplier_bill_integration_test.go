package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestDirectSupplierBillPostsExpenseAndSupportsDueDate(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "direct-bill")
	svc := finance.NewService(pool)
	ctx := context.Background()
	supplier, err := svc.CreateCounterparty(ctx, ws, finance.CreateCounterpartyInput{Name: "Utility supplier", PartyType: "supplier"})
	require.NoError(t, err)
	bill, err := svc.CreateSupplierBill(ctx, ws, user, finance.CreateSupplierBillInput{SupplierID: supplier.ID, SupplierInvoiceNumber: "DIRECT-001", BillDate: "2026-11-01", DueDate: "2026-11-05", Amount: "250", Currency: "NGN", BillType: "direct_expense", Description: "Internet service", IdempotencyKey: "direct-bill-one"})
	require.NoError(t, err)
	require.False(t, bill.GoodsReceiptLinked)
	require.Equal(t, "direct_expense", bill.BillType)
	approved, err := svc.ApproveSupplierBill(ctx, ws, user, bill.ID, finance.SupplierBillCommandInput{ExpectedVersion: bill.Version, IdempotencyKey: "direct-bill-approve"})
	require.NoError(t, err)
	require.Equal(t, "approved", approved.Status)
	var debit, credit int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT COALESCE(sum(debit_minor),0), COALESCE(sum(credit_minor),0) FROM ledger_lines ll JOIN ledger_entries le ON le.id=ll.ledger_entry_id WHERE le.workspace_id=$1 AND le.source_type='supplier_bill' AND le.source_id=$2`, ws, bill.ID).Scan(&debit, &credit))
	require.Equal(t, int64(25000), debit)
	require.Equal(t, debit, credit)
}
