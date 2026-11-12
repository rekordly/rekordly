package finance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrReconciliationUnbalanced = errors.New("reconciliation difference must be zero before completing")
	ErrReconciliationFinalized  = errors.New("reconciliation is already finalized")
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
	MoneyAccountID        int64          `json:"money_account_id" binding:"required"`
	StatementDate         string         `json:"statement_date" binding:"required"`
	StatementBalanceMinor int64          `json:"statement_balance_minor"`
	ReconciliationType    string         `json:"reconciliation_type"` // bank | cash
	Denominations         map[string]int `json:"denominations"`
	Notes                 string         `json:"notes"`
}

type ReconTransactionView struct {
	ID            int64  `json:"id"`
	Direction     string `json:"direction"`
	SignedMinor   int64  `json:"signed_minor"`
	AmountMinor   int64  `json:"amount_minor"`
	Currency      string `json:"currency"`
	EffectiveDate string `json:"effective_date"`
	PartyName     string `json:"party_name,omitempty"`
	Notes         string `json:"notes,omitempty"`
	Reference     string `json:"reference,omitempty"`
	Matched       bool   `json:"matched"`
}

type BankReconDetail struct {
	Reconciliation db.BankReconciliation        `json:"reconciliation"`
	Matches        []db.BankReconciliationMatch `json:"matches"`
	Transactions   []ReconTransactionView       `json:"transactions"`
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

	reconType := in.ReconciliationType
	if reconType == "" {
		if acc.AccountType == "cash" {
			reconType = "cash"
		} else {
			reconType = "bank"
		}
	}
	if reconType != "bank" && reconType != "cash" {
		return db.BankReconciliation{}, errors.New("reconciliation_type must be bank or cash")
	}

	denomJSON := []byte(`{}`)
	if len(in.Denominations) > 0 {
		if b, err := json.Marshal(in.Denominations); err == nil {
			denomJSON = b
		}
	}

	ledgerBalance := acc.CurrentBalanceMinor
	diff := in.StatementBalanceMinor - ledgerBalance

	recon, err := s.queries.CreateBankReconciliation(ctx, db.CreateBankReconciliationParams{
		WorkspaceID:           workspaceID,
		MoneyAccountID:        in.MoneyAccountID,
		StatementDate:         pgtype.Date{Time: stmtDate, Valid: true},
		StatementBalanceMinor: in.StatementBalanceMinor,
		LedgerBalanceMinor:    ledgerBalance,
		ClearedBalanceMinor:   0,
		DifferenceMinor:       diff,
		Status:                "in_progress",
		ReconciliationType:    reconType,
		Denominations:         denomJSON,
		Notes:                 optionalPgText(in.Notes),
	})
	if err != nil {
		return db.BankReconciliation{}, fmt.Errorf("create reconciliation: %w", err)
	}

	return recon, nil
}

func (s *BankReconciliationService) recomputeClearedBalances(
	ctx context.Context,
	workspaceID int64,
	recon db.BankReconciliation,
) (db.BankReconciliation, error) {
	acc, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{
		ID:          recon.MoneyAccountID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return recon, err
	}

	txs, err := s.queries.ListAccountTransactionsForRecon(ctx, db.ListAccountTransactionsForReconParams{
		WorkspaceID:    workspaceID,
		MoneyAccountID: pgtype.Int8{Int64: recon.MoneyAccountID, Valid: true},
		EffectiveDate:  recon.StatementDate,
		Limit:          500,
	})
	if err != nil {
		return recon, err
	}

	matches, err := s.queries.ListReconciliationMatches(ctx, db.ListReconciliationMatchesParams{
		WorkspaceID:      workspaceID,
		ReconciliationID: recon.ID,
	})
	if err != nil {
		return recon, err
	}

	matchedSet := make(map[int64]bool, len(matches))
	for _, m := range matches {
		matchedSet[m.TransactionID] = true
	}

	var clearedSum int64
	for _, tx := range txs {
		if !matchedSet[tx.ID] {
			continue
		}
		clearedSum += signedAmountForAccount(tx, recon.MoneyAccountID)
	}

	diff := recon.StatementBalanceMinor - acc.CurrentBalanceMinor
	return s.queries.UpdateBankReconciliationBalances(ctx, db.UpdateBankReconciliationBalancesParams{
		ID:                  recon.ID,
		WorkspaceID:         workspaceID,
		ClearedBalanceMinor: clearedSum,
		DifferenceMinor:     diff,
	})
}

func signedAmountForAccount(tx db.ListAccountTransactionsForReconRow, accountID int64) int64 {
	switch tx.Direction {
	case "money_in":
		return tx.AmountMinor
	case "money_out":
		return -tx.AmountMinor
	case "transfer":
		if tx.DestinationAccountID.Valid && tx.DestinationAccountID.Int64 == accountID {
			return tx.AmountMinor
		}
		return -tx.AmountMinor
	default:
		return 0
	}
}

func (s *BankReconciliationService) MatchTransaction(
	ctx context.Context,
	workspaceID int64,
	reconID int64,
	txID int64,
) (db.BankReconciliation, db.BankReconciliationMatch, error) {
	recon, err := s.queries.GetBankReconciliationByID(ctx, db.GetBankReconciliationByIDParams{
		ID:          reconID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return db.BankReconciliation{}, db.BankReconciliationMatch{}, ErrNotFound
	}
	if recon.Status != "in_progress" {
		return db.BankReconciliation{}, db.BankReconciliationMatch{}, ErrReconciliationFinalized
	}

	// Verify transaction belongs to this workspace and account
	tx, err := s.queries.GetMoneyTransactionByID(ctx, db.GetMoneyTransactionByIDParams{
		ID:          txID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return db.BankReconciliation{}, db.BankReconciliationMatch{}, errors.New("transaction not found in this workspace")
	}
	belongsToAccount := (tx.MoneyAccountID.Valid && tx.MoneyAccountID.Int64 == recon.MoneyAccountID) ||
		(tx.DestinationAccountID.Valid && tx.DestinationAccountID.Int64 == recon.MoneyAccountID)
	if !belongsToAccount {
		return db.BankReconciliation{}, db.BankReconciliationMatch{}, errors.New("transaction does not belong to this money account")
	}

	match, err := s.queries.CreateReconciliationMatch(ctx, db.CreateReconciliationMatchParams{
		WorkspaceID:      workspaceID,
		ReconciliationID: reconID,
		TransactionID:    txID,
		MatchStatus:      "cleared",
	})
	if err != nil {
		return db.BankReconciliation{}, db.BankReconciliationMatch{}, fmt.Errorf("match transaction: %w", err)
	}

	updatedRecon, err := s.recomputeClearedBalances(ctx, workspaceID, recon)
	if err != nil {
		return recon, match, nil
	}
	return updatedRecon, match, nil
}

func (s *BankReconciliationService) UnmatchTransaction(
	ctx context.Context,
	workspaceID int64,
	reconID int64,
	txID int64,
) (db.BankReconciliation, error) {
	recon, err := s.queries.GetBankReconciliationByID(ctx, db.GetBankReconciliationByIDParams{
		ID:          reconID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return db.BankReconciliation{}, ErrNotFound
	}
	if recon.Status != "in_progress" {
		return db.BankReconciliation{}, ErrReconciliationFinalized
	}

	if err := s.queries.DeleteReconciliationMatch(ctx, db.DeleteReconciliationMatchParams{
		WorkspaceID:      workspaceID,
		ReconciliationID: reconID,
		TransactionID:    txID,
	}); err != nil {
		return db.BankReconciliation{}, err
	}

	updatedRecon, err := s.recomputeClearedBalances(ctx, workspaceID, recon)
	if err != nil {
		return recon, nil
	}
	return updatedRecon, nil
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
		return db.BankReconciliation{}, ErrReconciliationFinalized
	}

	updated, err := s.recomputeClearedBalances(ctx, workspaceID, recon)
	if err != nil {
		return db.BankReconciliation{}, err
	}

	matches, _ := s.queries.ListReconciliationMatches(ctx, db.ListReconciliationMatchesParams{
		WorkspaceID:      workspaceID,
		ReconciliationID: reconID,
	})

	// Require zero ledger-to-statement variance OR cleared items matching statement exactly
	if updated.DifferenceMinor != 0 && !(len(matches) > 0 && updated.ClearedBalanceMinor == updated.StatementBalanceMinor) {
		return db.BankReconciliation{}, ErrReconciliationUnbalanced
	}

	return s.queries.CompleteBankReconciliation(ctx, db.CompleteBankReconciliationParams{
		ID:                  reconID,
		WorkspaceID:         workspaceID,
		ClearedBalanceMinor: updated.ClearedBalanceMinor,
		DifferenceMinor:     0,
		ReconciledByUserID:  pgtype.Int8{Int64: userID, Valid: true},
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
) (BankReconDetail, error) {
	recon, err := s.queries.GetBankReconciliationByID(ctx, db.GetBankReconciliationByIDParams{
		ID:          reconID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return BankReconDetail{}, ErrNotFound
	}

	matches, err := s.queries.ListReconciliationMatches(ctx, db.ListReconciliationMatchesParams{
		WorkspaceID:      workspaceID,
		ReconciliationID: reconID,
	})
	if err != nil {
		return BankReconDetail{}, err
	}

	matchedSet := make(map[int64]bool, len(matches))
	for _, m := range matches {
		matchedSet[m.TransactionID] = true
	}

	rawTxs, err := s.queries.ListAccountTransactionsForRecon(ctx, db.ListAccountTransactionsForReconParams{
		WorkspaceID:    workspaceID,
		MoneyAccountID: pgtype.Int8{Int64: recon.MoneyAccountID, Valid: true},
		EffectiveDate:  recon.StatementDate,
		Limit:          200,
	})
	if err != nil {
		return BankReconDetail{}, err
	}

	views := make([]ReconTransactionView, 0, len(rawTxs))
	for _, tx := range rawTxs {
		dateStr := ""
		if tx.EffectiveDate.Valid {
			dateStr = tx.EffectiveDate.Time.Format("2006-01-02")
		}
		views = append(views, ReconTransactionView{
			ID:            tx.ID,
			Direction:     tx.Direction,
			SignedMinor:   signedAmountForAccount(tx, recon.MoneyAccountID),
			AmountMinor:   tx.AmountMinor,
			Currency:      tx.Currency,
			EffectiveDate: dateStr,
			PartyName:     tx.CounterpartyName.String,
			Notes:         tx.Notes.String,
			Reference:     tx.Reference.String,
			Matched:       matchedSet[tx.ID],
		})
	}

	return BankReconDetail{
		Reconciliation: recon,
		Matches:        matches,
		Transactions:   views,
	}, nil
}

type ImportBankLinesInput struct {
	MoneyAccountID int64  `json:"money_account_id" binding:"required"`
	FileName       string `json:"file_name" binding:"required"`
	Lines          []struct {
		TransactionDate string `json:"transaction_date" binding:"required"`
		Description     string `json:"description" binding:"required"`
		Reference       string `json:"reference"`
		Direction       string `json:"direction" binding:"required"`
		AmountMinor     int64  `json:"amount_minor" binding:"required"`
	} `json:"lines" binding:"required"`
}

func (s *BankReconciliationService) ImportBankStatementLines(
	ctx context.Context,
	workspaceID, userID int64,
	in ImportBankLinesInput,
) (db.BankImportBatch, []db.BankLine, error) {
	if len(in.Lines) == 0 || len(in.Lines) > 500 {
		return db.BankImportBatch{}, nil, errors.New("lines must contain between 1 and 500 items")
	}

	if _, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{
		ID:          in.MoneyAccountID,
		WorkspaceID: workspaceID,
	}); err != nil {
		return db.BankImportBatch{}, nil, ErrForbiddenAccount
	}

	batch, err := s.queries.CreateBankImportBatch(ctx, db.CreateBankImportBatchParams{
		WorkspaceID:      workspaceID,
		MoneyAccountID:   in.MoneyAccountID,
		FileName:         in.FileName,
		RowCount:         int32(len(in.Lines)),
		ImportedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return db.BankImportBatch{}, nil, err
	}

	// Fetch candidate posted transactions for deterministic auto-match suggestions
	candidates, _ := s.queries.ListAccountTransactionsForRecon(ctx, db.ListAccountTransactionsForReconParams{
		WorkspaceID:    workspaceID,
		MoneyAccountID: pgtype.Int8{Int64: in.MoneyAccountID, Valid: true},
		EffectiveDate:  pgtype.Date{Time: time.Now().AddDate(0, 0, 7), Valid: true},
		Limit:          500,
	})

	created := make([]db.BankLine, 0, len(in.Lines))
	for i, ln := range in.Lines {
		tDate, err := time.Parse("2006-01-02", ln.TransactionDate)
		if err != nil {
			return batch, created, fmt.Errorf("line %d invalid date", i+1)
		}
		if ln.AmountMinor <= 0 {
			continue
		}
		dir := ln.Direction
		if dir != "money_in" && dir != "money_out" {
			dir = "money_out"
		}

		// Auto-suggest candidate transaction with exact amount & direction within +/- 3 days
		var suggestedTx pgtype.Int8
		matchStatus := "unmatched"
		for _, cand := range candidates {
			if cand.AmountMinor == ln.AmountMinor && cand.Direction == dir && cand.EffectiveDate.Valid {
				daysDiff := math.Abs(tDate.Sub(cand.EffectiveDate.Time).Hours() / 24)
				if daysDiff <= 3 {
					suggestedTx = pgtype.Int8{Int64: cand.ID, Valid: true}
					matchStatus = "suggested"
					break
				}
			}
		}

		fpRaw := fmt.Sprintf("%s|%s|%d|%s|%s", ln.TransactionDate, dir, ln.AmountMinor, ln.Description, ln.Reference)
		sum := sha256.Sum256([]byte(fpRaw))
		fp := hex.EncodeToString(sum[:])

		row, err := s.queries.CreateBankLine(ctx, db.CreateBankLineParams{
			WorkspaceID:          workspaceID,
			BatchID:              batch.ID,
			MoneyAccountID:       in.MoneyAccountID,
			TransactionDate:      pgtype.Date{Time: tDate, Valid: true},
			Description:          ln.Description,
			Reference:            optionalPgText(ln.Reference),
			Direction:            dir,
			AmountMinor:          ln.AmountMinor,
			MatchedTransactionID: suggestedTx,
			MatchStatus:          matchStatus,
			Fingerprint:          fp,
		})
		if err == nil && row.ID > 0 {
			created = append(created, row)
		}
	}

	return batch, created, nil
}
