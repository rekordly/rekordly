package finance

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"time"
)

type ProcurementReport struct {
	AsOfDate               string `json:"as_of_date"`
	OpenPurchaseOrderCount int64  `json:"open_purchase_order_count"`
	OpenPurchaseOrderMinor string `json:"open_purchase_order_minor"`
	UnbilledReceiptCount   int64  `json:"unbilled_receipt_count"`
	GrniMinor              string `json:"grni_minor"`
	ApOutstandingMinor     string `json:"ap_outstanding_minor"`
	ApOverdueMinor         string `json:"ap_overdue_minor"`
	UnappliedAdvanceCount  int64  `json:"unapplied_advance_count"`
	UnappliedAdvanceMinor  string `json:"unapplied_advance_minor"`
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
	po, err := s.queries.GetOpenPurchaseOrderTotals(ctx, workspaceID)
	if err != nil {
		return ProcurementReport{}, err
	}
	grni, err := s.queries.GetGrniTotals(ctx, workspaceID)
	if err != nil {
		return ProcurementReport{}, err
	}
	ap, err := s.queries.GetApTotals(ctx, db.GetApTotalsParams{WorkspaceID: workspaceID, DueDate: pgtype.Date{Time: date, Valid: true}})
	if err != nil {
		return ProcurementReport{}, err
	}
	advance, err := s.queries.GetAdvanceTotals(ctx, workspaceID)
	if err != nil {
		return ProcurementReport{}, err
	}
	return ProcurementReport{AsOfDate: date.Format("2006-01-02"), OpenPurchaseOrderCount: po.OrderCount, OpenPurchaseOrderMinor: fmt.Sprint(po.TotalMinor), UnbilledReceiptCount: grni.ReceiptCount, GrniMinor: fmt.Sprint(grni.TotalMinor), ApOutstandingMinor: fmt.Sprint(ap.OutstandingMinor), ApOverdueMinor: fmt.Sprint(ap.OverdueMinor), UnappliedAdvanceCount: advance.AdvanceCount, UnappliedAdvanceMinor: fmt.Sprint(advance.AvailableMinor)}, nil
}
