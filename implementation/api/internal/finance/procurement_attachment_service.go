package finance

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"strings"
)

type ProcurementAttachmentInput struct {
	PurchaseRequestID int64  `json:"purchase_request_id"`
	PurchaseOrderID   int64  `json:"purchase_order_id"`
	GoodsReceiptID    int64  `json:"goods_receipt_id"`
	SupplierBillID    int64  `json:"supplier_bill_id"`
	StorageKey        string `json:"storage_key"`
	FileName          string `json:"file_name"`
	MimeType          string `json:"mime_type"`
	FileSizeBytes     int64  `json:"file_size_bytes"`
}

func (s *Service) AddProcurementAttachment(ctx context.Context, workspaceID, userID int64, in ProcurementAttachmentInput) (db.ProcurementAttachment, error) {
	if strings.TrimSpace(in.StorageKey) == "" || strings.TrimSpace(in.FileName) == "" || strings.TrimSpace(in.MimeType) == "" || in.FileSizeBytes <= 0 {
		return db.ProcurementAttachment{}, errors.New("file metadata is required")
	}
	parents := []int64{in.PurchaseRequestID, in.PurchaseOrderID, in.GoodsReceiptID, in.SupplierBillID}
	count := 0
	for _, id := range parents {
		if id > 0 {
			count++
		}
	}
	if count != 1 {
		return db.ProcurementAttachment{}, errors.New("exactly one procurement document is required")
	}
	req, po, gr, bill := pgtype.Int8{}, pgtype.Int8{}, pgtype.Int8{}, pgtype.Int8{}
	if in.PurchaseRequestID > 0 {
		req = pgtype.Int8{Int64: in.PurchaseRequestID, Valid: true}
	}
	if in.PurchaseOrderID > 0 {
		po = pgtype.Int8{Int64: in.PurchaseOrderID, Valid: true}
	}
	if in.GoodsReceiptID > 0 {
		gr = pgtype.Int8{Int64: in.GoodsReceiptID, Valid: true}
	}
	if in.SupplierBillID > 0 {
		bill = pgtype.Int8{Int64: in.SupplierBillID, Valid: true}
	}
	valid, err := s.queries.ProcurementParentExists(ctx, db.ProcurementParentExistsParams{WorkspaceID: workspaceID, PurchaseRequestID: req, PurchaseOrderID: po, GoodsReceiptID: gr, SupplierBillID: bill})
	if err != nil || !valid.Valid || !valid.Bool {
		return db.ProcurementAttachment{}, ErrNotFound
	}
	return s.queries.CreateProcurementAttachment(ctx, db.CreateProcurementAttachmentParams{WorkspaceID: workspaceID, PurchaseRequestID: req, PurchaseOrderID: po, GoodsReceiptID: gr, SupplierBillID: bill, StorageKey: strings.TrimSpace(in.StorageKey), FileName: strings.TrimSpace(in.FileName), MimeType: strings.TrimSpace(in.MimeType), FileSizeBytes: in.FileSizeBytes, CreatedByUserID: userID})
}

func (s *Service) ListProcurementAttachments(ctx context.Context, workspaceID int64, in ProcurementAttachmentInput) ([]db.ProcurementAttachment, error) {
	req, po, gr, bill := pgtype.Int8{}, pgtype.Int8{}, pgtype.Int8{}, pgtype.Int8{}
	if in.PurchaseRequestID > 0 {
		req = pgtype.Int8{Int64: in.PurchaseRequestID, Valid: true}
	}
	if in.PurchaseOrderID > 0 {
		po = pgtype.Int8{Int64: in.PurchaseOrderID, Valid: true}
	}
	if in.GoodsReceiptID > 0 {
		gr = pgtype.Int8{Int64: in.GoodsReceiptID, Valid: true}
	}
	if in.SupplierBillID > 0 {
		bill = pgtype.Int8{Int64: in.SupplierBillID, Valid: true}
	}
	return s.queries.ListProcurementAttachments(ctx, db.ListProcurementAttachmentsParams{WorkspaceID: workspaceID, PurchaseRequestID: req, PurchaseOrderID: po, GoodsReceiptID: gr, SupplierBillID: bill})
}
