package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type LoanScheduleItemInput struct {
	DueDate                string `json:"due_date" binding:"required"`
	ExpectedTotalMinor     int64  `json:"expected_total_minor"`
	ExpectedTotal          string `json:"expected_total"`
	ExpectedPrincipalMinor int64  `json:"expected_principal_minor"`
	ExpectedPrincipal      string `json:"expected_principal"`
	ExpectedInterestMinor  int64  `json:"expected_interest_minor"`
	ExpectedInterest       string `json:"expected_interest"`
	ReminderEnabled        *bool  `json:"reminder_enabled"`
}

type CreateLoanInput struct {
	CounterpartyName    string                  `json:"counterparty_name" binding:"required"`
	CounterpartyID      *int64                  `json:"counterparty_id"`
	PrincipalMinor      int64                   `json:"principal_minor"`
	Principal           string                  `json:"principal"`
	Currency            string                  `json:"currency"`
	StartDate           string                  `json:"start_date" binding:"required"`
	DueDate             string                  `json:"due_date"`
	InterestRateBps     int32                   `json:"interest_rate_bps"`
	InterestArrangement string                  `json:"interest_arrangement"`
	MoneyAccountID      *int64                  `json:"money_account_id"`
	IsOpeningBalance    bool                    `json:"is_opening_balance"`
	Notes               string                  `json:"notes"`
	EvidenceKey         string                  `json:"evidence_key"`
	Schedule            []LoanScheduleItemInput `json:"schedule"`
	IdempotencyKey      string                  `json:"idempotency_key"`
}

type RecordLoanRepaymentInput struct {
	LoanID         int64  `json:"loan_id" binding:"required"`
	MoneyAccountID int64  `json:"money_account_id" binding:"required"`
	EffectiveDate  string `json:"effective_date" binding:"required"`
	TotalMinor     int64  `json:"total_amount_minor"`
	TotalAmount    string `json:"total_amount"`
	PrincipalMinor int64  `json:"principal_minor"`
	Principal      string `json:"principal"`
	InterestMinor  int64  `json:"interest_minor"`
	Interest       string `json:"interest"`
	FeeMinor       int64  `json:"fee_minor"`
	Fee            string `json:"fee"`
	Notes          string `json:"notes"`
	IdempotencyKey string `json:"idempotency_key"`
}

type LoanDetail struct {
	Loan          db.Loan               `json:"loan"`
	DerivedStatus string                `json:"derived_status"`
	Events        []db.LoanEvent        `json:"events"`
	Schedule      []db.LoanScheduleItem `json:"schedule"`
}

func deriveLoanStatus(l db.Loan, now time.Time) string {
	if l.Status == "reversed" || l.Status == "written_off" || l.Status == "repaid" || l.OutstandingPrincipalMinor == 0 {
		return l.Status
	}
	if l.DueDate.Valid && l.DueDate.Time.Before(time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)) {
		return "overdue"
	}
	return l.Status
}

func (s *Service) OpenBorrowedLoan(ctx context.Context, workspaceID, userID int64, idempKey string, in CreateLoanInput) (LoanDetail, error) {
	return s.createPersonalLoan(ctx, workspaceID, userID, "borrowed", idempKey, in)
}

func (s *Service) LendMoney(ctx context.Context, workspaceID, userID int64, idempKey string, in CreateLoanInput) (LoanDetail, error) {
	return s.createPersonalLoan(ctx, workspaceID, userID, "lent", idempKey, in)
}

func (s *Service) createPersonalLoan(ctx context.Context, workspaceID, userID int64, direction, idempKey string, in CreateLoanInput) (LoanDetail, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	counterparty := strings.TrimSpace(in.CounterpartyName)
	if counterparty == "" {
		return LoanDetail{}, errors.New("counterparty_name is required")
	}

	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := int32(CurrencyExponent(currency))

	principalMinor, err := resolveAmountMinor(in.Principal, in.PrincipalMinor, currency)
	if err != nil {
		return LoanDetail{}, err
	}
	if principalMinor <= 0 {
		return LoanDetail{}, errors.New("principal must be greater than zero")
	}

	startDate, err := parseDateStrict(in.StartDate)
	if err != nil {
		return LoanDetail{}, err
	}
	var dueDatePtr *time.Time
	if strings.TrimSpace(in.DueDate) != "" {
		d, err := parseDateStrict(in.DueDate)
		if err != nil {
			return LoanDetail{}, err
		}
		if d.Before(startDate) {
			return LoanDetail{}, errors.New("due_date must be on or after start_date")
		}
		dueDatePtr = &d
	}

	if !in.IsOpeningBalance && (in.MoneyAccountID == nil || *in.MoneyAccountID <= 0) {
		return LoanDetail{}, errors.New("money_account_id is required for cash loan origination")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return LoanDetail{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if idempKey != "" {
		existing, err := qtx.GetLoanByIdempotency(ctx, db.GetLoanByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			tx.Rollback(ctx)
			return s.GetPersonalLoanDetail(ctx, workspaceID, existing.ID)
		}
		if !isNoRows(err) {
			return LoanDetail{}, err
		}
	}

	var acc *db.MoneyAccount
	if !in.IsOpeningBalance && in.MoneyAccountID != nil {
		lockedAcc, err := qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{
			ID:          *in.MoneyAccountID,
			WorkspaceID: workspaceID,
		})
		if isNoRows(err) {
			return LoanDetail{}, ErrForbiddenAccount
		}
		if err != nil {
			return LoanDetail{}, err
		}
		if !lockedAcc.IsActive {
			return LoanDetail{}, ErrAccountArchived
		}
		if lockedAcc.Currency != currency {
			return LoanDetail{}, ErrAccountCurrencyMismatch
		}
		acc = &lockedAcc
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	loan, err := qtx.CreateLoan(ctx, db.CreateLoanParams{
		WorkspaceID:               workspaceID,
		Direction:                 direction,
		CounterpartyName:          counterparty,
		CounterpartyID:            pgInt8Ptr(in.CounterpartyID),
		PrincipalMinor:            principalMinor,
		OutstandingPrincipalMinor: principalMinor,
		Currency:                  currency,
		CurrencyExponent:          exponent,
		StartDate:                 pgtype.Date{Time: startDate, Valid: true},
		DueDate:                   pgDatePtr(dueDatePtr),
		InterestRateBps:           in.InterestRateBps,
		InterestArrangement:       optionalPgText(in.InterestArrangement),
		MoneyAccountID:            pgInt8Ptr(in.MoneyAccountID),
		IsOpeningBalance:          in.IsOpeningBalance,
		Status:                    "active",
		Notes:                     optionalPgText(in.Notes),
		EvidenceKey:               optionalPgText(in.EvidenceKey),
		IdempotencyKey:            idempParam,
		CreatedByUserID:           pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return LoanDetail{}, fmt.Errorf("create loan: %w", err)
	}

	var mtID pgtype.Int8
	if !in.IsOpeningBalance && acc != nil {
		mtDir := "money_in"
		purpose := "loan_borrowed"
		balanceDelta := principalMinor
		if direction == "lent" {
			mtDir = "money_out"
			purpose = "loan_lent"
			balanceDelta = -principalMinor
		}
		mt, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
			WorkspaceID:      workspaceID,
			Direction:        mtDir,
			Status:           "posted",
			AmountMinor:      principalMinor,
			Currency:         currency,
			CurrencyExponent: exponent,
			EffectiveDate:    pgtype.Date{Time: startDate, Valid: true},
			MoneyAccountID:   pgtype.Int8{Int64: acc.ID, Valid: true},
			CounterpartyName: pgtype.Text{String: counterparty, Valid: true},
			Purpose:          purpose,
			Notes:            optionalPgText(in.Notes),
			CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
			PostedAt:         pgtype.Timestamptz{Time: startDate, Valid: true},
		})
		if err != nil {
			return LoanDetail{}, fmt.Errorf("create loan money tx: %w", err)
		}
		mtID = pgtype.Int8{Int64: mt.ID, Valid: true}

		if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  acc.ID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: balanceDelta,
		}); err != nil {
			return LoanDetail{}, err
		}
	}

	var lines []ledgerPostingLine
	if in.IsOpeningBalance {
		if direction == "borrowed" {
			lines = []ledgerPostingLine{
				{AccountClass: "equity", DebitMinor: principalMinor, Description: "Opening borrowed loan equity"},
				{AccountClass: "liability", CreditMinor: principalMinor, Description: "Opening loan payable: " + counterparty},
			}
		} else {
			lines = []ledgerPostingLine{
				{AccountClass: "asset", DebitMinor: principalMinor, Description: "Opening loan receivable: " + counterparty},
				{AccountClass: "equity", CreditMinor: principalMinor, Description: "Opening lent loan equity"},
			}
		}
	} else {
		if direction == "borrowed" {
			lines = []ledgerPostingLine{
				{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), DebitMinor: principalMinor, Description: "Loan proceeds received"},
				{AccountClass: "liability", CreditMinor: principalMinor, Description: "Loan payable: " + counterparty},
			}
		} else {
			lines = []ledgerPostingLine{
				{AccountClass: "asset", DebitMinor: principalMinor, Description: "Loan receivable: " + counterparty},
				{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), CreditMinor: principalMinor, Description: "Loan principal disbursed"},
			}
		}
	}

	le, err := postBalancedLedgerTx(
		ctx, qtx, workspaceID, "loan_origination", loan.ID, startDate,
		currency, exponent, fmt.Sprintf("Loan (%s): %s", direction, counterparty), lines,
	)
	if err != nil {
		return LoanDetail{}, err
	}

	eventType := "origination"
	if in.IsOpeningBalance {
		eventType = "opening"
	}
	if _, err := qtx.CreateLoanEvent(ctx, db.CreateLoanEventParams{
		WorkspaceID:        workspaceID,
		LoanID:             loan.ID,
		EventType:          eventType,
		EffectiveDate:      pgtype.Date{Time: startDate, Valid: true},
		TotalAmountMinor:   principalMinor,
		PrincipalMinor:     principalMinor,
		MoneyAccountID:     pgInt8Ptr(in.MoneyAccountID),
		MoneyTransactionID: mtID,
		LedgerEntryID:      pgtype.Int8{Int64: le.ID, Valid: true},
		Notes:              optionalPgText(in.Notes),
		CreatedByUserID:    pgtype.Int8{Int64: userID, Valid: true},
	}); err != nil {
		return LoanDetail{}, err
	}

	for idx, item := range in.Schedule {
		sDue, err := parseDateStrict(item.DueDate)
		if err != nil {
			return LoanDetail{}, err
		}
		expTotal, err := resolveAmountMinor(item.ExpectedTotal, item.ExpectedTotalMinor, currency)
		if err != nil {
			return LoanDetail{}, err
		}
		expPrin, err := resolveAmountMinor(item.ExpectedPrincipal, item.ExpectedPrincipalMinor, currency)
		if err != nil {
			return LoanDetail{}, err
		}
		expInt, err := resolveAmountMinor(item.ExpectedInterest, item.ExpectedInterestMinor, currency)
		if err != nil {
			return LoanDetail{}, err
		}
		rem := true
		if item.ReminderEnabled != nil {
			rem = *item.ReminderEnabled
		}
		if _, err := qtx.CreateLoanScheduleItem(ctx, db.CreateLoanScheduleItemParams{
			WorkspaceID:            workspaceID,
			LoanID:                 loan.ID,
			InstallmentNumber:      int32(idx + 1),
			DueDate:                pgtype.Date{Time: sDue, Valid: true},
			ExpectedTotalMinor:     expTotal,
			ExpectedPrincipalMinor: expPrin,
			ExpectedInterestMinor:  expInt,
			ReminderEnabled:        rem,
		}); err != nil {
			return LoanDetail{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return LoanDetail{}, fmt.Errorf("commit loan: %w", err)
	}
	return s.GetPersonalLoanDetail(ctx, workspaceID, loan.ID)
}

func (s *Service) RecordLoanRepayment(ctx context.Context, workspaceID, userID int64, idempKey string, in RecordLoanRepaymentInput) (LoanDetail, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	effDate, err := parseDateStrict(in.EffectiveDate)
	if err != nil {
		return LoanDetail{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return LoanDetail{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if idempKey != "" {
		existingEv, err := qtx.GetLoanEventByIdempotency(ctx, db.GetLoanEventByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			tx.Rollback(ctx)
			return s.GetPersonalLoanDetail(ctx, workspaceID, existingEv.LoanID)
		}
		if !isNoRows(err) {
			return LoanDetail{}, err
		}
	}

	loan, err := qtx.GetLoanForUpdate(ctx, db.GetLoanForUpdateParams{
		ID:          in.LoanID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return LoanDetail{}, ErrNotFound
	}
	if err != nil {
		return LoanDetail{}, err
	}
	if loan.Status == "reversed" || loan.Status == "written_off" {
		return LoanDetail{}, errors.New("cannot record repayment on a reversed or written-off loan")
	}

	totalMinor, err := resolveAmountMinor(in.TotalAmount, in.TotalMinor, loan.Currency)
	if err != nil {
		return LoanDetail{}, err
	}
	principalMinor, err := resolveNonNegativeAmountMinor(in.Principal, in.PrincipalMinor, loan.Currency)
	if err != nil {
		return LoanDetail{}, err
	}
	interestMinor, err := resolveNonNegativeAmountMinor(in.Interest, in.InterestMinor, loan.Currency)
	if err != nil {
		return LoanDetail{}, err
	}
	feeMinor, err := resolveNonNegativeAmountMinor(in.Fee, in.FeeMinor, loan.Currency)
	if err != nil {
		return LoanDetail{}, err
	}

	if totalMinor <= 0 || principalMinor < 0 || interestMinor < 0 || feeMinor < 0 {
		return LoanDetail{}, errors.New("repayment amounts must be valid non-negative integers with positive total")
	}
	if principalMinor+interestMinor+feeMinor != totalMinor {
		return LoanDetail{}, ErrLoanComponentsMismatch
	}
	if principalMinor > loan.OutstandingPrincipalMinor {
		return LoanDetail{}, ErrLoanBalanceInsufficient
	}

	acc, err := qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{
		ID:          in.MoneyAccountID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return LoanDetail{}, ErrForbiddenAccount
	}
	if err != nil {
		return LoanDetail{}, err
	}
	if !acc.IsActive {
		return LoanDetail{}, ErrAccountArchived
	}
	if acc.Currency != loan.Currency {
		return LoanDetail{}, ErrAccountCurrencyMismatch
	}

	mtDir := "money_out"
	purpose := "loan_repayment"
	balanceDelta := -totalMinor
	if loan.Direction == "lent" {
		mtDir = "money_in"
		purpose = "loan_collection"
		balanceDelta = totalMinor
	}

	mt, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
		WorkspaceID:      workspaceID,
		Direction:        mtDir,
		Status:           "posted",
		AmountMinor:      totalMinor,
		Currency:         loan.Currency,
		CurrencyExponent: loan.CurrencyExponent,
		EffectiveDate:    pgtype.Date{Time: effDate, Valid: true},
		MoneyAccountID:   pgtype.Int8{Int64: acc.ID, Valid: true},
		CounterpartyName: pgtype.Text{String: loan.CounterpartyName, Valid: true},
		Purpose:          purpose,
		Notes:            optionalPgText(in.Notes),
		CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
		PostedAt:         pgtype.Timestamptz{Time: effDate, Valid: true},
	})
	if err != nil {
		return LoanDetail{}, fmt.Errorf("create loan repayment tx: %w", err)
	}

	if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
		ID:                  acc.ID,
		WorkspaceID:         workspaceID,
		CurrentBalanceMinor: balanceDelta,
	}); err != nil {
		return LoanDetail{}, err
	}

	var lines []ledgerPostingLine
	if loan.Direction == "borrowed" {
		if principalMinor > 0 {
			lines = append(lines, ledgerPostingLine{AccountClass: "liability", DebitMinor: principalMinor, Description: "Loan principal repaid"})
		}
		if interestMinor > 0 {
			lines = append(lines, ledgerPostingLine{AccountClass: "expense", DebitMinor: interestMinor, Description: "Loan interest expense"})
		}
		if feeMinor > 0 {
			lines = append(lines, ledgerPostingLine{AccountClass: "expense", DebitMinor: feeMinor, Description: "Loan fee expense"})
		}
		lines = append(lines, ledgerPostingLine{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), CreditMinor: totalMinor, Description: "Loan repayment cash out"})
	} else {
		lines = append(lines, ledgerPostingLine{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), DebitMinor: totalMinor, Description: "Loan collection cash in"})
		if principalMinor > 0 {
			lines = append(lines, ledgerPostingLine{AccountClass: "asset", CreditMinor: principalMinor, Description: "Loan receivable collected"})
		}
		if interestMinor > 0 {
			lines = append(lines, ledgerPostingLine{AccountClass: "revenue", CreditMinor: interestMinor, Description: "Loan interest income"})
		}
		if feeMinor > 0 {
			lines = append(lines, ledgerPostingLine{AccountClass: "revenue", CreditMinor: feeMinor, Description: "Loan fee income"})
		}
	}

	le, err := postBalancedLedgerTx(
		ctx, qtx, workspaceID, "loan_repayment", loan.ID, effDate,
		loan.Currency, loan.CurrencyExponent, fmt.Sprintf("Loan repayment: %s", loan.CounterpartyName), lines,
	)
	if err != nil {
		return LoanDetail{}, err
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}
	if _, err := qtx.CreateLoanEvent(ctx, db.CreateLoanEventParams{
		WorkspaceID:        workspaceID,
		LoanID:             loan.ID,
		EventType:          "repayment",
		EffectiveDate:      pgtype.Date{Time: effDate, Valid: true},
		TotalAmountMinor:   totalMinor,
		PrincipalMinor:     principalMinor,
		InterestMinor:      interestMinor,
		FeeMinor:           feeMinor,
		MoneyAccountID:     pgtype.Int8{Int64: acc.ID, Valid: true},
		MoneyTransactionID: pgtype.Int8{Int64: mt.ID, Valid: true},
		LedgerEntryID:      pgtype.Int8{Int64: le.ID, Valid: true},
		Notes:              optionalPgText(in.Notes),
		IdempotencyKey:     idempParam,
		CreatedByUserID:    pgtype.Int8{Int64: userID, Valid: true},
	}); err != nil {
		return LoanDetail{}, err
	}

	newOutstanding := loan.OutstandingPrincipalMinor - principalMinor
	newStatus := "partially_repaid"
	if newOutstanding == 0 {
		newStatus = "repaid"
	} else if newOutstanding == loan.PrincipalMinor {
		newStatus = "active"
	}

	if _, err := qtx.UpdateLoanBalancesAndStatus(ctx, db.UpdateLoanBalancesAndStatusParams{
		ID:                        loan.ID,
		WorkspaceID:               workspaceID,
		OutstandingPrincipalMinor: newOutstanding,
		TotalInterestPaidMinor:    loan.TotalInterestPaidMinor + interestMinor,
		TotalFeesPaidMinor:        loan.TotalFeesPaidMinor + feeMinor,
		Status:                    newStatus,
	}); err != nil {
		return LoanDetail{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return LoanDetail{}, fmt.Errorf("commit loan repayment: %w", err)
	}
	return s.GetPersonalLoanDetail(ctx, workspaceID, loan.ID)
}

func (s *Service) ReverseLoanEvent(ctx context.Context, workspaceID, userID, loanID, eventID int64, reason string) (LoanDetail, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return LoanDetail{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	loan, err := qtx.GetLoanForUpdate(ctx, db.GetLoanForUpdateParams{
		ID:          loanID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return LoanDetail{}, ErrNotFound
	}
	if err != nil {
		return LoanDetail{}, err
	}

	ev, err := qtx.GetLoanEventByID(ctx, db.GetLoanEventByIDParams{
		ID:          eventID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) || ev.LoanID != loanID {
		return LoanDetail{}, ErrNotFound
	}
	if err != nil {
		return LoanDetail{}, err
	}
	if ev.EventType != "repayment" || ev.IsReversed {
		return LoanDetail{}, errors.New("only active repayment events can be reversed")
	}

	if _, err := qtx.MarkLoanEventReversed(ctx, db.MarkLoanEventReversedParams{
		ID:          ev.ID,
		WorkspaceID: workspaceID,
	}); err != nil {
		return LoanDetail{}, err
	}

	if ev.MoneyAccountID.Valid {
		acc, err := qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{
			ID:          ev.MoneyAccountID.Int64,
			WorkspaceID: workspaceID,
		})
		if err != nil {
			return LoanDetail{}, err
		}
		balanceDelta := ev.TotalAmountMinor
		mtDir := "money_in"
		if loan.Direction == "lent" {
			balanceDelta = -ev.TotalAmountMinor
			mtDir = "money_out"
		}
		if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  acc.ID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: balanceDelta,
		}); err != nil {
			return LoanDetail{}, err
		}
		now := time.Now().UTC()
		mt, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
			WorkspaceID:      workspaceID,
			Direction:        mtDir,
			Status:           "posted",
			AmountMinor:      ev.TotalAmountMinor,
			Currency:         loan.Currency,
			CurrencyExponent: loan.CurrencyExponent,
			EffectiveDate:    pgtype.Date{Time: now, Valid: true},
			MoneyAccountID:   pgtype.Int8{Int64: acc.ID, Valid: true},
			CounterpartyName: pgtype.Text{String: loan.CounterpartyName, Valid: true},
			Purpose:          "loan_repayment_reversal",
			Notes:            optionalPgText(reason),
			CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
			PostedAt:         pgtype.Timestamptz{Time: now, Valid: true},
		})
		if err != nil {
			return LoanDetail{}, err
		}

		var lines []ledgerPostingLine
		if loan.Direction == "borrowed" {
			lines = append(lines, ledgerPostingLine{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), DebitMinor: ev.TotalAmountMinor, Description: "Reversal of loan repayment cash"})
			if ev.PrincipalMinor > 0 {
				lines = append(lines, ledgerPostingLine{AccountClass: "liability", CreditMinor: ev.PrincipalMinor, Description: "Restore loan payable"})
			}
			if ev.InterestMinor > 0 {
				lines = append(lines, ledgerPostingLine{AccountClass: "expense", CreditMinor: ev.InterestMinor, Description: "Reverse loan interest expense"})
			}
			if ev.FeeMinor > 0 {
				lines = append(lines, ledgerPostingLine{AccountClass: "expense", CreditMinor: ev.FeeMinor, Description: "Reverse loan fee expense"})
			}
		} else {
			if ev.PrincipalMinor > 0 {
				lines = append(lines, ledgerPostingLine{AccountClass: "asset", DebitMinor: ev.PrincipalMinor, Description: "Restore loan receivable"})
			}
			if ev.InterestMinor > 0 {
				lines = append(lines, ledgerPostingLine{AccountClass: "revenue", DebitMinor: ev.InterestMinor, Description: "Reverse loan interest income"})
			}
			if ev.FeeMinor > 0 {
				lines = append(lines, ledgerPostingLine{AccountClass: "revenue", DebitMinor: ev.FeeMinor, Description: "Reverse loan fee income"})
			}
			lines = append(lines, ledgerPostingLine{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), CreditMinor: ev.TotalAmountMinor, Description: "Reversal of loan collection cash"})
		}

		le, err := postBalancedLedgerTx(
			ctx, qtx, workspaceID, "loan_reversal", loan.ID, now,
			loan.Currency, loan.CurrencyExponent, "Loan repayment reversal", lines,
		)
		if err != nil {
			return LoanDetail{}, err
		}

		if _, err := qtx.CreateLoanEvent(ctx, db.CreateLoanEventParams{
			WorkspaceID:        workspaceID,
			LoanID:             loan.ID,
			EventType:          "reversal",
			EffectiveDate:      pgtype.Date{Time: now, Valid: true},
			TotalAmountMinor:   ev.TotalAmountMinor,
			PrincipalMinor:     ev.PrincipalMinor,
			InterestMinor:      ev.InterestMinor,
			FeeMinor:           ev.FeeMinor,
			MoneyAccountID:     ev.MoneyAccountID,
			MoneyTransactionID: pgtype.Int8{Int64: mt.ID, Valid: true},
			LedgerEntryID:      pgtype.Int8{Int64: le.ID, Valid: true},
			ReversedEventID:    pgtype.Int8{Int64: ev.ID, Valid: true},
			Notes:              optionalPgText(reason),
			CreatedByUserID:    pgtype.Int8{Int64: userID, Valid: true},
		}); err != nil {
			return LoanDetail{}, err
		}
	}

	newOutstanding := loan.OutstandingPrincipalMinor + ev.PrincipalMinor
	newStatus := "partially_repaid"
	if newOutstanding >= loan.PrincipalMinor {
		newOutstanding = loan.PrincipalMinor
		newStatus = "active"
	}

	if _, err := qtx.UpdateLoanBalancesAndStatus(ctx, db.UpdateLoanBalancesAndStatusParams{
		ID:                        loan.ID,
		WorkspaceID:               workspaceID,
		OutstandingPrincipalMinor: newOutstanding,
		TotalInterestPaidMinor:    maxInt64(0, loan.TotalInterestPaidMinor-ev.InterestMinor),
		TotalFeesPaidMinor:        maxInt64(0, loan.TotalFeesPaidMinor-ev.FeeMinor),
		Status:                    newStatus,
	}); err != nil {
		return LoanDetail{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return LoanDetail{}, fmt.Errorf("commit loan reversal: %w", err)
	}
	return s.GetPersonalLoanDetail(ctx, workspaceID, loan.ID)
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func (s *Service) ListPersonalLoans(ctx context.Context, workspaceID int64, direction, status string) ([]LoanDetail, error) {
	var dirParam, statusParam pgtype.Text
	if direction != "" {
		dirParam = pgtype.Text{String: direction, Valid: true}
	}
	if status != "" {
		statusParam = pgtype.Text{String: status, Valid: true}
	}
	rows, err := s.queries.ListLoans(ctx, db.ListLoansParams{
		WorkspaceID: workspaceID,
		Limit:       100,
		Direction:   dirParam,
		Status:      statusParam,
	})
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	out := make([]LoanDetail, 0, len(rows))
	for _, r := range rows {
		out = append(out, LoanDetail{
			Loan:          r,
			DerivedStatus: deriveLoanStatus(r, now),
		})
	}
	return out, nil
}

func (s *Service) GetPersonalLoanDetail(ctx context.Context, workspaceID, loanID int64) (LoanDetail, error) {
	l, err := s.queries.GetLoanByID(ctx, db.GetLoanByIDParams{
		ID:          loanID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return LoanDetail{}, ErrNotFound
	}
	if err != nil {
		return LoanDetail{}, err
	}
	events, err := s.queries.ListLoanEvents(ctx, db.ListLoanEventsParams{
		WorkspaceID: workspaceID,
		LoanID:      loanID,
	})
	if err != nil {
		return LoanDetail{}, err
	}
	schedule, err := s.queries.ListLoanScheduleItems(ctx, db.ListLoanScheduleItemsParams{
		WorkspaceID: workspaceID,
		LoanID:      loanID,
	})
	if err != nil {
		return LoanDetail{}, err
	}
	return LoanDetail{
		Loan:          l,
		DerivedStatus: deriveLoanStatus(l, time.Now().UTC()),
		Events:        events,
		Schedule:      schedule,
	}, nil
}
