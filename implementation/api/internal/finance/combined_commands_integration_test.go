package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestCombinedIssuePurchaseOrder(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "issue-po-ws")
	service := finance.NewService(pool)
	ctx := context.Background()

	supplier, err := service.CreateCounterparty(ctx, workspaceID, finance.CreateCounterpartyInput{Name: "Dangote Logistics", PartyType: "supplier"})
	require.NoError(t, err)

	product, err := service.CreateCatalogueItem(ctx, workspaceID, userID, finance.CreateCatalogueItemInput{
		Name: "Thermal Paper", Kind: "stock_tracked", SellingPrice: "31500.00", Currency: "NGN", IdempotencyKey: "item-thermal",
	})
	require.NoError(t, err)

	pid := product.ID

	// 1. Create a draft PO
	po, err := service.CreateDirectPurchaseOrder(ctx, workspaceID, userID, finance.CreatePurchaseOrderInput{
		SupplierID: supplier.ID,
		Currency:   "NGN",
		Lines: []finance.PurchaseOrderLineInput{{
			ProductID:        &pid,
			Description:      "Thermal Paper",
			Quantity:         "10",
			ExpectedUnitCost: "31500.00",
		}},
		IdempotencyKey: "po-issue-test-1",
	})
	require.NoError(t, err)
	require.Equal(t, "draft", po.Status)

	// 2. Issue in 1 command with canApprove = true and Share = true
	res, err := service.IssuePurchaseOrder(ctx, workspaceID, userID, po.ID, true, finance.IssuePurchaseOrderInput{
		Share:          true,
		IdempotencyKey: "issue-cmd-1",
	})
	require.NoError(t, err)
	require.Equal(t, "issued", res.Order.Status)
	require.NotNil(t, res.Share)
	token1 := res.Share.Token
	require.NotEmpty(t, token1)

	// 3. Link reuse: Issue again (or call with Share = true) returns same token
	res2, err := service.IssuePurchaseOrder(ctx, workspaceID, userID, po.ID, true, finance.IssuePurchaseOrderInput{
		Share:          true,
		IdempotencyKey: "issue-cmd-2",
	})
	require.NoError(t, err)
	require.NotNil(t, res2.Share)
	require.Equal(t, token1, res2.Share.Token, "active unexpired link must be reused")

	// 4. Permission check: When canApprove is false, stops at submitted
	po2, err := service.CreateDirectPurchaseOrder(ctx, workspaceID, userID, finance.CreatePurchaseOrderInput{
		SupplierID: supplier.ID,
		Currency:   "NGN",
		Lines: []finance.PurchaseOrderLineInput{{
			ProductID:        &pid,
			Description:      "Thermal Paper",
			Quantity:         "5",
			ExpectedUnitCost: "31500.00",
		}},
		IdempotencyKey: "po-issue-test-2",
	})
	require.NoError(t, err)

	resNoApprove, err := service.IssuePurchaseOrder(ctx, workspaceID, userID, po2.ID, false, finance.IssuePurchaseOrderInput{
		IdempotencyKey: "issue-no-appr",
	})
	require.NoError(t, err)
	require.Equal(t, "submitted", resNoApprove.StoppedAt)
	require.Equal(t, "submitted", resNoApprove.Order.Status)
	require.NotEmpty(t, resNoApprove.Message)
}

func TestCombinedGoodsReceiptWithBillAndPayment(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "receipt-bill-pay")
	service := finance.NewService(pool)
	ctx := context.Background()

	supplier, err := service.CreateCounterparty(ctx, workspaceID, finance.CreateCounterpartyInput{Name: "Bulk Supplier", PartyType: "supplier"})
	require.NoError(t, err)

	product, err := service.CreateCatalogueItem(ctx, workspaceID, userID, finance.CreateCatalogueItemInput{
		Name: "Cement Bag", Kind: "stock_tracked", SellingPrice: "8500.00", Currency: "NGN", IdempotencyKey: "item-cement",
	})
	require.NoError(t, err)
	pid := product.ID

	// Create money account for payment
	var accID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO money_accounts (workspace_id, name, account_type, currency, opening_balance_minor, current_balance_minor)
		VALUES ($1, 'Bank Account', 'bank', 'NGN', 50000000, 50000000) RETURNING id`, workspaceID).Scan(&accID))

	// Create draft PO
	po, err := service.CreateDirectPurchaseOrder(ctx, workspaceID, userID, finance.CreatePurchaseOrderInput{
		SupplierID: supplier.ID,
		Currency:   "NGN",
		Lines: []finance.PurchaseOrderLineInput{{
			ProductID:        &pid,
			Description:      "Cement Bag",
			Quantity:         "20",
			ExpectedUnitCost: "8000.00",
		}},
		IdempotencyKey: "po-cement-draft",
	})
	require.NoError(t, err)
	require.Equal(t, "draft", po.Status)

	var poLineID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM purchase_order_lines WHERE workspace_id=$1 AND purchase_order_id=$2`, workspaceID, po.ID).Scan(&poLineID))

	// Combined call: issue order + receive + bill + approve + pay
	grn, err := service.CreateGoodsReceipt(ctx, workspaceID, userID, finance.CreateGoodsReceiptInput{
		PurchaseOrderID: po.ID,
		ReceivedOn:      "2026-11-16",
		IssueOrder:      true,
		CanApprovePO:    true,
		Bill: &finance.ReceiptBillInput{
			SupplierInvoiceNumber: "INV-CEMENT-01",
			BillDate:              "2026-11-16",
			Approve:               true,
		},
		Payment: &finance.ReceiptPaymentInput{
			AccountID:   accID,
			Amount:      "160000.00",
			PaymentDate: "2026-11-16",
			Reference:   "PMT-CEMENT-01",
		},
		Lines: []finance.GoodsReceiptLineInput{{
			PurchaseOrderLineID: poLineID,
			AcceptedQuantity:    "20",
			ActualUnitCost:      "8000.00",
		}},
		IdempotencyKey: "grn-bill-pay-1",
	})
	require.NoError(t, err)
	require.Equal(t, "fully_received", grn.PurchaseOrderStatus)
	require.NotNil(t, grn.Bill)
	require.Equal(t, "paid", grn.Bill.Status)
	require.NotNil(t, grn.Payment)
	require.Equal(t, int64(16000000), grn.Payment.Payment.TotalAmountMinor)

	// Assert ledger is balanced: debits equal credits
	var debits, credits int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT coalesce(sum(debit_minor),0), coalesce(sum(credit_minor),0) FROM ledger_lines WHERE workspace_id=$1`, workspaceID).Scan(&debits, &credits))
	require.Greater(t, debits, int64(0))
	require.Equal(t, debits, credits, "ledger debits and credits must balance")

	// Assert inventory balance updated
	var qty string
	var val int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT coalesce(sum(quantity_on_hand),0)::numeric(18,4)::text, coalesce(sum(value_on_hand_minor),0) FROM inventory_balances WHERE workspace_id=$1 AND product_id=$2`, workspaceID, product.ID).Scan(&qty, &val))
	require.Equal(t, "20.0000", qty)
	require.Equal(t, int64(16000000), val)

	// Replay returns same result
	replayed, err := service.CreateGoodsReceipt(ctx, workspaceID, userID, finance.CreateGoodsReceiptInput{
		PurchaseOrderID: po.ID,
		ReceivedOn:      "2026-11-16",
		IssueOrder:      true,
		CanApprovePO:    true,
		Bill: &finance.ReceiptBillInput{
			SupplierInvoiceNumber: "INV-CEMENT-01",
			BillDate:              "2026-11-16",
			Approve:               true,
		},
		Payment: &finance.ReceiptPaymentInput{
			AccountID:   accID,
			Amount:      "160000.00",
			PaymentDate: "2026-11-16",
		},
		Lines: []finance.GoodsReceiptLineInput{{
			PurchaseOrderLineID: poLineID,
			AcceptedQuantity:    "20",
		}},
		IdempotencyKey: "grn-bill-pay-1",
	})
	require.NoError(t, err)
	require.Equal(t, grn.ID, replayed.ID)
}

func TestCombinedGoodsReceiptFailureRollback(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "receipt-rollback")
	service := finance.NewService(pool)
	ctx := context.Background()

	supplier, err := service.CreateCounterparty(ctx, workspaceID, finance.CreateCounterpartyInput{Name: "Rollback Supplier", PartyType: "supplier"})
	require.NoError(t, err)

	product, err := service.CreateCatalogueItem(ctx, workspaceID, userID, finance.CreateCatalogueItemInput{
		Name: "Test Item", Kind: "stock_tracked", SellingPrice: "1000.00", Currency: "NGN", IdempotencyKey: "item-rollback",
	})
	require.NoError(t, err)
	pid := product.ID

	po, err := service.CreateDirectPurchaseOrder(ctx, workspaceID, userID, finance.CreatePurchaseOrderInput{
		SupplierID: supplier.ID,
		Currency:   "NGN",
		Lines: []finance.PurchaseOrderLineInput{{
			ProductID:        &pid,
			Description:      "Test Item",
			Quantity:         "10",
			ExpectedUnitCost: "1000.00",
		}},
		IdempotencyKey: "po-rollback",
	})
	require.NoError(t, err)

	var poLineID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM purchase_order_lines WHERE workspace_id=$1 AND purchase_order_id=$2`, workspaceID, po.ID).Scan(&poLineID))

	// Attempt receipt with an invalid payment account ID (999999999) -> must fail and rollback everything
	_, err = service.CreateGoodsReceipt(ctx, workspaceID, userID, finance.CreateGoodsReceiptInput{
		PurchaseOrderID: po.ID,
		ReceivedOn:      "2026-11-16",
		IssueOrder:      true,
		CanApprovePO:    true,
		Bill: &finance.ReceiptBillInput{
			SupplierInvoiceNumber: "INV-FAIL",
			BillDate:              "2026-11-16",
			Approve:               true,
		},
		Payment: &finance.ReceiptPaymentInput{
			AccountID:   999999999, // non-existent account
			Amount:      "10000.00",
			PaymentDate: "2026-11-16",
		},
		Lines: []finance.GoodsReceiptLineInput{{
			PurchaseOrderLineID: poLineID,
			AcceptedQuantity:    "10",
			ActualUnitCost:      "1000.00",
		}},
		IdempotencyKey: "grn-fail-key",
	})
	require.Error(t, err)

	// Assert NOTHING saved
	var receiptCount, billCount, movementCount, ledgerCount int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM goods_receipts WHERE workspace_id=$1`, workspaceID).Scan(&receiptCount))
	require.Equal(t, 0, receiptCount, "goods receipt must be rolled back")
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM supplier_bills WHERE workspace_id=$1`, workspaceID).Scan(&billCount))
	require.Equal(t, 0, billCount, "supplier bill must be rolled back")
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM inventory_movements WHERE workspace_id=$1`, workspaceID).Scan(&movementCount))
	require.Equal(t, 0, movementCount, "inventory movement must be rolled back")
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM ledger_lines WHERE workspace_id=$1`, workspaceID).Scan(&ledgerCount))
	require.Equal(t, 0, ledgerCount, "ledger entries must be rolled back")
}

func TestPayGoodsReceiptCreatesBillAndPays(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "pay-grn-ws")
	service := finance.NewService(pool)
	ctx := context.Background()

	supplier, err := service.CreateCounterparty(ctx, workspaceID, finance.CreateCounterpartyInput{Name: "Paint Supplier", PartyType: "supplier"})
	require.NoError(t, err)

	product, err := service.CreateCatalogueItem(ctx, workspaceID, userID, finance.CreateCatalogueItemInput{
		Name: "Emulsion Paint", Kind: "stock_tracked", SellingPrice: "12000.00", Currency: "NGN", IdempotencyKey: "item-paint",
	})
	require.NoError(t, err)

	var accID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO money_accounts (workspace_id, name, account_type, currency, opening_balance_minor, current_balance_minor)
		VALUES ($1, 'Bank Account', 'bank', 'NGN', 20000000, 20000000) RETURNING id`, workspaceID).Scan(&accID))

	pid := product.ID

	// Create and receive unplanned goods receipt
	grn, err := service.CreateGoodsReceipt(ctx, workspaceID, userID, finance.CreateGoodsReceiptInput{
		SupplierID: supplier.ID,
		ReceivedOn: "2026-11-16",
		Lines: []finance.GoodsReceiptLineInput{{
			ProductID:        &pid,
			Description:      "Emulsion Paint",
			AcceptedQuantity: "5",
			ActualUnitCost:   "10000.00",
		}},
		IdempotencyKey: "grn-paint-unplanned",
	})
	require.NoError(t, err)

	// Call PayGoodsReceipt: creates bill from GRN lines, approves it, records payment in 1 atomic tx
	payRes, err := service.PayGoodsReceipt(ctx, workspaceID, userID, grn.ID, finance.GoodsReceiptPaymentInput{
		AccountID:      accID,
		Amount:         "50000.00",
		PaymentDate:    "2026-11-16",
		Reference:      "PMT-PAINT",
		IdempotencyKey: "pay-grn-paint-cmd",
	})
	require.NoError(t, err)
	require.Equal(t, "paid", payRes.Bill.Status)
	require.Equal(t, int64(5000000), payRes.Payment.Payment.TotalAmountMinor)

	// Assert ledger is balanced
	var debits, credits int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT coalesce(sum(debit_minor),0), coalesce(sum(credit_minor),0) FROM ledger_lines WHERE workspace_id=$1`, workspaceID).Scan(&debits, &credits))
	require.Equal(t, debits, credits)
}
