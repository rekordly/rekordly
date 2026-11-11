package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type ApAgingBreakdown struct {
	CurrentMinor    string `json:"current_minor"`
	Days1To30Minor  string `json:"days_1_30_minor"`
	Days31To60Minor string `json:"days_31_60_minor"`
	Days61PlusMinor string `json:"days_61_plus_minor"`
}

type AgedUnbilledReceiptView struct {
	ReceiptID        int64   `json:"receipt_id"`
	ReceiptReference *string `json:"receipt_reference,omitempty"`
	PurchaseOrderID  *int64  `json:"purchase_order_id,omitempty"`
	SupplierID       *int64  `json:"supplier_id,omitempty"`
	ReceivedOn       string  `json:"received_on"`
	AgeDays          int32   `json:"age_days"`
	GrniMinor        string  `json:"grni_minor"`
}

type VarianceBillSummaryView struct {
	ID                    int64  `json:"id"`
	GoodsReceiptID        *int64 `json:"goods_receipt_id,omitempty"`
	SupplierID            int64  `json:"supplier_id"`
	SupplierInvoiceNumber string `json:"supplier_invoice_number"`
	BillDate              string `json:"bill_date"`
	TotalMinor            string `json:"total_minor"`
	VarianceMinor         string `json:"variance_minor"`
	MatchStatus           string `json:"match_status"`
	Status                string `json:"status"`
}

type PendingReturnSummaryView struct {
	ID             int64  `json:"id"`
	SupplierID     int64  `json:"supplier_id"`
	GoodsReceiptID int64  `json:"goods_receipt_id"`
	EffectiveOn    string `json:"effective_on"`
	TotalMinor     string `json:"total_minor"`
	CreditedMinor  string `json:"credited_minor"`
	Reason         string `json:"reason"`
}

type ProcurementReport struct {
	AsOfDate               string                     `json:"as_of_date"`
	OpenPurchaseOrderCount int64                      `json:"open_purchase_order_count"`
	OpenPurchaseOrderMinor string                     `json:"open_purchase_order_minor"`
	OrderedMinor           string                     `json:"ordered_minor"`
	ReceivedMinor          string                     `json:"received_minor"`
	UnbilledReceiptCount   int64                      `json:"unbilled_receipt_count"`
	GrniMinor              string                     `json:"grni_minor"`
	ApOutstandingMinor     string                     `json:"ap_outstanding_minor"`
	ApOverdueMinor         string                     `json:"ap_overdue_minor"`
	UnappliedAdvanceCount  int64                      `json:"unapplied_advance_count"`
	UnappliedAdvanceMinor  string                     `json:"unapplied_advance_minor"`
	UnappliedCreditCount   int64                      `json:"unapplied_credit_count"`
	UnappliedCreditMinor   string                     `json:"unapplied_credit_minor"`
	ApAging                ApAgingBreakdown           `json:"ap_aging"`
	AgedGrni               []AgedUnbilledReceiptView  `json:"aged_grni"`
	VarianceBills          []VarianceBillSummaryView  `json:"variance_bills"`
	PendingReturns         []PendingReturnSummaryView `json:"pending_returns"`
}

func (s *Service) GetProcurementReport(ctx context.Context, workspaceID int64, asOf string) (ProcurementReport, error) {
	date := time.Now().UTC()
	if asOf != "" {
		parsed, err := time.Parse("2006-01-02", asOf)
		if err != nil {
			return ProcurementReport{}, err
		}
		date = parsed
	}
	dateParam := pgtype.Date{Time: date, Valid: true}
	po, err := s.queries.GetOpenPurchaseOrderTotals(ctx, workspaceID)
	if err != nil {
		return ProcurementReport{}, err
	}
	grni, err := s.queries.GetGrniTotals(ctx, workspaceID)
	if err != nil {
		return ProcurementReport{}, err
	}
	ap, err := s.queries.GetApTotals(ctx, db.GetApTotalsParams{WorkspaceID: workspaceID, DueDate: dateParam})
	if err != nil {
		return ProcurementReport{}, err
	}
	advance, err := s.queries.GetAdvanceTotals(ctx, workspaceID)
	if err != nil {
		return ProcurementReport{}, err
	}
	ordered, err := s.queries.GetOrderedReceivedTotals(ctx, workspaceID)
	if err != nil {
		return ProcurementReport{}, err
	}
	aging, err := s.queries.GetApAgingBuckets(ctx, db.GetApAgingBucketsParams{WorkspaceID: workspaceID, DueDate: dateParam})
	if err != nil {
		return ProcurementReport{}, err
	}
	credits, err := s.queries.GetUnappliedCreditTotals(ctx, workspaceID)
	if err != nil {
		return ProcurementReport{}, err
	}
	agedRows, err := s.queries.ListAgedUnbilledReceipts(ctx, db.ListAgedUnbilledReceiptsParams{WorkspaceID: workspaceID, Column2: dateParam})
	if err != nil {
		return ProcurementReport{}, err
	}
	agedGrni := make([]AgedUnbilledReceiptView, 0, len(agedRows))
	for _, r := range agedRows {
		agedGrni = append(agedGrni, AgedUnbilledReceiptView{
			ReceiptID:        r.ReceiptID,
			ReceiptReference: nullableText(r.ReceiptReference),
			PurchaseOrderID:  nullableInt8(r.PurchaseOrderID),
			SupplierID:       nullableInt8(r.SupplierID),
			ReceivedOn:       r.ReceivedOn.Time.Format("2006-01-02"),
			AgeDays:          r.AgeDays,
			GrniMinor:        fmt.Sprint(r.GrniMinor),
		})
	}
	varRows, err := s.queries.ListVarianceSupplierBills(ctx, workspaceID)
	if err != nil {
		return ProcurementReport{}, err
	}
	varianceBills := make([]VarianceBillSummaryView, 0, len(varRows))
	for _, b := range varRows {
		varianceBills = append(varianceBills, VarianceBillSummaryView{
			ID:                    b.ID,
			GoodsReceiptID:        nullableInt8(b.GoodsReceiptID),
			SupplierID:            b.SupplierID,
			SupplierInvoiceNumber: b.SupplierInvoiceNumber,
			BillDate:              b.BillDate.Time.Format("2006-01-02"),
			TotalMinor:            fmt.Sprint(b.TotalMinor),
			VarianceMinor:         fmt.Sprint(b.VarianceMinor),
			MatchStatus:           b.MatchStatus,
			Status:                b.Status,
		})
	}
	retRows, err := s.queries.ListReturnsAwaitingResolution(ctx, workspaceID)
	if err != nil {
		return ProcurementReport{}, err
	}
	pendingReturns := make([]PendingReturnSummaryView, 0, len(retRows))
	for _, r := range retRows {
		pendingReturns = append(pendingReturns, PendingReturnSummaryView{
			ID:             r.ID,
			SupplierID:     r.SupplierID,
			GoodsReceiptID: r.GoodsReceiptID,
			EffectiveOn:    r.EffectiveOn.Time.Format("2006-01-02"),
			TotalMinor:     fmt.Sprint(r.TotalMinor),
			CreditedMinor:  fmt.Sprint(r.CreditedMinor),
			Reason:         r.Reason,
		})
	}

	return ProcurementReport{
		AsOfDate:               date.Format("2006-01-02"),
		OpenPurchaseOrderCount: po.OrderCount,
		OpenPurchaseOrderMinor: fmt.Sprint(po.TotalMinor),
		OrderedMinor:           fmt.Sprint(ordered.OrderedMinor),
		ReceivedMinor:          fmt.Sprint(ordered.ReceivedMinor),
		UnbilledReceiptCount:   grni.ReceiptCount,
		GrniMinor:              fmt.Sprint(grni.TotalMinor),
		ApOutstandingMinor:     fmt.Sprint(ap.OutstandingMinor),
		ApOverdueMinor:         fmt.Sprint(ap.OverdueMinor),
		UnappliedAdvanceCount:  advance.AdvanceCount,
		UnappliedAdvanceMinor:  fmt.Sprint(advance.AvailableMinor),
		UnappliedCreditCount:   credits.CreditCount,
		UnappliedCreditMinor:   fmt.Sprint(credits.OutstandingMinor),
		ApAging: ApAgingBreakdown{
			CurrentMinor:    fmt.Sprint(aging.CurrentMinor),
			Days1To30Minor:  fmt.Sprint(aging.Days130Minor),
			Days31To60Minor: fmt.Sprint(aging.Days3160Minor),
			Days61PlusMinor: fmt.Sprint(aging.Days61PlusMinor),
		},
		AgedGrni:       agedGrni,
		VarianceBills:  varianceBills,
		PendingReturns: pendingReturns,
	}, nil
}
