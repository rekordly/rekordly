package finance_test

import (
	"context"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestEmbeddedSuppliersInDetailsAndLists(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "embed-sup-ws")
	service := finance.NewService(pool)
	ctx := context.Background()

	phone := "08012345678"
	email := "aliko@example.com"
	supplier, err := service.CreateCounterparty(ctx, workspaceID, finance.CreateCounterpartyInput{
		Name:      "Aliko Supplies",
		PartyType: "supplier",
		Phone:     phone,
		Email:     email,
	})
	require.NoError(t, err)

	product, err := service.CreateCatalogueItem(ctx, workspaceID, userID, finance.CreateCatalogueItemInput{
		Name: "Paper Rolls", Kind: "stock_tracked", SellingPrice: "5000.00", Currency: "NGN", IdempotencyKey: "item-roll-1",
	})
	require.NoError(t, err)
	pid := product.ID

	// 1. Purchase Request
	pr, err := service.CreatePurchaseRequest(ctx, workspaceID, userID, finance.CreatePurchaseRequestInput{
		SupplierID:     &supplier.ID,
		Reason:         "Need paper rolls",
		Priority:       "normal",
		Currency:       "NGN",
		IdempotencyKey: "pr-embed-test-1",
		Lines: []finance.PurchaseRequestLineInput{
			{ProductID: &pid, Description: "Paper Rolls", Quantity: "10", EstimatedUnitPrice: "4000.00"},
		},
	})
	require.NoError(t, err)
	require.NotNil(t, pr.Supplier)
	require.Equal(t, "Aliko Supplies", pr.Supplier.Name)
	require.Equal(t, "Aliko Supplies", pr.SupplierName)
	require.Equal(t, &phone, pr.Supplier.Phone)
	require.Equal(t, &email, pr.Supplier.Email)

	// Detail PR
	prDetail, err := service.GetPurchaseRequest(ctx, workspaceID, pr.ID)
	require.NoError(t, err)
	require.NotNil(t, prDetail.Supplier)
	require.Equal(t, "Aliko Supplies", prDetail.Supplier.Name)
	require.Equal(t, "Aliko Supplies", prDetail.SupplierName)

	// List PR
	prList, _, err := service.ListPurchaseRequests(ctx, workspaceID, finance.ListPurchaseRequestsFilter{Limit: 10})
	require.NoError(t, err)
	require.NotEmpty(t, prList)
	require.Equal(t, "Aliko Supplies", prList[0].SupplierName)
	require.NotNil(t, prList[0].Supplier)

	// 2. Purchase Order
	po, err := service.CreateDirectPurchaseOrder(ctx, workspaceID, userID, finance.CreatePurchaseOrderInput{
		SupplierID:     supplier.ID,
		Currency:       "NGN",
		IdempotencyKey: "po-embed-test-1",
		Lines: []finance.PurchaseOrderLineInput{
			{ProductID: &pid, Description: "Paper Rolls", Quantity: "10", ExpectedUnitCost: "4000.00"},
		},
	})
	require.NoError(t, err)

	poDetail, err := service.GetPurchaseOrderForUser(ctx, workspaceID, userID, po.ID)
	require.NoError(t, err)
	require.NotNil(t, poDetail.Supplier)
	require.Equal(t, "Aliko Supplies", poDetail.Supplier.Name)
	require.Equal(t, "Aliko Supplies", poDetail.SupplierName)

	poList, _, err := service.ListPurchaseOrders(ctx, workspaceID, 10, 0)
	require.NoError(t, err)
	require.NotEmpty(t, poList)
	require.Equal(t, "Aliko Supplies", poList[0].SupplierName)
	require.NotNil(t, poList[0].Supplier)

	// Issue order
	_, err = service.IssuePurchaseOrder(ctx, workspaceID, userID, po.ID, true, finance.IssuePurchaseOrderInput{
		IdempotencyKey: "issue-embed-po",
	})
	require.NoError(t, err)

	// 3. Goods Receipt
	grn, err := service.CreateGoodsReceipt(ctx, workspaceID, userID, finance.CreateGoodsReceiptInput{
		PurchaseOrderID: po.ID,
		SupplierID:      supplier.ID,
		ReceivedOn:      time.Now().Format("2006-01-02"),
		IdempotencyKey:  "grn-embed-test-1",
		Lines: []finance.GoodsReceiptLineInput{
			{PurchaseOrderLineID: po.Lines[0].ID, AcceptedQuantity: "10"},
		},
	})
	require.NoError(t, err)

	grnDetail, err := service.GetGoodsReceipt(ctx, workspaceID, grn.ID)
	require.NoError(t, err)
	require.NotNil(t, grnDetail.Supplier)
	require.Equal(t, "Aliko Supplies", grnDetail.Supplier.Name)
	require.Equal(t, "Aliko Supplies", grnDetail.SupplierName)

	grnList, _, err := service.ListGoodsReceipts(ctx, workspaceID, 10, 0)
	require.NoError(t, err)
	require.NotEmpty(t, grnList)
	require.Equal(t, "Aliko Supplies", grnList[0].SupplierName)
	require.NotNil(t, grnList[0].Supplier)

	// 4. Supplier Bill
	bill, err := service.CreateSupplierBill(ctx, workspaceID, userID, finance.CreateSupplierBillInput{
		GoodsReceiptID:        grn.ID,
		SupplierID:            supplier.ID,
		SupplierInvoiceNumber: "INV-ALIKO-101",
		BillDate:              time.Now().Format("2006-01-02"),
		IdempotencyKey:        "bill-embed-test-1",
		Lines: []finance.SupplierBillLineInput{
			{GoodsReceiptLineID: grnDetail.Lines[0].ID, Quantity: "10", UnitCost: "4000.00"},
		},
	})
	require.NoError(t, err)

	billDetail, err := service.GetSupplierBill(ctx, workspaceID, bill.ID)
	require.NoError(t, err)
	require.NotNil(t, billDetail.Supplier)
	require.Equal(t, "Aliko Supplies", billDetail.Supplier.Name)
	require.Equal(t, "Aliko Supplies", billDetail.SupplierName)

	billList, _, err := service.ListSupplierBills(ctx, workspaceID, 10, 0)
	require.NoError(t, err)
	require.NotEmpty(t, billList)
	require.Equal(t, "Aliko Supplies", billList[0].SupplierName)
	require.NotNil(t, billList[0].Supplier)
}

func TestCursorPagingAcrossLists(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "cursor-paging-ws")
	service := finance.NewService(pool)
	ctx := context.Background()

	supplier, err := service.CreateCounterparty(ctx, workspaceID, finance.CreateCounterpartyInput{
		Name:      "Paging Supplier",
		PartyType: "supplier",
	})
	require.NoError(t, err)

	// Create 3 POs
	for i := 1; i <= 3; i++ {
		_, err := service.CreateDirectPurchaseOrder(ctx, workspaceID, userID, finance.CreatePurchaseOrderInput{
			SupplierID:     supplier.ID,
			Currency:       "NGN",
			IdempotencyKey: "po-page-" + string(rune('0'+i)),
			Lines: []finance.PurchaseOrderLineInput{
				{Description: "Item", Quantity: "1", ExpectedUnitCost: "1000.00"},
			},
		})
		require.NoError(t, err)
	}

	// Page 1 with limit = 2
	page1, nextCursor, err := service.ListPurchaseOrders(ctx, workspaceID, 2, 0)
	require.NoError(t, err)
	require.Len(t, page1, 2)
	require.NotNil(t, nextCursor)

	// Page 2 with limit = 2 and before = *nextCursor
	page2, nextCursor2, err := service.ListPurchaseOrders(ctx, workspaceID, 2, *nextCursor)
	require.NoError(t, err)
	require.Len(t, page2, 1)
	require.Nil(t, nextCursor2, "no more items, nextCursor must be nil")

	// Ensure no overlapping IDs between page 1 and page 2
	require.NotEqual(t, page1[0].ID, page2[0].ID)
	require.NotEqual(t, page1[1].ID, page2[0].ID)
}

func TestPOUnreadCount(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "unread-po-ws")
	service := finance.NewService(pool)
	ctx := context.Background()

	supplier, err := service.CreateCounterparty(ctx, workspaceID, finance.CreateCounterpartyInput{
		Name:      "Chat Supplier",
		PartyType: "supplier",
	})
	require.NoError(t, err)

	po, err := service.CreateDirectPurchaseOrder(ctx, workspaceID, userID, finance.CreatePurchaseOrderInput{
		SupplierID:     supplier.ID,
		Currency:       "NGN",
		IdempotencyKey: "po-unread-1",
		Lines: []finance.PurchaseOrderLineInput{
			{Description: "Item", Quantity: "1", ExpectedUnitCost: "1000.00"},
		},
	})
	require.NoError(t, err)

	// Initially 0 unread
	detail0, err := service.GetPurchaseOrderForUser(ctx, workspaceID, userID, po.ID)
	require.NoError(t, err)
	require.Equal(t, int64(0), detail0.UnreadMessages)

	// Insert guest message
	var msgID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO external_messages (workspace_id, document_type, document_id, sender_type, sender_name, message)
		VALUES ($1, 'purchase_order', $2, 'guest', 'Supplier', 'When will this be approved?')
		RETURNING id
	`, workspaceID, po.ID).Scan(&msgID)
	require.NoError(t, err)

	// Now unread count is 1
	detail1, err := service.GetPurchaseOrderForUser(ctx, workspaceID, userID, po.ID)
	require.NoError(t, err)
	require.Equal(t, int64(1), detail1.UnreadMessages)

	// Insert team message - should NOT increase unread count for the user
	_, err = pool.Exec(ctx, `
		INSERT INTO external_messages (workspace_id, document_type, document_id, sender_type, sender_name, message)
		VALUES ($1, 'purchase_order', $2, 'team', 'Team', 'Approved today')
	`, workspaceID, po.ID)
	require.NoError(t, err)

	detail2, err := service.GetPurchaseOrderForUser(ctx, workspaceID, userID, po.ID)
	require.NoError(t, err)
	require.Equal(t, int64(1), detail2.UnreadMessages)

	// Mark read
	_, err = pool.Exec(ctx, `
		INSERT INTO document_message_reads (workspace_id, user_id, document_type, document_id, last_read_message_id)
		VALUES ($1, $2, 'purchase_order', $3, $4)
	`, workspaceID, userID, po.ID, msgID)
	require.NoError(t, err)

	// Now unread count drops to 0
	detail3, err := service.GetPurchaseOrderForUser(ctx, workspaceID, userID, po.ID)
	require.NoError(t, err)
	require.Equal(t, int64(0), detail3.UnreadMessages)
}
