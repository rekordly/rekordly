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
	ApprovalThresholdMinor string `json:"approval_threshold_minor"`
	AllowSelfApproval      bool   `json:"allow_self_approval"`
}
type UpdateProcurementApprovalPolicyInput struct {
	ApprovalThreshold string `json:"approval_threshold"`
	AllowSelfApproval *bool  `json:"allow_self_approval"`
}

func procurementPolicyView(policy db.ProcurementApprovalPolicy) ProcurementApprovalPolicyView {
	return ProcurementApprovalPolicyView{ApprovalThresholdMinor: fmt.Sprint(policy.ApprovalThresholdMinor), AllowSelfApproval: policy.AllowSelfApproval}
}

func (s *Service) GetProcurementApprovalPolicy(ctx context.Context, workspaceID int64) (ProcurementApprovalPolicyView, error) {
	policy, err := s.queries.GetProcurementApprovalPolicy(ctx, workspaceID)
	if errors.Is(err, pgx.ErrNoRows) {
		policy, err = s.queries.UpsertProcurementApprovalPolicy(ctx, db.UpsertProcurementApprovalPolicyParams{WorkspaceID: workspaceID, ApprovalThresholdMinor: 0, AllowSelfApproval: true})
	}
	if err != nil {
		return ProcurementApprovalPolicyView{}, err
	}
	return procurementPolicyView(policy), nil
}

func (s *Service) UpdateProcurementApprovalPolicy(ctx context.Context, workspaceID, userID int64, in UpdateProcurementApprovalPolicyInput) (ProcurementApprovalPolicyView, error) {
	threshold, err := ParseMajorToMinor(in.ApprovalThreshold, 2)
	if err != nil || threshold < 0 {
		return ProcurementApprovalPolicyView{}, errors.New("approval threshold must be a non-negative amount")
	}
	allow := true
	if in.AllowSelfApproval != nil {
		allow = *in.AllowSelfApproval
	}
	policy, err := s.queries.UpsertProcurementApprovalPolicy(ctx, db.UpsertProcurementApprovalPolicyParams{WorkspaceID: workspaceID, ApprovalThresholdMinor: threshold, AllowSelfApproval: allow, UpdatedByUserID: pgtype.Int8{Int64: userID, Valid: true}})
	if err != nil {
		return ProcurementApprovalPolicyView{}, err
	}
	return procurementPolicyView(policy), nil
}
