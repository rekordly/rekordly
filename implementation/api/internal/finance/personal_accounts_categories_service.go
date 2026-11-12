package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type OpeningBalanceInput struct {
	AmountMinor    int64  `json:"amount_minor"`
	Amount         string `json:"amount"`
	AsOfDate       string `json:"as_of_date" binding:"required"`
	Direction      string `json:"direction"` // optional override; derived from account_type by default
	Note           string `json:"note"`
	EvidenceKey    string `json:"evidence_key"`
	IdempotencyKey string `json:"idempotency_key"`
}

type UpdateAccountMetadataInput struct {
	Name            string `json:"name"`
	InstitutionName string `json:"institution_name"`
	MaskedReference string `json:"masked_reference"`
	DisplayOrder    int32  `json:"display_order"`
	Icon            string `json:"icon"`
	Color           string `json:"color"`
}

type PersonalAccountArchiveResult struct {
	Account db.MoneyAccount `json:"account"`
	Warning string          `json:"warning,omitempty"`
}

// CreatePersonalAccount creates a Personal money account with zero initial balance.
// Opening balances must go through RecordAccountOpeningBalance so they are auditable and balanced.
func (s *Service) CreatePersonalAccount(ctx context.Context, workspaceID int64, in CreateAccountInput) (db.MoneyAccount, error) {
	in.OpeningBalance = 0
	in.OpeningAmount = ""
	return s.CreateAccount(ctx, workspaceID, in)
}

func (s *Service) ListAccountsOrdered(ctx context.Context, workspaceID int64, isActive *bool) ([]db.MoneyAccount, error) {
	var activeParam pgtype.Bool
	if isActive != nil {
		activeParam = pgtype.Bool{Bool: *isActive, Valid: true}
	}
	return s.queries.ListMoneyAccountsOrdered(ctx, db.ListMoneyAccountsOrderedParams{
		WorkspaceID: workspaceID,
		IsActive:    activeParam,
	})
}

func (s *Service) UpdatePersonalAccountMetadata(ctx context.Context, workspaceID, accountID int64, in UpdateAccountMetadataInput) (db.MoneyAccount, error) {
	acc, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{
		ID:          accountID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return db.MoneyAccount{}, ErrNotFound
	}
	if err != nil {
		return db.MoneyAccount{}, err
	}

	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = acc.Name
	}
	return s.queries.UpdateMoneyAccountDetails(ctx, db.UpdateMoneyAccountDetailsParams{
		ID:              accountID,
		WorkspaceID:     workspaceID,
		Name:            name,
		InstitutionName: optionalPgText(in.InstitutionName),
		MaskedReference: optionalPgText(in.MaskedReference),
		DisplayOrder:    in.DisplayOrder,
		Icon:            optionalPgText(in.Icon),
		Color:           optionalPgText(in.Color),
	})
}

func (s *Service) ArchivePersonalAccount(ctx context.Context, workspaceID, accountID int64, archive bool) (PersonalAccountArchiveResult, error) {
	acc, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{
		ID:          accountID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return PersonalAccountArchiveResult{}, ErrNotFound
	}
	if err != nil {
		return PersonalAccountArchiveResult{}, err
	}

	updated, err := s.queries.SetMoneyAccountArchived(ctx, db.SetMoneyAccountArchivedParams{
		ID:          accountID,
		WorkspaceID: workspaceID,
		IsActive:    !archive,
	})
	if err != nil {
		return PersonalAccountArchiveResult{}, err
	}

	var warning string
	if archive && acc.CurrentBalanceMinor != 0 {
		warning = "Account archived with non-zero balance; historical records and reports remain intact."
	}
	return PersonalAccountArchiveResult{Account: updated, Warning: warning}, nil
}

// RecordAccountOpeningBalance posts an auditable, idempotent opening balance against opening equity.
// It never counts as current-period income or expense.
func (s *Service) RecordAccountOpeningBalance(ctx context.Context, workspaceID, userID, accountID int64, idempKey string, in OpeningBalanceInput) (db.MoneyTransaction, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	asOf, err := parseDateStrict(in.AsOfDate)
	if err != nil {
		return db.MoneyTransaction{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.MoneyTransaction{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if idempKey != "" {
		existing, err := qtx.GetMoneyTransactionByIdempotency(ctx, db.GetMoneyTransactionByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			return existing, nil
		}
		if !isNoRows(err) {
			return db.MoneyTransaction{}, err
		}
	}

	acc, err := qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{
		ID:          accountID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return db.MoneyTransaction{}, ErrNotFound
	}
	if err != nil {
		return db.MoneyTransaction{}, err
	}
	if !acc.IsActive {
		return db.MoneyTransaction{}, ErrAccountArchived
	}

	amountMinor, err := resolveAmountMinor(in.Amount, in.AmountMinor, acc.Currency)
	if err != nil {
		return db.MoneyTransaction{}, err
	}
	if amountMinor <= 0 {
		return db.MoneyTransaction{}, errors.New("opening balance amount must be greater than zero")
	}

	isLiabilityAccount := acc.AccountType == "card" || acc.AccountType == "credit"
	direction := "money_in"
	if isLiabilityAccount {
		direction = "money_out"
	}
	if strings.TrimSpace(in.Direction) == "money_in" || strings.TrimSpace(in.Direction) == "money_out" {
		direction = strings.TrimSpace(in.Direction)
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	mt, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
		WorkspaceID:      workspaceID,
		Direction:        direction,
		Status:           "posted",
		AmountMinor:      amountMinor,
		Currency:         acc.Currency,
		CurrencyExponent: acc.CurrencyExponent,
		EffectiveDate:    pgtype.Date{Time: asOf, Valid: true},
		MoneyAccountID:   pgtype.Int8{Int64: acc.ID, Valid: true},
		Purpose:          "opening_balance",
		Notes:            optionalPgText(in.Note),
		Reference:        optionalPgText(in.EvidenceKey),
		IdempotencyKey:   idempParam,
		CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
		PostedAt:         pgtype.Timestamptz{Time: asOf, Valid: true},
	})
	if err != nil {
		return db.MoneyTransaction{}, fmt.Errorf("create opening balance transaction: %w", err)
	}

	balanceDelta := amountMinor
	if direction == "money_out" {
		balanceDelta = -amountMinor
	}
	if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
		ID:                  acc.ID,
		WorkspaceID:         workspaceID,
		CurrentBalanceMinor: balanceDelta,
	}); err != nil {
		return db.MoneyTransaction{}, fmt.Errorf("update account balance: %w", err)
	}

	var lines []ledgerPostingLine
	if direction == "money_in" {
		lines = []ledgerPostingLine{
			{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), DebitMinor: amountMinor, Description: "Opening balance"},
			{AccountClass: "equity", CreditMinor: amountMinor, Description: "Opening balance equity"},
		}
	} else {
		lines = []ledgerPostingLine{
			{AccountClass: "equity", DebitMinor: amountMinor, Description: "Opening balance equity"},
			{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), CreditMinor: amountMinor, Description: "Opening liability balance"},
		}
	}

	if _, err := postBalancedLedgerTx(
		ctx, qtx, workspaceID, "opening_balance", mt.ID, asOf,
		acc.Currency, acc.CurrencyExponent, "Account opening balance", lines,
	); err != nil {
		return db.MoneyTransaction{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return db.MoneyTransaction{}, fmt.Errorf("commit opening balance: %w", err)
	}
	return mt, nil
}

// ---------------- Personal Categories & Tags ----------------

type UpdateCategoryInput struct {
	Name         string `json:"name" binding:"required"`
	ParentID     *int64 `json:"parent_id"`
	DisplayOrder int32  `json:"display_order"`
	Icon         string `json:"icon"`
	Color        string `json:"color"`
}

func (s *Service) UpdatePersonalCategory(ctx context.Context, workspaceID, categoryID int64, in UpdateCategoryInput) (db.Category, error) {
	cat, err := s.queries.GetCategoryByID(ctx, db.GetCategoryByIDParams{
		ID:          categoryID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return db.Category{}, ErrNotFound
	}
	if err != nil {
		return db.Category{}, err
	}

	if in.ParentID != nil && *in.ParentID > 0 {
		if *in.ParentID == categoryID {
			return db.Category{}, errors.New("category cannot be its own parent")
		}
		parent, err := s.queries.GetCategoryByID(ctx, db.GetCategoryByIDParams{
			ID:          *in.ParentID,
			WorkspaceID: workspaceID,
		})
		if isNoRows(err) {
			return db.Category{}, ErrForbiddenCategory
		}
		if err != nil {
			return db.Category{}, err
		}
		if parent.AccountClass != cat.AccountClass {
			return db.Category{}, errors.New("parent category must have compatible accounting class")
		}
	}

	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = cat.Name
	}

	return s.queries.UpdateCategoryDetails(ctx, db.UpdateCategoryDetailsParams{
		ID:           categoryID,
		WorkspaceID:  workspaceID,
		Name:         name,
		ParentID:     pgInt8Ptr(in.ParentID),
		DisplayOrder: in.DisplayOrder,
		Icon:         optionalPgText(in.Icon),
		Color:        optionalPgText(in.Color),
	})
}

func (s *Service) ArchivePersonalCategory(ctx context.Context, workspaceID, categoryID int64, archive bool) (db.Category, error) {
	if _, err := s.queries.GetCategoryByID(ctx, db.GetCategoryByIDParams{
		ID:          categoryID,
		WorkspaceID: workspaceID,
	}); isNoRows(err) {
		return db.Category{}, ErrNotFound
	} else if err != nil {
		return db.Category{}, err
	}

	return s.queries.SetCategoryArchived(ctx, db.SetCategoryArchivedParams{
		ID:          categoryID,
		WorkspaceID: workspaceID,
		IsActive:    !archive,
	})
}

// SeedDefaultPersonalCategories ensures standard Personal categories exist without duplicating existing ones.
func (s *Service) SeedDefaultPersonalCategories(ctx context.Context, workspaceID int64) ([]db.Category, error) {
	defaults := []CreateCategoryInput{
		{Name: "Salary & Earned Income", Direction: "money_in", Scope: "personal", AccountClass: "income"},
		{Name: "Gifts & Support Received", Direction: "money_in", Scope: "personal", AccountClass: "income"},
		{Name: "Food & Groceries", Direction: "money_out", Scope: "personal", AccountClass: "expense"},
		{Name: "Transport & Fuel", Direction: "money_out", Scope: "personal", AccountClass: "expense"},
		{Name: "Housing & Rent", Direction: "money_out", Scope: "personal", AccountClass: "expense"},
		{Name: "Utilities & Data", Direction: "money_out", Scope: "personal", AccountClass: "expense"},
		{Name: "Health", Direction: "money_out", Scope: "personal", AccountClass: "expense"},
		{Name: "Education", Direction: "money_out", Scope: "personal", AccountClass: "expense"},
		{Name: "Family & Support Given", Direction: "money_out", Scope: "personal", AccountClass: "expense"},
		{Name: "Entertainment", Direction: "money_out", Scope: "personal", AccountClass: "expense"},
		{Name: "Clothing & Personal Care", Direction: "money_out", Scope: "personal", AccountClass: "expense"},
		{Name: "Fees & Charges", Direction: "money_out", Scope: "personal", AccountClass: "expense"},
	}

	for _, d := range defaults {
		_, err := s.queries.GetCategoryByNameAndDirection(ctx, db.GetCategoryByNameAndDirectionParams{
			WorkspaceID: workspaceID,
			Lower:       strings.ToLower(d.Name),
			Direction:   d.Direction,
		})
		if isNoRows(err) {
			if _, createErr := s.CreateCategory(ctx, workspaceID, d); createErr != nil {
				return nil, createErr
			}
		}
	}

	return s.ListCategories(ctx, workspaceID, "", "personal")
}

type CreatePersonalTagInput struct {
	Name  string `json:"name" binding:"required"`
	Color string `json:"color"`
}

func (s *Service) CreatePersonalTag(ctx context.Context, workspaceID int64, in CreatePersonalTagInput) (db.PersonalTag, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return db.PersonalTag{}, errors.New("tag name is required")
	}
	return s.queries.CreatePersonalTag(ctx, db.CreatePersonalTagParams{
		WorkspaceID: workspaceID,
		Name:        name,
		Color:       optionalPgText(in.Color),
	})
}

func (s *Service) ListPersonalTags(ctx context.Context, workspaceID int64) ([]db.PersonalTag, error) {
	return s.queries.ListPersonalTags(ctx, workspaceID)
}

func (s *Service) ArchivePersonalTag(ctx context.Context, workspaceID, tagID int64) (db.PersonalTag, error) {
	tag, err := s.queries.ArchivePersonalTag(ctx, db.ArchivePersonalTagParams{
		ID:          tagID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return db.PersonalTag{}, ErrNotFound
	}
	return tag, err
}
