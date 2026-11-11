package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestSupplierReturnCreditAndRefundAreAtomicAndTenantScoped(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "supplier-return")
	svc := finance.NewService(pool)
	ctx := context.Background()
	supplier, err := svc.CreateCounterparty(ctx, ws, finance.CreateCounterpartyInput{Name: "Return supplier", PartyType: "supplier"})
	require.NoError(t, err)
	product, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{Name: "Return stock", Kind: "stock_tracked", UnitName: "bag", SellingPrice: "100", Currency: "NGN", IdempotencyKey: "return-product"})
	require.NoError(t, err)
	request, err := svc.CreatePurchaseRequest(ctx, ws, user, finance.CreatePurchaseRequestInput{SupplierID: &supplier.ID, Reason: "return test", Currency: "NGN", IdempotencyKey: "return-request", Lines: []finance.PurchaseRequestLineInput{{ProductID: &product.ID, Description: "bags", Quantity: "5", UnitName: "bag", EstimatedUnitPrice: "100"}}})
	require.NoError(t, err)
	request, err = svc.SubmitPurchaseRequest(ctx, ws, user, request.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: request.Version, IdempotencyKey: "return-submit"})
	require.NoError(t, err)
	request, err = svc.ApprovePurchaseRequest(ctx, ws, user, request.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: request.Version, IdempotencyKey: "return-approve"})
	require.NoError(t, err)
	po, err := svc.CreatePurchaseOrderFromRequest(ctx, ws, user, request.ID, "return-po")
	require.NoError(t, err)
	po, err = svc.AdvancePurchaseOrder(ctx, ws, user, po.ID, po.Version, "submitted", "return-po-submit")
	require.NoError(t, err)
	po, err = svc.AdvancePurchaseOrder(ctx, ws, user, po.ID, po.Version, "approved", "return-po-approve")
	require.NoError(t, err)
	po, err = svc.AdvancePurchaseOrder(ctx, ws, user, po.ID, po.Version, "issued", "return-po-issue")
	require.NoError(t, err)
	var poLineID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM purchase_order_lines WHERE purchase_order_id=$1`, po.ID).Scan(&poLineID))
	receipt, err := svc.CreateGoodsReceipt(ctx, ws, user, finance.CreateGoodsReceiptInput{PurchaseOrderID: po.ID, ReceivedOn: "2026-11-11", IdempotencyKey: "return-receipt", Lines: []finance.GoodsReceiptLineInput{{PurchaseOrderLineID: poLineID, AcceptedQuantity: "5"}}})
	require.NoError(t, err)
	var receiptLineID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM goods_receipt_lines WHERE goods_receipt_id=$1`, receipt.ID).Scan(&receiptLineID))
	ret, err := svc.CreateSupplierReturn(ctx, ws, user, finance.CreateSupplierReturnInput{GoodsReceiptID: receipt.ID, EffectiveOn: "2026-11-11", Reason: "Damaged bags", IdempotencyKey: "return-one", Lines: []finance.SupplierReturnLineInput{{GoodsReceiptLineID: receiptLineID, Quantity: "2"}}})
	require.NoError(t, err)
	require.Equal(t, "20000", ret.TotalMinor)
	replay, err := svc.CreateSupplierReturn(ctx, ws, user, finance.CreateSupplierReturnInput{GoodsReceiptID: receipt.ID, EffectiveOn: "2026-11-11", Reason: "Damaged bags", IdempotencyKey: "return-one", Lines: []finance.SupplierReturnLineInput{{GoodsReceiptLineID: receiptLineID, Quantity: "2"}}})
	require.NoError(t, err)
	require.Equal(t, ret.ID, replay.ID)
	bill, err := svc.CreateSupplierBill(ctx, ws, user, finance.CreateSupplierBillInput{GoodsReceiptID: receipt.ID, SupplierInvoiceNumber: "RET-001", BillDate: "2026-11-11", IdempotencyKey: "return-bill"})
	require.NoError(t, err)
	bill, err = svc.ApproveSupplierBill(ctx, ws, user, bill.ID, finance.SupplierBillCommandInput{ExpectedVersion: bill.Version, IdempotencyKey: "return-bill-approve"})
	require.NoError(t, err)
	credit, err := svc.CreateSupplierCredit(ctx, ws, user, finance.CreateSupplierCreditInput{SupplierBillID: bill.ID, Amount: "100", Reason: "Return credit", IdempotencyKey: "return-credit"})
	require.NoError(t, err)
	require.Equal(t, "10000", credit.AmountMinor)
	account, err := svc.CreateAccount(ctx, ws, finance.CreateAccountInput{Name: "Refund bank", AccountType: "bank", Currency: "NGN"})
	require.NoError(t, err)
	refunded, err := svc.CreateSupplierRefund(ctx, ws, user, finance.CreateSupplierRefundInput{SupplierCreditID: credit.ID, MoneyAccountID: account.ID, Amount: "50", RefundDate: "2026-11-11", Reason: "Supplier refund", IdempotencyKey: "return-refund"})
	require.NoError(t, err)
	require.Equal(t, "5000", refunded.OutstandingMinor)
	var quantity string
	require.NoError(t, pool.QueryRow(ctx, `SELECT quantity_on_hand::text FROM inventory_balances WHERE workspace_id=$1 AND product_id=$2`, ws, product.ID).Scan(&quantity))
	require.Equal(t, "3.0000", quantity)
}
