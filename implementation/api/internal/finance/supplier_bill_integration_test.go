package finance_test

import (
	"context"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestSupplierBillApprovalClearsGRNIToAP(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "bill-a")
	svc := finance.NewService(pool)
	ctx := context.Background()
	supplier, e := svc.CreateCounterparty(ctx, ws, finance.CreateCounterpartyInput{Name: "Bill supplier", PartyType: "supplier"})
	require.NoError(t, e)
	product, e := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{Name: "Bill stock", Kind: "stock_tracked", SellingPrice: "100", Currency: "NGN", IdempotencyKey: "bill-product"})
	require.NoError(t, e)
	r, e := svc.CreatePurchaseRequest(ctx, ws, user, finance.CreatePurchaseRequestInput{SupplierID: &supplier.ID, Reason: "Bill stock", Currency: "NGN", IdempotencyKey: "bill-r", Lines: []finance.PurchaseRequestLineInput{{ProductID: &product.ID, Description: "stock", Quantity: "1", UnitName: "each", EstimatedUnitPrice: "100"}}})
	require.NoError(t, e)
	r, e = svc.SubmitPurchaseRequest(ctx, ws, user, r.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: r.Version, IdempotencyKey: "bill-r-s"})
	require.NoError(t, e)
	r, e = svc.ApprovePurchaseRequest(ctx, ws, user, r.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: r.Version, IdempotencyKey: "bill-r-a"})
	require.NoError(t, e)
	po, e := svc.CreatePurchaseOrderFromRequest(ctx, ws, user, r.ID, "bill-po")
	require.NoError(t, e)
	po, e = svc.AdvancePurchaseOrder(ctx, ws, user, po.ID, po.Version, "submitted", "bill-po-s")
	require.NoError(t, e)
	po, e = svc.AdvancePurchaseOrder(ctx, ws, user, po.ID, po.Version, "approved", "bill-po-a")
	require.NoError(t, e)
	po, e = svc.AdvancePurchaseOrder(ctx, ws, user, po.ID, po.Version, "issued", "bill-po-i")
	require.NoError(t, e)
	var line int64
	require.NoError(t, pool.QueryRow(ctx, "SELECT id FROM purchase_order_lines WHERE purchase_order_id=$1", po.ID).Scan(&line))
	receipt, e := svc.CreateGoodsReceipt(ctx, ws, user, finance.CreateGoodsReceiptInput{PurchaseOrderID: po.ID, ReceivedOn: "2026-11-10", IdempotencyKey: "bill-receipt", Lines: []finance.GoodsReceiptLineInput{{PurchaseOrderLineID: line, AcceptedQuantity: "1"}}})
	require.NoError(t, e)
	bill, e := svc.CreateSupplierBill(ctx, ws, user, finance.CreateSupplierBillInput{GoodsReceiptID: receipt.ID, SupplierInvoiceNumber: "SUP-001", BillDate: "2026-11-10", IdempotencyKey: "bill-create"})
	require.NoError(t, e)
	require.Equal(t, "draft", bill.Status)
	match, e := svc.SupplierBillMatch(ctx, ws, bill.ID)
	require.NoError(t, e)
	require.Equal(t, "exact", match.Result)
	require.False(t, match.RequiresReview)
	approved, e := svc.ApproveSupplierBill(ctx, ws, user, bill.ID, finance.SupplierBillCommandInput{ExpectedVersion: bill.Version, IdempotencyKey: "bill-approve"})
	require.NoError(t, e)
	require.Equal(t, "approved", approved.Status)
	account, e := svc.CreateAccount(ctx, ws, finance.CreateAccountInput{Name: "Supplier bank", AccountType: "bank", Currency: "NGN", OpeningAmount: "500"})
	require.NoError(t, e)
	billID := bill.ID
	paid, e := svc.CreatePayment(ctx, ws, user, finance.CreatePaymentInput{Direction: "outgoing", PaymentDate: "2026-11-10", TotalAmount: "40", Currency: "NGN", CounterpartyID: &supplier.ID, LinkedRecordType: "supplier_bill", LinkedRecordID: &billID, IdempotencyKey: "bill-payment-one", PaymentLegs: []finance.PaymentLegInput{{MoneyAccountID: account.ID, AmountMajor: "40"}}})
	require.NoError(t, e)
	require.Equal(t, "supplier_bill", paid.Allocations[0].DocumentType)
	var outstanding int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT outstanding_minor FROM supplier_bills WHERE workspace_id=$1 AND id=$2`, ws, bill.ID).Scan(&outstanding))
	require.Equal(t, int64(6000), outstanding)
	var extraReceiptID, extraBillID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO goods_receipts(workspace_id,purchase_order_id,received_on,idempotency_key,created_by_user_id) VALUES($1,$2,'2026-11-10','bill-extra-receipt',$3) RETURNING id`, ws, po.ID, user).Scan(&extraReceiptID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO supplier_bills(workspace_id,goods_receipt_id,supplier_id,supplier_invoice_number,bill_date,currency,currency_exponent,total_minor,outstanding_minor,status,idempotency_key,created_by_user_id,approved_by_user_id,approved_at) VALUES($1,$2,$3,'SUP-002','2026-11-10','NGN',2,2000,2000,'approved','bill-extra',$4,$4,now()) RETURNING id`, ws, extraReceiptID, supplier.ID, user).Scan(&extraBillID))
	multi, e := svc.CreatePayment(ctx, ws, user, finance.CreatePaymentInput{Direction: "outgoing", PaymentDate: "2026-11-10", TotalAmount: "80", Currency: "NGN", CounterpartyID: &supplier.ID, IdempotencyKey: "bill-payment-multi", Allocations: []finance.PaymentAllocationInput{{DocumentType: "supplier_bill", DocumentID: billID, Amount: "60"}, {DocumentType: "supplier_bill", DocumentID: extraBillID, Amount: "20"}}, PaymentLegs: []finance.PaymentLegInput{{MoneyAccountID: account.ID, AmountMajor: "80"}}})
	require.NoError(t, e)
	require.Len(t, multi.Allocations, 2)
	_, e = svc.CreatePayment(ctx, ws, user, finance.CreatePaymentInput{Direction: "outgoing", PaymentDate: "2026-11-10", TotalAmount: "61", Currency: "NGN", CounterpartyID: &supplier.ID, LinkedRecordType: "supplier_bill", LinkedRecordID: &billID, IdempotencyKey: "bill-payment-over", PaymentLegs: []finance.PaymentLegInput{{MoneyAccountID: account.ID, AmountMajor: "61"}}})
	require.ErrorIs(t, e, finance.ErrAlreadyFullyPaid)

	// A PO prepayment is an asset until an approved supplier bill exists. Its
	// application clears AP without moving cash a second time.
	var advanceReceiptID, advanceBillID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO goods_receipts(workspace_id,purchase_order_id,received_on,idempotency_key,created_by_user_id) VALUES($1,$2,'2026-11-10','advance-receipt',$3) RETURNING id`, ws, po.ID, user).Scan(&advanceReceiptID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO supplier_bills(workspace_id,goods_receipt_id,supplier_id,supplier_invoice_number,bill_date,currency,currency_exponent,total_minor,outstanding_minor,status,idempotency_key,created_by_user_id,approved_by_user_id,approved_at) VALUES($1,$2,$3,'SUP-003','2026-11-10','NGN',2,5000,5000,'approved','advance-bill',$4,$4,now()) RETURNING id`, ws, advanceReceiptID, supplier.ID, user).Scan(&advanceBillID))
	advance, e := svc.CreateSupplierAdvance(ctx, ws, user, finance.CreateSupplierAdvanceInput{SupplierID: supplier.ID, PaymentDate: "2026-11-10", Amount: "30", Currency: "NGN", PaymentLegs: []finance.PaymentLegInput{{MoneyAccountID: account.ID, AmountMajor: "30"}}, IdempotencyKey: "supplier-advance-one"})
	require.NoError(t, e)
	require.Equal(t, "3000", advance.AvailableMinor)
	advanceReplay, e := svc.CreateSupplierAdvance(ctx, ws, user, finance.CreateSupplierAdvanceInput{SupplierID: supplier.ID, PaymentDate: "2026-11-10", Amount: "30", Currency: "NGN", PaymentLegs: []finance.PaymentLegInput{{MoneyAccountID: account.ID, AmountMajor: "30"}}, IdempotencyKey: "supplier-advance-one"})
	require.NoError(t, e)
	require.Equal(t, advance.ID, advanceReplay.ID)

	applied, e := svc.ApplySupplierAdvance(ctx, ws, user, advance.ID, finance.ApplySupplierAdvanceInput{SupplierBillID: advanceBillID, Amount: "30", ExpectedAdvanceVersion: advance.Version, ExpectedBillVersion: 1, IdempotencyKey: "supplier-advance-apply-one"})
	require.NoError(t, e)
	require.Equal(t, "applied", applied.Advance.Status)
	require.Equal(t, "0", applied.Advance.AvailableMinor)
	require.Equal(t, "partially_paid", applied.Bill.Status)
	require.Equal(t, "2000", applied.Bill.OutstandingMinor)
	appliedReplay, e := svc.ApplySupplierAdvance(ctx, ws, user, advance.ID, finance.ApplySupplierAdvanceInput{SupplierBillID: advanceBillID, Amount: "30", ExpectedAdvanceVersion: advance.Version, ExpectedBillVersion: 1, IdempotencyKey: "supplier-advance-apply-one"})
	require.NoError(t, e)
	require.Equal(t, applied.ID, appliedReplay.ID)

	var debit, credit int64
	require.NoError(t, pool.QueryRow(ctx, "SELECT sum(debit_minor),sum(credit_minor) FROM ledger_lines WHERE workspace_id=$1", ws).Scan(&debit, &credit))
	require.Equal(t, debit, credit)
	require.Equal(t, int64(38000), debit)
}
