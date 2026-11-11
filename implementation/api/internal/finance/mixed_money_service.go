package finance

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrMixedAllocationMismatch = errors.New("personal and business portions must equal the total exactly")
	ErrMixedWorkspaceAccess    = errors.New("both personal and business workspaces must be owned by the current user")
	ErrMixedPayerAccount       = errors.New("paying account does not belong to the selected paying workspace")
	ErrMixedSettlementState    = errors.New("mixed expense has no open balance for this reimbursement")
	ErrMixedSettlementVersion  = errors.New("mixed expense settlement changed; reload before reimbursing")
	ErrMixedSettlementRoute    = errors.New("reimbursement must travel from the owing workspace to the paying workspace")
)

type ConfirmMixedMoneyRecordInput struct {
	PersonalWorkspaceID  int64  `json:"personal_workspace_id" binding:"required"`
	BusinessWorkspaceID  int64  `json:"business_workspace_id" binding:"required"`
	PayingWorkspaceID    int64  `json:"paying_workspace_id" binding:"required"`
	PayingMoneyAccountID int64  `json:"paying_money_account_id" binding:"required"`
	Amount               string `json:"amount"`
	AmountMinor          string `json:"amount_minor"`
	PersonalAmount       string `json:"personal_amount"`
	PersonalAmountMinor  string `json:"personal_amount_minor"`
	BusinessAmount       string `json:"business_amount"`
	BusinessAmountMinor  string `json:"business_amount_minor"`
	Currency             string `json:"currency"`
	EffectiveDate        string `json:"effective_date" binding:"required"`
	PersonalCategoryID   int64  `json:"personal_category_id" binding:"required"`
	BusinessCategoryID   int64  `json:"business_category_id" binding:"required"`
	Description          string `json:"description"`
	Reference            string `json:"reference"`
	ClientCommandID      string `json:"client_command_id"`
}

type ReimburseMixedMoneyInput struct {
	FromWorkspaceID    int64  `json:"from_workspace_id" binding:"required"`
	ToWorkspaceID      int64  `json:"to_workspace_id" binding:"required"`
	FromMoneyAccountID int64  `json:"from_money_account_id" binding:"required"`
	ToMoneyAccountID   int64  `json:"to_money_account_id" binding:"required"`
	Amount             string `json:"amount"`
	AmountMinor        string `json:"amount_minor"`
	EffectiveDate      string `json:"effective_date" binding:"required"`
	ExpectedVersion    int32  `json:"expected_version" binding:"required"`
	Reference          string `json:"reference"`
	ClientCommandID    string `json:"client_command_id"`
}

type MixedMoneyConfirmation struct {
	Group          db.MixedMoneyGroup `json:"group"`
	PersonalRecord db.MoneyRecord     `json:"personal_record"`
	BusinessRecord db.MoneyRecord     `json:"business_record"`
	WasDuplicate   bool               `json:"was_duplicate"`
}

type MixedMoneyReimbursementResult struct {
	Group         db.MixedMoneyGroup         `json:"group"`
	Reimbursement db.MixedMoneyReimbursement `json:"reimbursement"`
	FromRecord    db.MoneyRecord             `json:"from_record"`
	ToRecord      db.MoneyRecord             `json:"to_record"`
	WasDuplicate  bool                       `json:"was_duplicate"`
}

func (s *Service) ConfirmMixedMoneyRecord(ctx context.Context, actorUserID, activeWorkspaceID int64, idempotencyKey string, in ConfirmMixedMoneyRecordInput) (MixedMoneyConfirmation, error) {
	key := strings.TrimSpace(idempotencyKey)
	if key == "" {
		return MixedMoneyConfirmation{}, ErrIdempotencyRequired
	}
	if in.PersonalWorkspaceID <= 0 || in.BusinessWorkspaceID <= 0 || in.PersonalWorkspaceID == in.BusinessWorkspaceID || in.PayingMoneyAccountID <= 0 {
		return MixedMoneyConfirmation{}, ErrMixedWorkspaceAccess
	}
	if activeWorkspaceID != in.PersonalWorkspaceID && activeWorkspaceID != in.BusinessWorkspaceID {
		return MixedMoneyConfirmation{}, ErrMixedWorkspaceAccess
	}
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := CurrencyExponent(currency)
	total, err := parseDraftAmount(in.Amount, in.AmountMinor, exponent)
	if err != nil {
		return MixedMoneyConfirmation{}, err
	}
	personal, err := parseDraftAmount(in.PersonalAmount, in.PersonalAmountMinor, exponent)
	if err != nil {
		return MixedMoneyConfirmation{}, err
	}
	business, err := parseDraftAmount(in.BusinessAmount, in.BusinessAmountMinor, exponent)
	if err != nil {
		return MixedMoneyConfirmation{}, err
	}
	if total != personal+business || personal <= 0 || business <= 0 {
		return MixedMoneyConfirmation{}, ErrMixedAllocationMismatch
	}
	effectiveDate, err := time.Parse("2006-01-02", strings.TrimSpace(in.EffectiveDate))
	if err != nil {
		return MixedMoneyConfirmation{}, fmt.Errorf("invalid effective date: %w", err)
	}
	if effectiveDate.After(time.Now().UTC().Add(24 * time.Hour)) {
		return MixedMoneyConfirmation{}, ErrFutureDatedConfirmation
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MixedMoneyConfirmation{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)
	requestDigest, err := canonicalMixedDigest("confirm_mixed_money_record", in)
	if err != nil {
		return MixedMoneyConfirmation{}, err
	}
	duplicateGroupID, found, err := reserveMoneyCommand(ctx, tx, actorUserID, "confirm_mixed_money_record", key, requestDigest)
	if err != nil {
		return MixedMoneyConfirmation{}, err
	}
	if found {
		group, getErr := qtx.GetMixedMoneyGroup(ctx, db.GetMixedMoneyGroupParams{ID: duplicateGroupID, PersonalWorkspaceID: activeWorkspaceID})
		if getErr != nil {
			return MixedMoneyConfirmation{}, getErr
		}
		personalRecord, getErr := qtx.GetMoneyRecordByID(ctx, db.GetMoneyRecordByIDParams{ID: group.PersonalMoneyRecordID.Int64, WorkspaceID: group.PersonalWorkspaceID})
		if getErr != nil {
			return MixedMoneyConfirmation{}, getErr
		}
		businessRecord, getErr := qtx.GetMoneyRecordByID(ctx, db.GetMoneyRecordByIDParams{ID: group.BusinessMoneyRecordID.Int64, WorkspaceID: group.BusinessWorkspaceID})
		if getErr != nil {
			return MixedMoneyConfirmation{}, getErr
		}
		return MixedMoneyConfirmation{Group: group, PersonalRecord: personalRecord, BusinessRecord: businessRecord, WasDuplicate: true}, nil
	}
	if err := validateMixedWorkspaceOwnership(ctx, tx, actorUserID, in.PersonalWorkspaceID, "personal"); err != nil {
		return MixedMoneyConfirmation{}, err
	}
	if err := validateMixedWorkspaceOwnership(ctx, tx, actorUserID, in.BusinessWorkspaceID, "business"); err != nil {
		return MixedMoneyConfirmation{}, err
	}
	if in.PayingWorkspaceID != in.PersonalWorkspaceID && in.PayingWorkspaceID != in.BusinessWorkspaceID {
		return MixedMoneyConfirmation{}, ErrMixedWorkspaceAccess
	}
	payerAccount, err := qtx.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{ID: in.PayingMoneyAccountID, WorkspaceID: in.PayingWorkspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MixedMoneyConfirmation{}, ErrMixedPayerAccount
	}
	if err != nil {
		return MixedMoneyConfirmation{}, err
	}
	if !payerAccount.IsActive {
		return MixedMoneyConfirmation{}, ErrAccountInactive
	}
	if payerAccount.Currency != currency {
		return MixedMoneyConfirmation{}, ErrAccountCurrencyMismatch
	}
	personalCategory, err := validMixedCategory(ctx, qtx, in.PersonalWorkspaceID, in.PersonalCategoryID)
	if err != nil {
		return MixedMoneyConfirmation{}, err
	}
	businessCategory, err := validMixedCategory(ctx, qtx, in.BusinessWorkspaceID, in.BusinessCategoryID)
	if err != nil {
		return MixedMoneyConfirmation{}, err
	}

	group, err := qtx.CreateMixedMoneyGroup(ctx, db.CreateMixedMoneyGroupParams{ActorUserID: actorUserID, PersonalWorkspaceID: in.PersonalWorkspaceID, BusinessWorkspaceID: in.BusinessWorkspaceID, PayingWorkspaceID: in.PayingWorkspaceID, PayingMoneyAccountID: in.PayingMoneyAccountID, Currency: currency, CurrencyExponent: int32(exponent), TotalAmountMinor: total, PersonalAmountMinor: personal, BusinessAmountMinor: business, EffectiveDate: pgtype.Date{Time: effectiveDate, Valid: true}, Description: optionalPgText(in.Description), Reference: optionalPgText(in.Reference)})
	if err != nil {
		return MixedMoneyConfirmation{}, err
	}

	var personalRecord, businessRecord db.MoneyRecord
	if in.PayingWorkspaceID == in.PersonalWorkspaceID {
		payerTxn, record, createErr := s.createMixedPaymentRecord(ctx, qtx, mixedPaymentRecordInput{WorkspaceID: in.PersonalWorkspaceID, UserID: actorUserID, AmountMinor: total, Currency: currency, Exponent: int32(exponent), EffectiveDate: effectiveDate, AccountID: pgtype.Int8{Int64: payerAccount.ID, Valid: true}, CategoryID: pgtype.Int8{Int64: personalCategory.ID, Valid: true}, Purpose: "mixed_expense", ScopeType: "mixed", Description: in.Description, Reference: in.Reference, IdempotencyKey: key, EntryMethod: entryMethodFromClient(in.ClientCommandID), IsCashPayer: true, PayerPersonalPortion: personal, PayerBusinessPortion: business, PayerIsPersonal: true})
		if createErr != nil {
			return MixedMoneyConfirmation{}, createErr
		}
		_ = payerTxn
		personalRecord = record
		_, record, createErr = s.createMixedPaymentRecord(ctx, qtx, mixedPaymentRecordInput{WorkspaceID: in.BusinessWorkspaceID, UserID: actorUserID, AmountMinor: business, Currency: currency, Exponent: int32(exponent), EffectiveDate: effectiveDate, CategoryID: pgtype.Int8{Int64: businessCategory.ID, Valid: true}, Purpose: "mixed_expense_due_to_owner", ScopeType: "mixed", Description: in.Description, Reference: in.Reference, EntryMethod: entryMethodFromClient(in.ClientCommandID), IsCashPayer: false, PayerIsPersonal: true})
		if createErr != nil {
			return MixedMoneyConfirmation{}, createErr
		}
		businessRecord = record
	} else {
		payerTxn, record, createErr := s.createMixedPaymentRecord(ctx, qtx, mixedPaymentRecordInput{WorkspaceID: in.BusinessWorkspaceID, UserID: actorUserID, AmountMinor: total, Currency: currency, Exponent: int32(exponent), EffectiveDate: effectiveDate, AccountID: pgtype.Int8{Int64: payerAccount.ID, Valid: true}, CategoryID: pgtype.Int8{Int64: businessCategory.ID, Valid: true}, Purpose: "mixed_expense", ScopeType: "mixed", Description: in.Description, Reference: in.Reference, IdempotencyKey: key, EntryMethod: entryMethodFromClient(in.ClientCommandID), IsCashPayer: true, PayerPersonalPortion: personal, PayerBusinessPortion: business, PayerIsPersonal: false})
		if createErr != nil {
			return MixedMoneyConfirmation{}, createErr
		}
		_ = payerTxn
		businessRecord = record
		_, record, createErr = s.createMixedPaymentRecord(ctx, qtx, mixedPaymentRecordInput{WorkspaceID: in.PersonalWorkspaceID, UserID: actorUserID, AmountMinor: personal, Currency: currency, Exponent: int32(exponent), EffectiveDate: effectiveDate, CategoryID: pgtype.Int8{Int64: personalCategory.ID, Valid: true}, Purpose: "mixed_expense_due_to_business", ScopeType: "mixed", Description: in.Description, Reference: in.Reference, EntryMethod: entryMethodFromClient(in.ClientCommandID), IsCashPayer: false, PayerIsPersonal: false})
		if createErr != nil {
			return MixedMoneyConfirmation{}, createErr
		}
		personalRecord = record
	}
	group, err = qtx.CompleteMixedMoneyGroup(ctx, db.CompleteMixedMoneyGroupParams{ID: group.ID, PersonalMoneyRecordID: pgtype.Int8{Int64: personalRecord.ID, Valid: true}, BusinessMoneyRecordID: pgtype.Int8{Int64: businessRecord.ID, Valid: true}})
	if err != nil {
		return MixedMoneyConfirmation{}, err
	}
	if err := linkMixedGroupRecords(ctx, qtx, group, personalRecord, businessRecord); err != nil {
		return MixedMoneyConfirmation{}, err
	}
	if err := writeMixedAuditAndOutbox(ctx, tx, actorUserID, group, "mixed_money_confirmed"); err != nil {
		return MixedMoneyConfirmation{}, err
	}
	if err := completeMoneyCommand(ctx, tx, actorUserID, "confirm_mixed_money_record", key, group.ID, "mixed_money_group"); err != nil {
		return MixedMoneyConfirmation{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return MixedMoneyConfirmation{}, err
	}
	return MixedMoneyConfirmation{Group: group, PersonalRecord: personalRecord, BusinessRecord: businessRecord}, nil
}

type mixedPaymentRecordInput struct {
	WorkspaceID          int64
	UserID               int64
	AmountMinor          int64
	Currency             string
	Exponent             int32
	EffectiveDate        time.Time
	AccountID            pgtype.Int8
	CategoryID           pgtype.Int8
	Purpose              string
	ScopeType            string
	Description          string
	Reference            string
	IdempotencyKey       string
	EntryMethod          string
	IsCashPayer          bool
	PayerPersonalPortion int64
	PayerBusinessPortion int64
	PayerIsPersonal      bool
}

func (s *Service) createMixedPaymentRecord(ctx context.Context, q *db.Queries, in mixedPaymentRecordInput) (db.MoneyTransaction, db.MoneyRecord, error) {
	txn, err := q.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{WorkspaceID: in.WorkspaceID, Direction: "money_out", Status: "posted", AmountMinor: in.AmountMinor, Currency: in.Currency, CurrencyExponent: in.Exponent, EffectiveDate: pgtype.Date{Time: in.EffectiveDate, Valid: true}, MoneyAccountID: in.AccountID, CategoryID: in.CategoryID, Purpose: in.Purpose, Notes: optionalPgText(in.Description), Reference: optionalPgText(in.Reference), IdempotencyKey: optionalPgText(in.IdempotencyKey), CreatedByUserID: pgtype.Int8{Int64: in.UserID, Valid: true}, PostedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}})
	if err != nil {
		return db.MoneyTransaction{}, db.MoneyRecord{}, err
	}
	if err := createMixedExpenseLedger(ctx, q, txn, in); err != nil {
		return db.MoneyTransaction{}, db.MoneyRecord{}, err
	}
	record, err := q.CreateMoneyRecord(ctx, db.CreateMoneyRecordParams{WorkspaceID: in.WorkspaceID, TransactionID: pgtype.Int8{Int64: txn.ID, Valid: true}, Direction: "money_out", ScopeType: in.ScopeType, Purpose: in.Purpose, EntryMethod: in.EntryMethod, AmountMinor: in.AmountMinor, Currency: in.Currency, CurrencyExponent: in.Exponent, EffectiveDate: pgtype.Date{Time: in.EffectiveDate, Valid: true}, MoneyAccountID: in.AccountID, CategoryID: in.CategoryID, Description: optionalPgText(in.Description), Reference: optionalPgText(in.Reference), CreatedByUserID: pgtype.Int8{Int64: in.UserID, Valid: true}, ConfirmedByUserID: pgtype.Int8{Int64: in.UserID, Valid: true}})
	if err != nil {
		return db.MoneyTransaction{}, db.MoneyRecord{}, err
	}
	if in.IsCashPayer {
		ownPortion := in.PayerBusinessPortion
		otherPortion := in.PayerPersonalPortion
		otherPurpose := "due_from_owner"
		if in.PayerIsPersonal {
			ownPortion = in.PayerPersonalPortion
			otherPortion = in.PayerBusinessPortion
			otherPurpose = "due_from_business"
		}
		if _, err = q.CreateMoneyRecordPart(ctx, db.CreateMoneyRecordPartParams{MoneyRecordID: record.ID, WorkspaceID: in.WorkspaceID, AmountMinor: ownPortion, Currency: in.Currency, Purpose: "expense", CategoryID: in.CategoryID, TransactionID: pgtype.Int8{Int64: txn.ID, Valid: true}}); err != nil {
			return db.MoneyTransaction{}, db.MoneyRecord{}, err
		}
		if _, err = q.CreateMoneyRecordPart(ctx, db.CreateMoneyRecordPartParams{MoneyRecordID: record.ID, WorkspaceID: in.WorkspaceID, AmountMinor: otherPortion, Currency: in.Currency, Purpose: otherPurpose, TransactionID: pgtype.Int8{Int64: txn.ID, Valid: true}}); err != nil {
			return db.MoneyTransaction{}, db.MoneyRecord{}, err
		}
	} else if _, err = q.CreateMoneyRecordPart(ctx, db.CreateMoneyRecordPartParams{MoneyRecordID: record.ID, WorkspaceID: in.WorkspaceID, AmountMinor: in.AmountMinor, Currency: in.Currency, Purpose: "expense", CategoryID: in.CategoryID, TransactionID: pgtype.Int8{Int64: txn.ID, Valid: true}}); err != nil {
		return db.MoneyTransaction{}, db.MoneyRecord{}, err
	}
	return txn, record, nil
}

func createMixedExpenseLedger(ctx context.Context, q *db.Queries, txn db.MoneyTransaction, in mixedPaymentRecordInput) error {
	entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: in.WorkspaceID, SourceType: "money_transaction", SourceID: txn.ID, EntryDate: txn.EffectiveDate, Currency: txn.Currency, CurrencyExponent: txn.CurrencyExponent, Description: txn.Notes})
	if err != nil {
		return err
	}
	var debitTotal, creditTotal int64
	line := func(accountID pgtype.Int8, class string, debit, credit int64, description string) error {
		if debit == 0 && credit == 0 {
			return nil
		}
		created, lineErr := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: in.WorkspaceID, AccountID: accountID, AccountClass: class, DebitMinor: debit, CreditMinor: credit, Description: optionalPgText(description)})
		if lineErr == nil {
			debitTotal += created.DebitMinor
			creditTotal += created.CreditMinor
		}
		return lineErr
	}
	if in.IsCashPayer {
		if in.PayerIsPersonal {
			if err = line(pgtype.Int8{}, "expense", in.PayerPersonalPortion, 0, "Personal mixed-expense portion"); err != nil {
				return err
			}
			if err = line(pgtype.Int8{}, "asset", in.PayerBusinessPortion, 0, "Due from Business"); err != nil {
				return err
			}
		} else {
			if err = line(pgtype.Int8{}, "expense", in.PayerBusinessPortion, 0, "Business mixed-expense portion"); err != nil {
				return err
			}
			if err = line(pgtype.Int8{}, "asset", in.PayerPersonalPortion, 0, "Due from Owner"); err != nil {
				return err
			}
		}
		if err = line(in.AccountID, "asset", 0, txn.AmountMinor, "Mixed expense paid from money account"); err != nil {
			return err
		}
		_, err = q.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{ID: in.AccountID.Int64, WorkspaceID: in.WorkspaceID, CurrentBalanceMinor: -txn.AmountMinor})
		if err != nil {
			return err
		}
	} else {
		if err = line(pgtype.Int8{}, "expense", txn.AmountMinor, 0, "Mixed expense portion"); err != nil {
			return err
		}
		if in.PayerIsPersonal {
			err = line(pgtype.Int8{}, "liability", 0, txn.AmountMinor, "Due to Owner")
		} else {
			err = line(pgtype.Int8{}, "liability", 0, txn.AmountMinor, "Due to Business")
		}
		if err != nil {
			return err
		}
	}
	if debitTotal != creditTotal || debitTotal != txn.AmountMinor {
		return ErrLedgerUnbalanced
	}
	return nil
}

func (s *Service) ReimburseMixedMoney(ctx context.Context, actorUserID, activeWorkspaceID, groupID int64, idempotencyKey string, in ReimburseMixedMoneyInput) (MixedMoneyReimbursementResult, error) {
	key := strings.TrimSpace(idempotencyKey)
	if key == "" {
		return MixedMoneyReimbursementResult{}, ErrIdempotencyRequired
	}
	if in.ExpectedVersion <= 0 {
		return MixedMoneyReimbursementResult{}, ErrMixedSettlementVersion
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	digest, err := canonicalMixedDigest("reimburse_mixed_money", in)
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	duplicateID, found, err := reserveMoneyCommand(ctx, tx, actorUserID, "reimburse_mixed_money", key, digest)
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	if found {
		return s.loadDuplicateMixedReimbursement(ctx, q, activeWorkspaceID, duplicateID)
	}
	group, err := q.GetMixedMoneyGroupForUpdate(ctx, db.GetMixedMoneyGroupForUpdateParams{ID: groupID, PersonalWorkspaceID: activeWorkspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MixedMoneyReimbursementResult{}, ErrNotFound
	}
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	if group.SettlementVersion != in.ExpectedVersion {
		return MixedMoneyReimbursementResult{}, ErrMixedSettlementVersion
	}
	if group.Status != "open" {
		return MixedMoneyReimbursementResult{}, ErrMixedSettlementState
	}
	if err := validateMixedWorkspaceOwnership(ctx, tx, actorUserID, group.PersonalWorkspaceID, "personal"); err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	if err := validateMixedWorkspaceOwnership(ctx, tx, actorUserID, group.BusinessWorkspaceID, "business"); err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	expectedFrom, expectedTo := group.BusinessWorkspaceID, group.PersonalWorkspaceID
	if group.PayingWorkspaceID == group.BusinessWorkspaceID {
		expectedFrom, expectedTo = group.PersonalWorkspaceID, group.BusinessWorkspaceID
	}
	if in.FromWorkspaceID != expectedFrom || in.ToWorkspaceID != expectedTo {
		return MixedMoneyReimbursementResult{}, ErrMixedSettlementRoute
	}
	if in.FromMoneyAccountID <= 0 || in.ToMoneyAccountID <= 0 {
		return MixedMoneyReimbursementResult{}, ErrMixedSettlementRoute
	}
	amount, err := parseDraftAmount(in.Amount, in.AmountMinor, int(group.CurrencyExponent))
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	effectiveDate, err := time.Parse("2006-01-02", strings.TrimSpace(in.EffectiveDate))
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	fromAccount, err := q.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{ID: in.FromMoneyAccountID, WorkspaceID: in.FromWorkspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MixedMoneyReimbursementResult{}, ErrMixedSettlementRoute
	}
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	toAccount, err := q.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{ID: in.ToMoneyAccountID, WorkspaceID: in.ToWorkspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MixedMoneyReimbursementResult{}, ErrMixedSettlementRoute
	}
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	if !fromAccount.IsActive || !toAccount.IsActive {
		return MixedMoneyReimbursementResult{}, ErrAccountInactive
	}
	if fromAccount.Currency != group.Currency || toAccount.Currency != group.Currency {
		return MixedMoneyReimbursementResult{}, ErrAccountCurrencyMismatch
	}
	fromTxn, fromRecord, err := createMixedReimbursementRecord(ctx, q, actorUserID, in.FromWorkspaceID, fromAccount, amount, group, effectiveDate, "money_out", key, in.Reference)
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	toTxn, toRecord, err := createMixedReimbursementRecord(ctx, q, actorUserID, in.ToWorkspaceID, toAccount, amount, group, effectiveDate, "money_in", "", in.Reference)
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	_ = fromTxn
	_ = toTxn
	reimbursement, err := q.CreateMixedMoneyReimbursement(ctx, db.CreateMixedMoneyReimbursementParams{MixedMoneyGroupID: group.ID, FromWorkspaceID: in.FromWorkspaceID, ToWorkspaceID: in.ToWorkspaceID, FromMoneyAccountID: in.FromMoneyAccountID, ToMoneyAccountID: in.ToMoneyAccountID, FromMoneyRecordID: pgtype.Int8{Int64: fromRecord.ID, Valid: true}, ToMoneyRecordID: pgtype.Int8{Int64: toRecord.ID, Valid: true}, AmountMinor: amount, Currency: group.Currency, EffectiveDate: pgtype.Date{Time: effectiveDate, Valid: true}, CreatedByUserID: actorUserID})
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	if _, err = q.CreateMoneyRecordLink(ctx, db.CreateMoneyRecordLinkParams{MoneyRecordID: fromRecord.ID, WorkspaceID: in.FromWorkspaceID, LinkType: "mixed_reimbursement", LinkedRecordID: reimbursement.ID, Metadata: []byte(`{}`)}); err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	if _, err = q.CreateMoneyRecordLink(ctx, db.CreateMoneyRecordLinkParams{MoneyRecordID: toRecord.ID, WorkspaceID: in.ToWorkspaceID, LinkType: "mixed_reimbursement", LinkedRecordID: reimbursement.ID, Metadata: []byte(`{}`)}); err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	group, err = q.ApplyMixedMoneyReimbursement(ctx, db.ApplyMixedMoneyReimbursementParams{ID: group.ID, ReimbursedAmountMinor: amount, SettlementVersion: in.ExpectedVersion})
	if errors.Is(err, pgx.ErrNoRows) {
		return MixedMoneyReimbursementResult{}, ErrMixedSettlementState
	}
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	if err = writeMixedAuditAndOutbox(ctx, tx, actorUserID, group, "mixed_money_reimbursed"); err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	if err = completeMoneyCommand(ctx, tx, actorUserID, "reimburse_mixed_money", key, reimbursement.ID, "mixed_money_reimbursement"); err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	return MixedMoneyReimbursementResult{Group: group, Reimbursement: reimbursement, FromRecord: fromRecord, ToRecord: toRecord}, nil
}

func createMixedReimbursementRecord(ctx context.Context, q *db.Queries, actorUserID, workspaceID int64, account db.MoneyAccount, amount int64, group db.MixedMoneyGroup, effectiveDate time.Time, direction, idempotencyKey, reference string) (db.MoneyTransaction, db.MoneyRecord, error) {
	txn, err := q.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{WorkspaceID: workspaceID, Direction: direction, Status: "posted", AmountMinor: amount, Currency: group.Currency, CurrencyExponent: group.CurrencyExponent, EffectiveDate: pgtype.Date{Time: effectiveDate, Valid: true}, MoneyAccountID: pgtype.Int8{Int64: account.ID, Valid: true}, Purpose: "mixed_reimbursement", Notes: optionalPgText("Settlement of mixed expense"), Reference: optionalPgText(reference), IdempotencyKey: optionalPgText(idempotencyKey), CreatedByUserID: pgtype.Int8{Int64: actorUserID, Valid: true}, PostedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}})
	if err != nil {
		return db.MoneyTransaction{}, db.MoneyRecord{}, err
	}
	entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: workspaceID, SourceType: "money_transaction", SourceID: txn.ID, EntryDate: txn.EffectiveDate, Currency: txn.Currency, CurrencyExponent: txn.CurrencyExponent, Description: txn.Notes})
	if err != nil {
		return db.MoneyTransaction{}, db.MoneyRecord{}, err
	}
	var first, second db.LedgerLine
	if direction == "money_out" {
		first, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "liability", DebitMinor: amount, Description: optionalPgText("Clear due-to balance")})
		if err == nil {
			second, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountID: pgtype.Int8{Int64: account.ID, Valid: true}, AccountClass: "asset", CreditMinor: amount, Description: optionalPgText("Reimbursement paid")})
		}
		if err == nil {
			_, err = q.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{ID: account.ID, WorkspaceID: workspaceID, CurrentBalanceMinor: -amount})
		}
	} else {
		first, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountID: pgtype.Int8{Int64: account.ID, Valid: true}, AccountClass: "asset", DebitMinor: amount, Description: optionalPgText("Reimbursement received")})
		if err == nil {
			second, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "asset", CreditMinor: amount, Description: optionalPgText("Clear due-from balance")})
		}
		if err == nil {
			_, err = q.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{ID: account.ID, WorkspaceID: workspaceID, CurrentBalanceMinor: amount})
		}
	}
	if err != nil {
		return db.MoneyTransaction{}, db.MoneyRecord{}, err
	}
	if first.DebitMinor+second.DebitMinor != first.CreditMinor+second.CreditMinor {
		return db.MoneyTransaction{}, db.MoneyRecord{}, ErrLedgerUnbalanced
	}
	record, err := q.CreateMoneyRecord(ctx, db.CreateMoneyRecordParams{WorkspaceID: workspaceID, TransactionID: pgtype.Int8{Int64: txn.ID, Valid: true}, Direction: direction, ScopeType: "mixed", Purpose: "mixed_reimbursement", EntryMethod: "manual", AmountMinor: amount, Currency: group.Currency, CurrencyExponent: group.CurrencyExponent, EffectiveDate: pgtype.Date{Time: effectiveDate, Valid: true}, MoneyAccountID: pgtype.Int8{Int64: account.ID, Valid: true}, Description: txn.Notes, Reference: optionalPgText(reference), CreatedByUserID: pgtype.Int8{Int64: actorUserID, Valid: true}, ConfirmedByUserID: pgtype.Int8{Int64: actorUserID, Valid: true}})
	if err != nil {
		return db.MoneyTransaction{}, db.MoneyRecord{}, err
	}
	if _, err = q.CreateMoneyRecordPart(ctx, db.CreateMoneyRecordPartParams{MoneyRecordID: record.ID, WorkspaceID: workspaceID, AmountMinor: amount, Currency: group.Currency, Purpose: "mixed_reimbursement", TransactionID: pgtype.Int8{Int64: txn.ID, Valid: true}}); err != nil {
		return db.MoneyTransaction{}, db.MoneyRecord{}, err
	}
	return txn, record, nil
}

func validMixedCategory(ctx context.Context, q *db.Queries, workspaceID, categoryID int64) (db.Category, error) {
	category, err := q.GetCategoryByID(ctx, db.GetCategoryByIDParams{ID: categoryID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Category{}, ErrForbiddenCategory
	}
	if err != nil {
		return db.Category{}, err
	}
	if !category.IsActive || (category.Direction != "money_out" && category.Direction != "both") {
		return db.Category{}, ErrForbiddenCategory
	}
	return category, nil
}
func validateMixedWorkspaceOwnership(ctx context.Context, tx pgx.Tx, userID, workspaceID int64, requiredKind string) error {
	var kind string
	err := tx.QueryRow(ctx, `SELECT kind FROM workspaces WHERE id = $1 AND owner_user_id = $2 AND status = 'active'`, workspaceID, userID).Scan(&kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrMixedWorkspaceAccess
	}
	if err != nil {
		return err
	}
	if kind != requiredKind {
		return ErrMixedWorkspaceAccess
	}
	return nil
}
func entryMethodFromClient(clientCommandID string) string {
	if strings.TrimSpace(clientCommandID) != "" {
		return "offline"
	}
	return "manual"
}

func reserveMoneyCommand(ctx context.Context, tx pgx.Tx, actorUserID int64, operation, key string, requestDigest []byte) (int64, bool, error) {
	keyDigest := sha256.Sum256([]byte(key))
	var storedDigest []byte
	var status string
	var resourceID *string
	err := tx.QueryRow(ctx, `SELECT request_digest, status, resource_id FROM idempotency_records WHERE actor_user_id = $1 AND operation = $2 AND key_digest = $3 FOR UPDATE`, actorUserID, operation, keyDigest[:]).Scan(&storedDigest, &status, &resourceID)
	if err == nil {
		if string(storedDigest) != string(requestDigest) {
			return 0, false, ErrIdempotencyConflict
		}
		if status == "completed" && resourceID != nil {
			id, parseErr := strconv.ParseInt(*resourceID, 10, 64)
			return id, true, parseErr
		}
		return 0, false, errors.New("matching money command is already processing")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, false, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO idempotency_records (actor_user_id, operation, key_digest, request_digest, expires_at) VALUES ($1, $2, $3, $4, now() + interval '24 hours')`, actorUserID, operation, keyDigest[:], requestDigest)
	return 0, false, err
}
func completeMoneyCommand(ctx context.Context, tx pgx.Tx, actorUserID int64, operation, key string, resourceID int64, resourceType string) error {
	keyDigest := sha256.Sum256([]byte(key))
	_, err := tx.Exec(ctx, `UPDATE idempotency_records SET status = 'completed', response_code = 201, resource_type = $4, resource_id = ($3::bigint)::text, updated_at = now() WHERE actor_user_id = $1 AND operation = $2 AND key_digest = $5`, actorUserID, operation, resourceID, resourceType, keyDigest[:])
	return err
}
func canonicalMixedDigest(operation string, value any) ([]byte, error) {
	body, err := json.Marshal(struct {
		Operation string `json:"operation"`
		Value     any    `json:"value"`
	}{Operation: operation, Value: value})
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(body)
	return digest[:], nil
}

func linkMixedGroupRecords(ctx context.Context, q *db.Queries, group db.MixedMoneyGroup, personalRecord, businessRecord db.MoneyRecord) error {
	metadata, _ := json.Marshal(map[string]string{"mixed_money_group_id": strconv.FormatInt(group.ID, 10)})
	if _, err := q.CreateMoneyRecordLink(ctx, db.CreateMoneyRecordLinkParams{MoneyRecordID: personalRecord.ID, WorkspaceID: group.PersonalWorkspaceID, LinkType: "mixed_group", LinkedRecordID: group.ID, Metadata: metadata}); err != nil {
		return err
	}
	_, err := q.CreateMoneyRecordLink(ctx, db.CreateMoneyRecordLinkParams{MoneyRecordID: businessRecord.ID, WorkspaceID: group.BusinessWorkspaceID, LinkType: "mixed_group", LinkedRecordID: group.ID, Metadata: metadata})
	return err
}
func writeMixedAuditAndOutbox(ctx context.Context, tx pgx.Tx, actorUserID int64, group db.MixedMoneyGroup, eventType string) error {
	metadata, err := json.Marshal(map[string]string{"mixed_money_group_id": strconv.FormatInt(group.ID, 10), "status": group.Status})
	if err != nil {
		return err
	}
	for _, workspaceID := range []int64{group.PersonalWorkspaceID, group.BusinessWorkspaceID} {
		if _, err := tx.Exec(ctx, `INSERT INTO audit_events (actor_user_id, workspace_id, event_type, subject_type, subject_id, metadata) VALUES ($1, $2, $3, 'mixed_money_group', $4, $5::jsonb)`, actorUserID, workspaceID, eventType, strconv.FormatInt(group.ID, 10), metadata); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO outbox_jobs (job_type, aggregate_type, aggregate_id, payload) VALUES ($1, 'mixed_money_group', ($2::bigint)::text, jsonb_build_object('mixed_money_group_id', $2::bigint, 'workspace_id', $3::bigint))`, eventType, group.ID, workspaceID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) loadDuplicateMixedReimbursement(ctx context.Context, q *db.Queries, activeWorkspaceID, reimbursementID int64) (MixedMoneyReimbursementResult, error) {
	reimbursement, err := q.GetMixedMoneyReimbursementByID(ctx, db.GetMixedMoneyReimbursementByIDParams{ID: reimbursementID, PersonalWorkspaceID: activeWorkspaceID})
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	group, err := q.GetMixedMoneyGroup(ctx, db.GetMixedMoneyGroupParams{ID: reimbursement.MixedMoneyGroupID, PersonalWorkspaceID: activeWorkspaceID})
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	fromRecord, err := q.GetMoneyRecordByID(ctx, db.GetMoneyRecordByIDParams{ID: reimbursement.FromMoneyRecordID.Int64, WorkspaceID: reimbursement.FromWorkspaceID})
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	toRecord, err := q.GetMoneyRecordByID(ctx, db.GetMoneyRecordByIDParams{ID: reimbursement.ToMoneyRecordID.Int64, WorkspaceID: reimbursement.ToWorkspaceID})
	if err != nil {
		return MixedMoneyReimbursementResult{}, err
	}
	return MixedMoneyReimbursementResult{Group: group, Reimbursement: reimbursement, FromRecord: fromRecord, ToRecord: toRecord, WasDuplicate: true}, nil
}
