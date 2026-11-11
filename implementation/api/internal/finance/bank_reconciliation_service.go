package finance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/db"
)

type BankReconciliationService struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewBankReconciliationService(pool *pgxpool.Pool, queries *db.Queries) *BankReconciliationService {
	return &BankReconciliationService{
		pool:    pool,
		queries: queries,
	}
}

type StartReconciliationInput struct {
	MoneyAccountID         int64  `json:"money_account_id" binding:"required"`
	StatementDate          string `json:"statement_date" binding:"required"`
	StatementBalanceMinor  int64  `json:"statement_balance_minor"`
	Notes                  string `json:"notes"`
}

func (s *BankReconciliationService) StartReconciliation(
	ctx context.Context,
	workspaceID int64,
	in StartReconciliationInput,
) (db.BankReconciliation, error) {
	stmtDate, err := time.Parse("2006-01-02", in.StatementDate)
	if err != nil {
		return db.BankReconciliation{}, errors.New("statement_date must be YYYY-MM-DD")
	}

	acc, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{
		ID:          in.MoneyAccountID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return db.BankReconciliation{}, fmt.Errorf("money account not found: %w", err)
	}

	ledgerBalance := acc.CurrentBalanceMinor
	diff := in.StatementBalanceMinor - ledgerBalance

	recon, err := s.queries.CreateBankReconciliation(ctx, db.CreateBankReconciliationParams{
		WorkspaceID:            workspaceID,
		MoneyAccountID:         in.MoneyAccountID,
		StatementDate:          pgtype.Date{Time: stmtDate, Valid: true},
		StatementBalanceMinor:  in.StatementBalanceMinor,
		LedgerBalanceMinor:     ledgerBalance,
		DifferenceMinor:        diff,
		Status:                 "in_progress",
		Notes:                  optionalPgText(in.Notes),
	})
	if err != nil {
		return db.BankReconciliation{}, fmt.Errorf("create reconciliation: %w", err)
	}

	return recon, nil
}

func (s *BankReconciliationService) MatchTransaction(
	ctx context.Context,
	workspaceID int64,
	reconID int64,
	txID int64,
) (db.BankReconciliationMatch, error) {
	recon, err := s.queries.GetBankReconciliationByID(ctx, db.GetBankReconciliationByIDParams{
		ID:          reconID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return db.BankReconciliationMatch{}, ErrNotFound
	}
	if recon.Status != "in_progress" {
		return db.BankReconciliationMatch{}, errors.New("reconciliation is not in progress")
	}

	match, err := s.queries.CreateReconciliationMatch(ctx, db.CreateReconciliationMatchParams{
		WorkspaceID:      workspaceID,
		ReconciliationID: reconID,
		TransactionID:    txID,
		MatchStatus:      "cleared",
	})
	if err != nil {
		return db.BankReconciliationMatch{}, fmt.Errorf("match transaction: %w", err)
	}
	return match, nil
}

func (s *BankReconciliationService) UnmatchTransaction(
	ctx context.Context,
	workspaceID int64,
	reconID int64,
	txID int64,
) error {
	return s.queries.DeleteReconciliationMatch(ctx, db.DeleteReconciliationMatchParams{
		WorkspaceID:      workspaceID,
		ReconciliationID: reconID,
		TransactionID:    txID,
	})
}

func (s *BankReconciliationService) CompleteReconciliation(
	ctx context.Context,
	workspaceID int64,
	userID int64,
	reconID int64,
) (db.BankReconciliation, error) {
	recon, err := s.queries.GetBankReconciliationByID(ctx, db.GetBankReconciliationByIDParams{
		ID:          reconID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return db.BankReconciliation{}, ErrNotFound
	}
	if recon.Status != "in_progress" {
		return db.BankReconciliation{}, errors.New("reconciliation is already finalized")
	}

	return s.queries.CompleteBankReconciliation(ctx, db.CompleteBankReconciliationParams{
		ID:                 reconID,
		WorkspaceID:        workspaceID,
		ReconciledByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
}

func (s *BankReconciliationService) ListReconciliations(
	ctx context.Context,
	workspaceID int64,
	accountID *int64,
) ([]db.BankReconciliation, error) {
	var accParam pgtype.Int8
	if accountID != nil {
		accParam = pgtype.Int8{Int64: *accountID, Valid: true}
	}
	return s.queries.ListBankReconciliations(ctx, db.ListBankReconciliationsParams{
		WorkspaceID:    workspaceID,
		MoneyAccountID: accParam,
		Limit:          50,
	})
}

func (s *BankReconciliationService) GetReconciliationDetail(
	ctx context.Context,
	workspaceID int64,
	reconID int64,
) (db.BankReconciliation, []db.BankReconciliationMatch, error) {
	recon, err := s.queries.GetBankReconciliationByID(ctx, db.GetBankReconciliationByIDParams{
		ID:          reconID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return db.BankReconciliation{}, nil, ErrNotFound
	}

	matches, err := s.queries.ListReconciliationMatches(ctx, db.ListReconciliationMatchesParams{
		WorkspaceID:      workspaceID,
		ReconciliationID: reconID,
	})
	if err != nil {
		return recon, nil, err
	}

	return recon, matches, nil
}
