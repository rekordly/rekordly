package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestGoodsReceiptPostsImmutableStockMovementAndBalancedGRNI(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "receipt-a")
	service := finance.NewService(pool)
	ctx := context.Background()

	product, err := service.CreateCatalogueItem(ctx, workspaceID, userID, finance.CreateCatalogueItemInput{Name: "Stock paper", Kind: "stock_tracked", SellingPrice: "2500.50", Currency: "NGN", IdempotencyKey: "receipt-product"})
	require.NoError(t, err)
	request, err := service.CreatePurchaseRequest(ctx, workspaceID, userID, finance.CreatePurchaseRequestInput{Reason: "Receive stock", Currency: "NGN", IdempotencyKey: "receipt-request", Lines: []finance.PurchaseRequestLineInput{{ProductID: &product.ID, Description: "Stock paper", Quantity: "2", UnitName: "ream", EstimatedUnitPrice: "2500.50"}}})
	require.NoError(t, err)
	submitted, err := service.SubmitPurchaseRequest(ctx, workspaceID, userID, request.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: request.Version, IdempotencyKey: "receipt-request-submit"})
	require.NoError(t, err)
	approved, err := service.ApprovePurchaseRequest(ctx, workspaceID, userID, request.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: submitted.Version, IdempotencyKey: "receipt-request-approve"})
	require.NoError(t, err)
	order, err := service.CreatePurchaseOrderFromRequest(ctx, workspaceID, userID, approved.ID, "receipt-po-create")
	require.NoError(t, err)
	order, err = service.AdvancePurchaseOrder(ctx, workspaceID, userID, order.ID, order.Version, "submitted", "receipt-po-submit")
	require.NoError(t, err)
	order, err = service.AdvancePurchaseOrder(ctx, workspaceID, userID, order.ID, order.Version, "approved", "receipt-po-approve")
	require.NoError(t, err)
	order, err = service.AdvancePurchaseOrder(ctx, workspaceID, userID, order.ID, order.Version, "issued", "receipt-po-issue")
	require.NoError(t, err)

	var poLineID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM purchase_order_lines WHERE workspace_id=$1 AND purchase_order_id=$2`, workspaceID, order.ID).Scan(&poLineID))
	receipt, err := service.CreateGoodsReceipt(ctx, workspaceID, userID, finance.CreateGoodsReceiptInput{PurchaseOrderID: order.ID, ReceivedOn: "2026-11-10", IdempotencyKey: "receipt-one", Lines: []finance.GoodsReceiptLineInput{{PurchaseOrderLineID: poLineID, AcceptedQuantity: "1"}}})
	require.NoError(t, err)
	require.Equal(t, "partially_received", receipt.PurchaseOrderStatus)
	require.Equal(t, "250050", receipt.TotalMinor)
	replayed, err := service.CreateGoodsReceipt(ctx, workspaceID, userID, finance.CreateGoodsReceiptInput{PurchaseOrderID: order.ID, ReceivedOn: "2026-11-10", IdempotencyKey: "receipt-one", Lines: []finance.GoodsReceiptLineInput{{PurchaseOrderLineID: poLineID, AcceptedQuantity: "1"}}})
	require.NoError(t, err)
	require.Equal(t, receipt.ID, replayed.ID)

	var movementCount, movementValue, debits, credits int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*),coalesce(sum(value_delta_minor),0) FROM inventory_movements WHERE workspace_id=$1 AND product_id=$2`, workspaceID, product.ID).Scan(&movementCount, &movementValue))
	require.Equal(t, int64(1), movementCount)
	require.Equal(t, int64(250050), movementValue)
	require.NoError(t, pool.QueryRow(ctx, `SELECT coalesce(sum(debit_minor),0),coalesce(sum(credit_minor),0) FROM ledger_lines WHERE workspace_id=$1`, workspaceID).Scan(&debits, &credits))
	require.Equal(t, debits, credits)
	require.Equal(t, int64(250050), debits)

	finished, err := service.CreateGoodsReceipt(ctx, workspaceID, userID, finance.CreateGoodsReceiptInput{PurchaseOrderID: order.ID, ReceivedOn: "2026-11-10", IdempotencyKey: "receipt-two", Lines: []finance.GoodsReceiptLineInput{{PurchaseOrderLineID: poLineID, AcceptedQuantity: "1"}}})
	require.NoError(t, err)
	require.Equal(t, "fully_received", finished.PurchaseOrderStatus)
	_, err = service.CreateGoodsReceipt(ctx, workspaceID, userID, finance.CreateGoodsReceiptInput{PurchaseOrderID: order.ID, ReceivedOn: "2026-11-10", IdempotencyKey: "receipt-over", Lines: []finance.GoodsReceiptLineInput{{PurchaseOrderLineID: poLineID, AcceptedQuantity: "0.1"}}})
	require.Error(t, err)
}
