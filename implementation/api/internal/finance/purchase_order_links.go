package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/rekordly/rekordly-api/internal/db"
)

// Documents linked to a purchase order, returned with its detail so the order page
// needs one request: the goods receipts, the bills, and per line how much arrived
// and how much was billed.

type PurchaseOrderReceiptView struct {
	ID               int64   `json:"id"`
	ReceiptReference *string `json:"receipt_reference,omitempty"`
	ReceivedOn       string  `json:"received_on"`
	Status           string  `json:"status"`
	TotalMinor       string  `json:"total_minor"`
	OutstandingMinor string  `json:"outstanding_minor"`
}

type PurchaseOrderBillView struct {
	ID                    int64   `json:"id"`
	GoodsReceiptID        int64   `json:"goods_receipt_id"`
	SupplierInvoiceNumber string  `json:"supplier_invoice_number"`
	BillDate              string  `json:"bill_date"`
	DueDate               *string `json:"due_date,omitempty"`
	Status                string  `json:"status"`
	TotalMinor            string  `json:"total_minor"`
	OutstandingMinor      string  `json:"outstanding_minor"`
	ApprovedAt            *string `json:"approved_at,omitempty"`
}

func (s *Service) attachPurchaseOrderLinks(ctx context.Context, ws int64, view *PurchaseOrderView) error {
	poID := pgtype.Int8{Int64: view.ID, Valid: true}

	received, err := s.queries.ListReceivedQuantityByPurchaseOrderLine(ctx, db.ListReceivedQuantityByPurchaseOrderLineParams{WorkspaceID: ws, PurchaseOrderID: poID})
	if err != nil {
		return fmt.Errorf("received quantities: %w", err)
	}
	rejected, err := s.queries.ListRejectedQuantityByPurchaseOrderLine(ctx, db.ListRejectedQuantityByPurchaseOrderLineParams{WorkspaceID: ws, PurchaseOrderID: poID})
	if err != nil {
		return fmt.Errorf("rejected quantities: %w", err)
	}
	billed, err := s.queries.ListBilledQuantityByPurchaseOrderLine(ctx, db.ListBilledQuantityByPurchaseOrderLineParams{WorkspaceID: ws, PurchaseOrderID: poID})
	if err != nil {
		return fmt.Errorf("billed quantities: %w", err)
	}
	receivedBy := map[int64]decimal.Decimal{}
	for _, row := range received {
		if row.PurchaseOrderLineID.Valid {
			receivedBy[row.PurchaseOrderLineID.Int64] = row.ReceivedQuantity
		}
	}
	rejectedBy := map[int64]decimal.Decimal{}
	for _, row := range rejected {
		rejectedBy[row.PurchaseOrderLineID] = row.RejectedQuantity
	}
	billedBy := map[int64]decimal.Decimal{}
	for _, row := range billed {
		billedBy[row.PurchaseOrderLineID] = row.BilledQuantity
	}
	for i := range view.Lines {
		id := view.Lines[i].ID
		view.Lines[i].ReceivedQuantity = receivedBy[id].StringFixed(4)
		view.Lines[i].RejectedQuantity = rejectedBy[id].StringFixed(4)
		view.Lines[i].BilledQuantity = billedBy[id].StringFixed(4)
	}

	receipts, err := s.queries.ListPurchaseOrderReceipts(ctx, db.ListPurchaseOrderReceiptsParams{WorkspaceID: ws, PurchaseOrderID: poID})
	if err != nil {
		return fmt.Errorf("receipts: %w", err)
	}
	view.Receipts = make([]PurchaseOrderReceiptView, 0, len(receipts))
	for _, r := range receipts {
		sum := s.receiptBillSummary(ctx, ws, r.ID)
		view.Receipts = append(view.Receipts, PurchaseOrderReceiptView{
			ID:               r.ID,
			ReceiptReference: nullableText(r.ReceiptReference),
			ReceivedOn:       r.ReceivedOn.Time.Format("2006-01-02"),
			Status:           sum.status,
			TotalMinor:       fmt.Sprint(sum.linesTotal),
			OutstandingMinor: fmt.Sprint(sum.outstandingMinor),
		})
	}

	bills, err := s.queries.ListPurchaseOrderBills(ctx, db.ListPurchaseOrderBillsParams{WorkspaceID: ws, PurchaseOrderID: poID})
	if err != nil {
		return fmt.Errorf("bills: %w", err)
	}
	var paid int64
	view.Bills = make([]PurchaseOrderBillView, 0, len(bills))
	for _, b := range bills {
		bill := PurchaseOrderBillView{
			ID:                    b.ID,
			GoodsReceiptID:        b.GoodsReceiptID.Int64,
			SupplierInvoiceNumber: b.SupplierInvoiceNumber,
			BillDate:              b.BillDate.Time.Format("2006-01-02"),
			Status:                b.Status,
			TotalMinor:            fmt.Sprint(b.TotalMinor),
			OutstandingMinor:      fmt.Sprint(b.OutstandingMinor),
		}
		if b.DueDate.Valid {
			due := b.DueDate.Time.Format("2006-01-02")
			bill.DueDate = &due
		}
		if b.ApprovedAt.Valid {
			at := b.ApprovedAt.Time.UTC().Format(time.RFC3339)
			bill.ApprovedAt = &at
		}
		if b.Status != "draft" && b.Status != "disputed" && b.TotalMinor > b.OutstandingMinor {
			paid += b.TotalMinor - b.OutstandingMinor
		}
		view.Bills = append(view.Bills, bill)
	}
	view.PaidMinor = fmt.Sprint(paid)
	return nil
}
