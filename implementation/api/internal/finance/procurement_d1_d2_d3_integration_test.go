package finance_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestProcurementD1D2D3Integration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := finance.NewService(pool)
	q := db.New(pool)

	suffix := time.Now().UnixNano() % 1000000000
	wsA, userA := createTestWorkspace(t, pool, fmt.Sprintf("proc-d123-a-%d", suffix))
	wsB, _ := createTestWorkspace(t, pool, fmt.Sprintf("proc-d123-b-%d", suffix))

	// Create a supplier in wsA
	supp, err := svc.CreateCounterparty(ctx, wsA, finance.CreateCounterpartyInput{
		Name:      fmt.Sprintf("Dangote Tech %d", suffix),
		PartyType: "supplier",
	})
	require.NoError(t, err)

	// Create bank account in wsA
	acct, err := svc.CreateAccount(ctx, wsA, finance.CreateAccountInput{
		Name:        fmt.Sprintf("Main Bank %d", suffix),
		AccountType: "bank",
		Currency:    "NGN",
	})
	require.NoError(t, err)

	// Create product in wsA
	prod, err := svc.CreateProductV2(ctx, wsA, userA, finance.SaveProductInput{
		Name:           "Procurement Test Item",
		Kind:           "stock_tracked",
		Status:         "active",
		UnitName:       "pc",
		SellingPrice:   "5000",
		CostPrice:      "3000",
		Currency:       "NGN",
		IdempotencyKey: fmt.Sprintf("p-proc-%d", suffix),
	})
	require.NoError(t, err)

	// 1. Create a Purchase Order
	po, err := svc.CreateDirectPurchaseOrder(ctx, wsA, userA, finance.CreatePurchaseOrderInput{
		SupplierID: supp.ID,
		Currency:   "NGN",
		Lines: []finance.PurchaseOrderLineInput{
			{
				ProductID:        &prod.Product.ID,
				Quantity:         "10",
				ExpectedUnitCost: "3000.00",
			},
		},
		Issue:          true,
		CanApprove:     true,
		IdempotencyKey: fmt.Sprintf("po-dir-%d", suffix),
	})
	require.NoError(t, err)
	require.Equal(t, "issued", po.Status)

	var poLineID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM purchase_order_lines WHERE workspace_id=$1 AND purchase_order_id=$2`, wsA, po.ID).Scan(&poLineID))

	// D1: Verify PO Events have ActorName
	poDetail, err := svc.GetPurchaseOrder(ctx, wsA, po.ID)
	require.NoError(t, err)
	require.NotEmpty(t, poDetail.Events)
	require.NotEmpty(t, poDetail.Events[0].ActorName)

	// 2. Receive goods and create bill
	grRes, err := svc.CreateGoodsReceipt(ctx, wsA, userA, finance.CreateGoodsReceiptInput{
		PurchaseOrderID: po.ID,
		SupplierID:      supp.ID,
		ReceivedOn:      time.Now().Format("2006-01-02"),
		Lines: []finance.GoodsReceiptLineInput{
			{
				PurchaseOrderLineID: poLineID,
				ProductID:           &prod.Product.ID,
				AcceptedQuantity:    "10",
				ActualUnitCost:      "3000.00",
			},
		},
		Bill: &finance.ReceiptBillInput{
			SupplierInvoiceNumber: fmt.Sprintf("INV-%d", suffix),
			BillDate:              time.Now().Format("2006-01-02"),
			DueDate:               time.Now().AddDate(0, 0, 30).Format("2006-01-02"),
			Approve:               true,
		},
		Payment: &finance.ReceiptPaymentInput{
			AccountID:   acct.ID,
			Amount:      "30000.00",
			PaymentDate: time.Now().Format("2006-01-02"),
			Reference:   fmt.Sprintf("PAY-%d", suffix),
		},
		IdempotencyKey: fmt.Sprintf("gr-c2-%d", suffix),
	})
	require.NoError(t, err)
	require.NotNil(t, grRes.Bill)
	billID := grRes.Bill.ID

	// D1: Verify Supplier Bill lines have ExpectedUnitCostMinor & VarianceMinor
	billDetail, err := svc.GetSupplierBill(ctx, wsA, billID)
	require.NoError(t, err)
	require.NotEmpty(t, billDetail.Lines)
	require.Equal(t, "300000", billDetail.Lines[0].ExpectedUnitCostMinor)
	require.Equal(t, "0", billDetail.Lines[0].VarianceMinor)

	// D1: Verify Supplier Bill has Payments and Events
	require.NotEmpty(t, billDetail.Payments)
	require.Equal(t, "3000000", billDetail.Payments[0].AmountMinor)
	require.NotEmpty(t, billDetail.Events)
	require.Equal(t, "approved", billDetail.Events[0].EventType)
	require.Equal(t, "created", billDetail.Events[len(billDetail.Events)-1].EventType)

	// D2: Document Message Read Tracking
	// Create guest message on PO
	msgGuest, err := q.CreateExternalMessage(ctx, db.CreateExternalMessageParams{
		WorkspaceID:  wsA,
		DocumentType: "purchase_order",
		DocumentID:   po.ID,
		SenderType:   "guest",
		SenderName:   "Dangote Rep",
		Message:      "Order received, processing",
	})
	require.NoError(t, err)

	// Check unread count (should be 1)
	unread1, err := q.CountUnreadDocumentMessages(ctx, db.CountUnreadDocumentMessagesParams{
		WorkspaceID:  wsA,
		DocumentType: "purchase_order",
		DocumentID:   po.ID,
		UserID:       userA,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), unread1)

	// Mark read
	err = q.UpsertDocumentMessageRead(ctx, db.UpsertDocumentMessageReadParams{
		WorkspaceID:       wsA,
		UserID:            userA,
		DocumentType:      "purchase_order",
		DocumentID:        po.ID,
		LastReadMessageID: msgGuest.ID,
	})
	require.NoError(t, err)

	// Check unread count after marking read (should be 0)
	unread2, err := q.CountUnreadDocumentMessages(ctx, db.CountUnreadDocumentMessagesParams{
		WorkspaceID:  wsA,
		DocumentType: "purchase_order",
		DocumentID:   po.ID,
		UserID:       userA,
	})
	require.NoError(t, err)
	require.Equal(t, int64(0), unread2)

	// D3: Document Files Attachment
	// Attach file using uploaded file details ({ asset_id, file_name, mime_type, size_bytes })
	docFile, err := svc.AttachDocumentFile(ctx, wsA, userA, "purchase_order", po.ID, finance.AttachDocumentFileInput{
		AssetID:   fmt.Sprintf("evidence/%d/invoice.pdf", suffix),
		FileName:  "invoice.pdf",
		MimeType:  "application/pdf",
		SizeBytes: 2048,
	})
	require.NoError(t, err)
	require.NotZero(t, docFile.ID)
	require.NotZero(t, docFile.EvidenceID)
	require.Equal(t, "invoice.pdf", docFile.FileName)

	// Verify PO detail now includes the attached file
	poWithFile, err := svc.GetPurchaseOrder(ctx, wsA, po.ID)
	require.NoError(t, err)
	require.Len(t, poWithFile.Files, 1)
	require.Equal(t, "invoice.pdf", poWithFile.Files[0].FileName)

	// Isolation: Workspace B cannot attach Workspace A's evidence asset
	_, err = svc.AttachDocumentFile(ctx, wsB, userA, "purchase_order", po.ID, finance.AttachDocumentFileInput{
		EvidenceID: docFile.EvidenceID,
	})
	require.Error(t, err)

	// Same workspace can attach existing evidence_id to another document (e.g. supplier bill)
	billFile, err := svc.AttachDocumentFile(ctx, wsA, userA, "supplier_bill", billID, finance.AttachDocumentFileInput{
		EvidenceID: docFile.EvidenceID,
	})
	require.NoError(t, err)
	require.NotZero(t, billFile.ID)

	// Delete file from PO
	delCount, err := q.DeleteDocumentFile(ctx, db.DeleteDocumentFileParams{
		WorkspaceID:  wsA,
		DocumentType: "purchase_order",
		DocumentID:   po.ID,
		ID:           docFile.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), delCount)

	// Verify PO detail no longer includes the file
	poAfterDel, err := svc.GetPurchaseOrder(ctx, wsA, po.ID)
	require.NoError(t, err)
	require.Empty(t, poAfterDel.Files)

	// Workspace B isolation: cannot delete wsA files
	delWsB, err := q.DeleteDocumentFile(ctx, db.DeleteDocumentFileParams{
		WorkspaceID:  wsB,
		DocumentType: "supplier_bill",
		DocumentID:   billID,
		ID:           billFile.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(0), delWsB)
	require.NoError(t, err)
	require.Equal(t, int64(0), delWsB)
}
