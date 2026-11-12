package finance

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type ProcurementApprovalPolicyView struct {
	ApprovalThresholdMinor    string `json:"approval_threshold_minor"`
	AllowSelfApproval         bool   `json:"allow_self_approval"`
	PriceVarianceToleranceBps int32  `json:"price_variance_tolerance_bps"`
	QtyVarianceToleranceBps   int32  `json:"qty_variance_tolerance_bps"`
	AllowUnplannedReceipt     bool   `json:"allow_unplanned_receipt"`
	AllowOverReceipt          bool   `json:"allow_over_receipt"`
}

type UpdateProcurementApprovalPolicyInput struct {
	ApprovalThreshold         string `json:"approval_threshold"`
	AllowSelfApproval         *bool  `json:"allow_self_approval"`
	PriceVarianceToleranceBps *int32 `json:"price_variance_tolerance_bps"`
	QtyVarianceToleranceBps   *int32 `json:"qty_variance_tolerance_bps"`
	AllowUnplannedReceipt     *bool  `json:"allow_unplanned_receipt"`
	AllowOverReceipt          *bool  `json:"allow_over_receipt"`
}

func procurementPolicyView(policy db.ProcurementApprovalPolicy) ProcurementApprovalPolicyView {
	return ProcurementApprovalPolicyView{
		ApprovalThresholdMinor:    fmt.Sprint(policy.ApprovalThresholdMinor),
		AllowSelfApproval:         policy.AllowSelfApproval,
		PriceVarianceToleranceBps: policy.PriceVarianceToleranceBps,
		QtyVarianceToleranceBps:   policy.QtyVarianceToleranceBps,
		AllowUnplannedReceipt:     policy.AllowUnplannedReceipt,
		AllowOverReceipt:          policy.AllowOverReceipt,
	}
}

func (s *Service) GetProcurementApprovalPolicy(ctx context.Context, workspaceID int64) (ProcurementApprovalPolicyView, error) {
	policy, err := s.queries.GetProcurementApprovalPolicy(ctx, workspaceID)
	if errors.Is(err, pgx.ErrNoRows) {
		policy, err = s.queries.UpsertProcurementApprovalPolicy(ctx, db.UpsertProcurementApprovalPolicyParams{
			WorkspaceID:            workspaceID,
			ApprovalThresholdMinor: 0,
			AllowSelfApproval:      true,
		})
	}
	if err != nil {
		return ProcurementApprovalPolicyView{}, err
	}
	return procurementPolicyView(policy), nil
}

func (s *Service) UpdateProcurementApprovalPolicy(ctx context.Context, workspaceID, userID int64, in UpdateProcurementApprovalPolicyInput) (ProcurementApprovalPolicyView, error) {
	threshold, err := parseOptionalNonNegativeMajor(in.ApprovalThreshold, 2)
	if err != nil || threshold < 0 {
		return ProcurementApprovalPolicyView{}, errors.New("approval threshold must be a non-negative amount")
	}
	existing, err := s.queries.GetProcurementApprovalPolicy(ctx, workspaceID)
	if errors.Is(err, pgx.ErrNoRows) {
		existing = db.ProcurementApprovalPolicy{
			AllowSelfApproval:     true,
			AllowUnplannedReceipt: true,
			AllowOverReceipt:      false,
		}
	} else if err != nil {
		return ProcurementApprovalPolicyView{}, err
	}
	allow := existing.AllowSelfApproval
	if in.AllowSelfApproval != nil {
		allow = *in.AllowSelfApproval
	}
	priceBps := existing.PriceVarianceToleranceBps
	if in.PriceVarianceToleranceBps != nil {
		if *in.PriceVarianceToleranceBps < 0 || *in.PriceVarianceToleranceBps > 10000 {
			return ProcurementApprovalPolicyView{}, errors.New("price variance tolerance bps must be between 0 and 10000")
		}
		priceBps = *in.PriceVarianceToleranceBps
	}
	qtyBps := existing.QtyVarianceToleranceBps
	if in.QtyVarianceToleranceBps != nil {
		if *in.QtyVarianceToleranceBps < 0 || *in.QtyVarianceToleranceBps > 10000 {
			return ProcurementApprovalPolicyView{}, errors.New("quantity variance tolerance bps must be between 0 and 10000")
		}
		qtyBps = *in.QtyVarianceToleranceBps
	}
	allowUnplanned := existing.AllowUnplannedReceipt
	if in.AllowUnplannedReceipt != nil {
		allowUnplanned = *in.AllowUnplannedReceipt
	}
	allowOver := existing.AllowOverReceipt
	if in.AllowOverReceipt != nil {
		allowOver = *in.AllowOverReceipt
	}
	policy, err := s.queries.UpsertProcurementApprovalPolicyExtended(ctx, db.UpsertProcurementApprovalPolicyExtendedParams{
		WorkspaceID:               workspaceID,
		ApprovalThresholdMinor:    threshold,
		AllowSelfApproval:         allow,
		PriceVarianceToleranceBps: priceBps,
		QtyVarianceToleranceBps:   qtyBps,
		AllowUnplannedReceipt:     allowUnplanned,
		AllowOverReceipt:          allowOver,
		UpdatedByUserID:           pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return ProcurementApprovalPolicyView{}, err
	}
	return procurementPolicyView(policy), nil
}
