package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrNotFound            = errors.New("record not found")
	ErrForbiddenAccount    = errors.New("account does not belong to workspace")
	ErrForbiddenCategory   = errors.New("category does not belong to workspace")
	ErrInvalidDirection    = errors.New("invalid transaction direction")
	ErrInvalidStatus       = errors.New("invalid transaction status")
	ErrCannotVoidNonPosted = errors.New("only posted transactions can be voided")
	ErrAlreadyVoided       = errors.New("transaction is already voided")
	ErrTransferSameAccount = errors.New("transfer destination must differ from source account")
	ErrLedgerUnbalanced    = errors.New("double-entry ledger postings do not balance")
	ErrDuplicateIdempotent = errors.New("duplicate request with different payload")
)

type Service struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{
		pool:    pool,
		queries: db.New(pool),
	}
}

// ---------------- Money Accounts ----------------

type CreateAccountInput struct {
	Name           string `json:"name" binding:"required"`
	AccountType    string `json:"account_type" binding:"required"` // cash, bank, mobile_wallet, clearing, other
	Currency       string `json:"currency"`
	OpeningBalance int64  `json:"opening_balance_minor"`
	IsActive       bool   `json:"is_active"`
}

func (s *Service) CreateAccount(ctx context.Context, workspaceID int64, in CreateAccountInput) (db.MoneyAccount, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return db.MoneyAccount{}, errors.New("account name is required")
	}
	accType := strings.ToLower(strings.TrimSpace(in.AccountType))
	switch accType {
	case "cash", "bank", "mobile_wallet", "clearing", "other":
	default:
		return db.MoneyAccount{}, errors.New("invalid account type")
	}

	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := int32(CurrencyExponent(currency))

	return s.queries.CreateMoneyAccount(ctx, db.CreateMoneyAccountParams{
		WorkspaceID:         workspaceID,
		Name:                name,
		AccountType:         accType,
		Currency:            currency,
		CurrencyExponent:    exponent,
		OpeningBalanceMinor: in.OpeningBalance,
		CurrentBalanceMinor: in.OpeningBalance,
		IsActive:            true,
	})
}

func (s *Service) ListAccounts(ctx context.Context, workspaceID int64) ([]db.MoneyAccount, error) {
	return s.queries.ListMoneyAccounts(ctx, db.ListMoneyAccountsParams{
		WorkspaceID: workspaceID,
		IsActive:    pgtype.Bool{Valid: false},
	})
}

func (s *Service) GetAccount(ctx context.Context, workspaceID, accountID int64) (db.MoneyAccount, error) {
	acc, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{
		ID:          accountID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.MoneyAccount{}, ErrNotFound
	}
	return acc, err
}

// ---------------- Categories ----------------

type CreateCategoryInput struct {
	Name         string `json:"name" binding:"required"`
	Direction    string `json:"direction" binding:"required"` // money_in, money_out, both
	Scope        string `json:"scope"`                        // personal, business, both
	AccountClass string `json:"account_class"`                // income, expense, asset, liability, equity
}

func (s *Service) CreateCategory(ctx context.Context, workspaceID int64, in CreateCategoryInput) (db.Category, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return db.Category{}, errors.New("category name is required")
	}
	dir := strings.ToLower(strings.TrimSpace(in.Direction))
	switch dir {
	case "money_in", "money_out", "both":
	default:
		return db.Category{}, ErrInvalidDirection
	}

	scope := strings.ToLower(strings.TrimSpace(in.Scope))
	if scope == "" {
		scope = "both"
	}

	accClass := strings.ToLower(strings.TrimSpace(in.AccountClass))
	if accClass == "" {
		if dir == "money_in" {
			accClass = "income"
		} else {
			accClass = "expense"
		}
	}

	return s.queries.CreateCategory(ctx, db.CreateCategoryParams{
		WorkspaceID:  workspaceID,
		Name:         name,
		Direction:    dir,
		Scope:        scope,
		AccountClass: accClass,
		IsSystem:     false,
		IsActive:     true,
	})
}

func (s *Service) ListCategories(ctx context.Context, workspaceID int64, direction, scope string) ([]db.Category, error) {
	var dirParam pgtype.Text
	if direction != "" {
		dirParam = pgtype.Text{String: direction, Valid: true}
	}
	var scopeParam pgtype.Text
	if scope != "" {
		scopeParam = pgtype.Text{String: scope, Valid: true}
	}
	return s.queries.ListCategories(ctx, db.ListCategoriesParams{
		WorkspaceID: workspaceID,
		Direction:   dirParam,
		Scope:       scopeParam,
		IsActive:    pgtype.Bool{Bool: true, Valid: true},
	})
}

func (s *Service) SeedDefaultCategories(ctx context.Context, workspaceID int64, spaceKind string) error {
	defaults := []struct {
		Name         string
		Direction    string
		Scope        string
		AccountClass string
	}{
		{"Sales Revenue", "money_in", "business", "income"},
		{"Service Revenue", "money_in", "business", "income"},
		{"Salary / Wage", "money_in", "personal", "income"},
		{"Other Income", "money_in", "both", "income"},
		{"Food & Groceries", "money_out", "both", "expense"},
		{"Transport & Logistics", "money_out", "both", "expense"},
		{"Rent & Facilities", "money_out", "both", "expense"},
		{"Utilities & Internet", "money_out", "both", "expense"},
		{"Marketing & Advertising", "money_out", "business", "expense"},
		{"Office Supplies", "money_out", "business", "expense"},
		{"Health & Medical", "money_out", "personal", "expense"},
		{"General Expense", "money_out", "both", "expense"},
	}

	for _, d := range defaults {
		_, err := s.queries.CreateCategory(ctx, db.CreateCategoryParams{
			WorkspaceID:  workspaceID,
			Name:         d.Name,
			Direction:    d.Direction,
			Scope:        d.Scope,
			AccountClass: d.AccountClass,
			IsSystem:     true,
			IsActive:     true,
		})
		if err != nil && !strings.Contains(err.Error(), "duplicate key") && !strings.Contains(err.Error(), "unique") {
			return err
		}
	}
	return nil
}

// ---------------- Money Transactions ----------------

type AttachmentInput struct {
	StorageKey string `json:"storage_key" binding:"required"`
	FileName   string `json:"file_name" binding:"required"`
	SizeBytes  int64  `json:"size_bytes" binding:"required"`
	MimeType   string `json:"mime_type" binding:"required"`
	SHA256Hash string `json:"sha256_hash" binding:"required"`
}

type CreateTransactionInput struct {
	Direction            string            `json:"direction" binding:"required"` // money_in, money_out, transfer
	Status               string            `json:"status"`                       // draft or posted (default posted)
	AmountMinor          int64             `json:"amount_minor"`
	AmountMajor          string            `json:"amount"` // optional major string e.g. "100.50"
	Currency             string            `json:"currency"`
	EffectiveDate        string            `json:"effective_date" binding:"required"` // YYYY-MM-DD
	MoneyAccountID       int64             `json:"money_account_id" binding:"required"`
	DestinationAccountID *int64            `json:"destination_account_id"` // required for transfer
	CategoryID           *int64            `json:"category_id"`
	CounterpartyName     string            `json:"counterparty_name"`
	Purpose              string            `json:"purpose"`
	Notes                string            `json:"notes"`
	Reference            string            `json:"reference"`
	IdempotencyKey       string            `json:"idempotency_key"`
	Attachments          []AttachmentInput `json:"attachments"`
}

type TransactionDetail struct {
	Transaction db.MoneyTransaction       `json:"transaction"`
	Attachments []db.AttachmentsMetadatum `json:"attachments"`
	LedgerEntry *db.LedgerEntry           `json:"ledger_entry,omitempty"`
	LedgerLines []db.LedgerLine           `json:"ledger_lines,omitempty"`
}

func (s *Service) CreateTransaction(ctx context.Context, workspaceID, userID int64, in CreateTransactionInput) (TransactionDetail, error) {
	// Idempotency check
	idempKey := strings.TrimSpace(in.IdempotencyKey)
	if idempKey != "" {
		existing, err := s.queries.GetMoneyTransactionByIdempotency(ctx, db.GetMoneyTransactionByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			return s.GetTransaction(ctx, workspaceID, existing.ID)
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return TransactionDetail{}, err
		}
	}

	// Validate direction
	dir := strings.ToLower(strings.TrimSpace(in.Direction))
	switch dir {
	case "money_in", "money_out", "transfer":
	default:
		return TransactionDetail{}, ErrInvalidDirection
	}

	status := strings.ToLower(strings.TrimSpace(in.Status))
	if status == "" {
		status = "posted"
	}
	if status != "draft" && status != "posted" {
		return TransactionDetail{}, ErrInvalidStatus
	}

	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := CurrencyExponent(currency)

	// Validate amount
	amountMinor := in.AmountMinor
	if in.AmountMajor != "" {
		parsed, err := ParseMajorToMinor(in.AmountMajor, exponent)
		if err != nil {
			return TransactionDetail{}, err
		}
		amountMinor = parsed
	}
	if amountMinor <= 0 {
		return TransactionDetail{}, ErrNegativeAmount
	}

	// Validate date
	effDate, err := time.Parse("2006-01-02", strings.TrimSpace(in.EffectiveDate))
	if err != nil {
		return TransactionDetail{}, fmt.Errorf("invalid effective date (expected YYYY-MM-DD): %w", err)
	}

	// Validate money account ownership
	sourceAcc, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{
		ID:          in.MoneyAccountID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return TransactionDetail{}, ErrForbiddenAccount
	}

	var destAccID pgtype.Int8
	if dir == "transfer" {
		if in.DestinationAccountID == nil || *in.DestinationAccountID <= 0 {
			if status != "draft" {
				return TransactionDetail{}, errors.New("destination account is required for transfer")
			}
		} else {
			if *in.DestinationAccountID == in.MoneyAccountID {
				return TransactionDetail{}, ErrTransferSameAccount
			}
			destAcc, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{
				ID:          *in.DestinationAccountID,
				WorkspaceID: workspaceID,
			})
			if err != nil {
				return TransactionDetail{}, errors.New("destination account does not belong to workspace")
			}
			destAccID = pgtype.Int8{Int64: destAcc.ID, Valid: true}
		}
	}

	var catID pgtype.Int8
	if in.CategoryID != nil && *in.CategoryID > 0 {
		cat, err := s.queries.GetCategoryByID(ctx, db.GetCategoryByIDParams{
			ID:          *in.CategoryID,
			WorkspaceID: workspaceID,
		})
		if err != nil {
			return TransactionDetail{}, ErrForbiddenCategory
		}
		catID = pgtype.Int8{Int64: cat.ID, Valid: true}
	}

	purpose := strings.TrimSpace(in.Purpose)
	if purpose == "" {
		purpose = "other"
	}

	// Execute within database transaction
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return TransactionDetail{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := s.queries.WithTx(tx)

	var postedAt pgtype.Timestamptz
	if status == "posted" {
		postedAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	txnRecord, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
		WorkspaceID:          workspaceID,
		Direction:            dir,
		Status:               status,
		AmountMinor:          amountMinor,
		Currency:             currency,
		CurrencyExponent:     int32(exponent),
		EffectiveDate:        pgtype.Date{Time: effDate, Valid: true},
		MoneyAccountID:       pgtype.Int8{Int64: sourceAcc.ID, Valid: true},
		DestinationAccountID: destAccID,
		CategoryID:           catID,
		CounterpartyName:     optionalPgText(in.CounterpartyName),
		Purpose:              purpose,
		Notes:                optionalPgText(in.Notes),
		Reference:            optionalPgText(in.Reference),
		IdempotencyKey:       idempParam,
		CreatedByUserID:      pgtype.Int8{Int64: userID, Valid: true},
		PostedAt:             postedAt,
	})
	if err != nil {
		return TransactionDetail{}, fmt.Errorf("create transaction record: %w", err)
	}

	var ledgerEntry *db.LedgerEntry
	var ledgerLines []db.LedgerLine

	// If posted, perform balance changes and double-entry ledger postings atomically
	if status == "posted" {
		entry, lines, err := s.createBalancedLedger(ctx, qtx, workspaceID, txnRecord, sourceAcc)
		if err != nil {
			return TransactionDetail{}, err
		}
		ledgerEntry = entry
		ledgerLines = lines
	}

	// Attachments metadata
	var attachments []db.AttachmentsMetadatum
	for _, att := range in.Attachments {
		savedAtt, err := qtx.CreateAttachmentMetadata(ctx, db.CreateAttachmentMetadataParams{
			WorkspaceID:   workspaceID,
			TransactionID: pgtype.Int8{Int64: txnRecord.ID, Valid: true},
			StorageKey:    att.StorageKey,
			FileName:      att.FileName,
			FileSizeBytes: att.SizeBytes,
			MimeType:      att.MimeType,
			Sha256Hash:    att.SHA256Hash,
		})
		if err != nil {
			return TransactionDetail{}, fmt.Errorf("record attachment metadata: %w", err)
		}
		attachments = append(attachments, savedAtt)
	}

	if err := tx.Commit(ctx); err != nil {
		return TransactionDetail{}, fmt.Errorf("commit transaction: %w", err)
	}

	return TransactionDetail{
		Transaction: txnRecord,
		Attachments: attachments,
		LedgerEntry: ledgerEntry,
		LedgerLines: ledgerLines,
	}, nil
}

// createBalancedLedger creates balanced double-entry ledger postings for a posted money transaction.
func (s *Service) createBalancedLedger(ctx context.Context, qtx *db.Queries, workspaceID int64, txn db.MoneyTransaction, sourceAcc db.MoneyAccount) (*db.LedgerEntry, []db.LedgerLine, error) {
	entry, err := qtx.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      workspaceID,
		SourceType:       "money_transaction",
		SourceID:         txn.ID,
		EntryDate:        txn.EffectiveDate,
		Currency:         txn.Currency,
		CurrencyExponent: txn.CurrencyExponent,
		Description:      optionalPgText(txn.Notes.String),
	})
	if err != nil {
		return nil, nil, fmt.Errorf("create ledger entry: %w", err)
	}

	var lines []db.LedgerLine

	switch txn.Direction {
	case "money_in":
		// Debit: Money Account (Asset)
		line1, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Int64: sourceAcc.ID, Valid: true},
			AccountClass:  "asset",
			DebitMinor:    txn.AmountMinor,
			CreditMinor:   0,
			Description:   optionalPgText("Deposit to " + sourceAcc.Name),
		})
		if err != nil {
			return nil, nil, err
		}
		lines = append(lines, line1)

		// Credit: Revenue / Income Category
		line2, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "revenue",
			DebitMinor:    0,
			CreditMinor:   txn.AmountMinor,
			Description:   optionalPgText("Income category: " + txn.Purpose),
		})
		if err != nil {
			return nil, nil, err
		}
		lines = append(lines, line2)

		// Update money account balance (+ amount)
		_, err = qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  sourceAcc.ID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: txn.AmountMinor,
		})
		if err != nil {
			return nil, nil, err
		}

	case "money_out":
		// Debit: Expense Category
		line1, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "expense",
			DebitMinor:    txn.AmountMinor,
			CreditMinor:   0,
			Description:   optionalPgText("Expense category: " + txn.Purpose),
		})
		if err != nil {
			return nil, nil, err
		}
		lines = append(lines, line1)

		// Credit: Money Account (Asset)
		line2, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Int64: sourceAcc.ID, Valid: true},
			AccountClass:  "asset",
			DebitMinor:    0,
			CreditMinor:   txn.AmountMinor,
			Description:   optionalPgText("Disbursement from " + sourceAcc.Name),
		})
		if err != nil {
			return nil, nil, err
		}
		lines = append(lines, line2)

		// Update money account balance (- amount)
		_, err = qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  sourceAcc.ID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: -txn.AmountMinor,
		})
		if err != nil {
			return nil, nil, err
		}

	case "transfer":
		if !txn.DestinationAccountID.Valid {
			return nil, nil, errors.New("destination account is required for transfer")
		}
		destAcc, err := qtx.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{
			ID:          txn.DestinationAccountID.Int64,
			WorkspaceID: workspaceID,
		})
		if err != nil {
			return nil, nil, err
		}

		// Debit: Destination Account (Asset)
		line1, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Int64: destAcc.ID, Valid: true},
			AccountClass:  "asset",
			DebitMinor:    txn.AmountMinor,
			CreditMinor:   0,
			Description:   optionalPgText("Transfer to " + destAcc.Name),
		})
		if err != nil {
			return nil, nil, err
		}
		lines = append(lines, line1)

		// Credit: Source Account (Asset)
		line2, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Int64: sourceAcc.ID, Valid: true},
			AccountClass:  "asset",
			DebitMinor:    0,
			CreditMinor:   txn.AmountMinor,
			Description:   optionalPgText("Transfer from " + sourceAcc.Name),
		})
		if err != nil {
			return nil, nil, err
		}
		lines = append(lines, line2)

		// Update source account (- amount)
		_, err = qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  sourceAcc.ID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: -txn.AmountMinor,
		})
		if err != nil {
			return nil, nil, err
		}

		// Update destination account (+ amount)
		_, err = qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  destAcc.ID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: txn.AmountMinor,
		})
		if err != nil {
			return nil, nil, err
		}
	}

	// Verify ledger balance atomically
	var totalDebit, totalCredit int64
	for _, l := range lines {
		totalDebit += l.DebitMinor
		totalCredit += l.CreditMinor
	}
	if totalDebit != totalCredit || totalDebit != txn.AmountMinor {
		return nil, nil, fmt.Errorf("%w: debit %d != credit %d", ErrLedgerUnbalanced, totalDebit, totalCredit)
	}

	return &entry, lines, nil
}

// VoidTransaction marks an existing posted transaction as voided, creates an opposite reversal transaction,
// reverses money account balance changes, and records balanced reversal ledger lines.
func (s *Service) VoidTransaction(ctx context.Context, workspaceID, userID, transactionID int64, reason string) (TransactionDetail, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return TransactionDetail{}, errors.New("void reason is required")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return TransactionDetail{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := s.queries.WithTx(tx)

	// Fetch transaction
	origTxn, err := qtx.GetMoneyTransactionByID(ctx, db.GetMoneyTransactionByIDParams{
		ID:          transactionID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return TransactionDetail{}, ErrNotFound
	} else if err != nil {
		return TransactionDetail{}, err
	}

	if origTxn.Status == "voided" || origTxn.IsVoid {
		return TransactionDetail{}, ErrAlreadyVoided
	}
	if origTxn.Status != "posted" {
		return TransactionDetail{}, ErrCannotVoidNonPosted
	}

	// 1. Mark original transaction voided
	voidedTxn, err := qtx.VoidMoneyTransaction(ctx, db.VoidMoneyTransactionParams{
		ID:          origTxn.ID,
		WorkspaceID: workspaceID,
		VoidReason:  pgtype.Text{String: reason, Valid: true},
	})
	if err != nil {
		return TransactionDetail{}, fmt.Errorf("void original transaction: %w", err)
	}

	// 2. Create reversal transaction
	reversalTxn, err := qtx.CreateReversalTransaction(ctx, db.CreateReversalTransactionParams{
		WorkspaceID:          workspaceID,
		Direction:            origTxn.Direction,
		AmountMinor:          origTxn.AmountMinor,
		Currency:             origTxn.Currency,
		CurrencyExponent:     origTxn.CurrencyExponent,
		EffectiveDate:        pgtype.Date{Time: time.Now().UTC(), Valid: true},
		MoneyAccountID:       origTxn.MoneyAccountID,
		DestinationAccountID: origTxn.DestinationAccountID,
		CategoryID:           origTxn.CategoryID,
		CounterpartyName:     origTxn.CounterpartyName,
		Purpose:              "reversal",
		Notes:                pgtype.Text{String: "Reversal of txn #" + fmt.Sprint(origTxn.ID) + ": " + reason, Valid: true},
		Reference:            origTxn.Reference,
		ReversalOfID:         pgtype.Int8{Int64: origTxn.ID, Valid: true},
		CreatedByUserID:      pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return TransactionDetail{}, fmt.Errorf("create reversal transaction: %w", err)
	}

	// 3. Create reversal ledger entry with swapped debits and credits
	revEntry, err := qtx.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      workspaceID,
		SourceType:       "reversal",
		SourceID:         reversalTxn.ID,
		EntryDate:        pgtype.Date{Time: time.Now().UTC(), Valid: true},
		Currency:         origTxn.Currency,
		CurrencyExponent: origTxn.CurrencyExponent,
		Description:      pgtype.Text{String: "Reversal of entry for txn #" + fmt.Sprint(origTxn.ID), Valid: true},
	})
	if err != nil {
		return TransactionDetail{}, fmt.Errorf("create reversal ledger entry: %w", err)
	}

	var revLines []db.LedgerLine

	// Reverse balance changes & ledger lines based on direction
	switch origTxn.Direction {
	case "money_in":
		// Original: Debit Bank, Credit Income.
		// Reversal: Debit Income, Credit Bank.
		line1, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: revEntry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "revenue",
			DebitMinor:    origTxn.AmountMinor,
			CreditMinor:   0,
			Description:   optionalPgText("Reversal of income"),
		})
		if err != nil {
			return TransactionDetail{}, err
		}
		revLines = append(revLines, line1)

		line2, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: revEntry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     origTxn.MoneyAccountID,
			AccountClass:  "asset",
			DebitMinor:    0,
			CreditMinor:   origTxn.AmountMinor,
			Description:   optionalPgText("Reversal bank deduction"),
		})
		if err != nil {
			return TransactionDetail{}, err
		}
		revLines = append(revLines, line2)

		// Deduct from bank balance
		_, err = qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  origTxn.MoneyAccountID.Int64,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: -origTxn.AmountMinor,
		})
		if err != nil {
			return TransactionDetail{}, err
		}

	case "money_out":
		// Original: Debit Expense, Credit Bank.
		// Reversal: Debit Bank, Credit Expense.
		line1, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: revEntry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     origTxn.MoneyAccountID,
			AccountClass:  "asset",
			DebitMinor:    origTxn.AmountMinor,
			CreditMinor:   0,
			Description:   optionalPgText("Reversal refund to bank"),
		})
		if err != nil {
			return TransactionDetail{}, err
		}
		revLines = append(revLines, line1)

		line2, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: revEntry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "expense",
			DebitMinor:    0,
			CreditMinor:   origTxn.AmountMinor,
			Description:   optionalPgText("Reversal of expense"),
		})
		if err != nil {
			return TransactionDetail{}, err
		}
		revLines = append(revLines, line2)

		// Add back to bank balance
		_, err = qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  origTxn.MoneyAccountID.Int64,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: origTxn.AmountMinor,
		})
		if err != nil {
			return TransactionDetail{}, err
		}

	case "transfer":
		// Original: Debit Dest, Credit Source.
		// Reversal: Debit Source, Credit Dest.
		line1, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: revEntry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     origTxn.MoneyAccountID,
			AccountClass:  "asset",
			DebitMinor:    origTxn.AmountMinor,
			CreditMinor:   0,
			Description:   optionalPgText("Reversal refund to source account"),
		})
		if err != nil {
			return TransactionDetail{}, err
		}
		revLines = append(revLines, line1)

		line2, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: revEntry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     origTxn.DestinationAccountID,
			AccountClass:  "asset",
			DebitMinor:    0,
			CreditMinor:   origTxn.AmountMinor,
			Description:   optionalPgText("Reversal deduction from dest account"),
		})
		if err != nil {
			return TransactionDetail{}, err
		}
		revLines = append(revLines, line2)

		// Source account balance +
		_, err = qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  origTxn.MoneyAccountID.Int64,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: origTxn.AmountMinor,
		})
		if err != nil {
			return TransactionDetail{}, err
		}

		// Destination account balance -
		_, err = qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  origTxn.DestinationAccountID.Int64,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: -origTxn.AmountMinor,
		})
		if err != nil {
			return TransactionDetail{}, err
		}
	}

	// Verify balanced reversal lines
	var totalDebit, totalCredit int64
	for _, l := range revLines {
		totalDebit += l.DebitMinor
		totalCredit += l.CreditMinor
	}
	if totalDebit != totalCredit || totalDebit != origTxn.AmountMinor {
		return TransactionDetail{}, fmt.Errorf("%w: reversal debit %d != credit %d", ErrLedgerUnbalanced, totalDebit, totalCredit)
	}

	if err := tx.Commit(ctx); err != nil {
		return TransactionDetail{}, fmt.Errorf("commit void transaction: %w", err)
	}

	return TransactionDetail{
		Transaction: voidedTxn,
		LedgerEntry: &revEntry,
		LedgerLines: revLines,
	}, nil
}

func (s *Service) GetTransaction(ctx context.Context, workspaceID, transactionID int64) (TransactionDetail, error) {
	txn, err := s.queries.GetMoneyTransactionByID(ctx, db.GetMoneyTransactionByIDParams{
		ID:          transactionID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return TransactionDetail{}, ErrNotFound
	} else if err != nil {
		return TransactionDetail{}, err
	}

	attachments, err := s.queries.ListAttachmentsByTransactionID(ctx, db.ListAttachmentsByTransactionIDParams{
		TransactionID: pgtype.Int8{Int64: txn.ID, Valid: true},
		WorkspaceID:   workspaceID,
	})
	if err != nil {
		return TransactionDetail{}, err
	}

	return TransactionDetail{
		Transaction: txn,
		Attachments: attachments,
	}, nil
}

type ListTransactionsFilter struct {
	FromDate  string `form:"from"`
	ToDate    string `form:"to"`
	Status    string `form:"status"`
	Direction string `form:"direction"`
	BeforeID  int64  `form:"before_id"`
	Limit     int32  `form:"limit"`
}

func (s *Service) ListTransactions(ctx context.Context, workspaceID int64, f ListTransactionsFilter) ([]db.MoneyTransaction, error) {
	limit := f.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var fromDateParam, toDateParam pgtype.Date
	if f.FromDate != "" {
		if t, err := time.Parse("2006-01-02", f.FromDate); err == nil {
			fromDateParam = pgtype.Date{Time: t, Valid: true}
		}
	}
	if f.ToDate != "" {
		if t, err := time.Parse("2006-01-02", f.ToDate); err == nil {
			toDateParam = pgtype.Date{Time: t, Valid: true}
		}
	}

	var statusParam, dirParam pgtype.Text
	if f.Status != "" {
		statusParam = pgtype.Text{String: f.Status, Valid: true}
	}
	if f.Direction != "" {
		dirParam = pgtype.Text{String: f.Direction, Valid: true}
	}

	var beforeIDParam pgtype.Int8
	if f.BeforeID > 0 {
		beforeIDParam = pgtype.Int8{Int64: f.BeforeID, Valid: true}
	}

	return s.queries.ListMoneyTransactions(ctx, db.ListMoneyTransactionsParams{
		WorkspaceID: workspaceID,
		Limit:       limit,
		FromDate:    fromDateParam,
		ToDate:      toDateParam,
		Status:      statusParam,
		Direction:   dirParam,
		BeforeID:    beforeIDParam,
	})
}

func optionalPgText(val string) pgtype.Text {
	val = strings.TrimSpace(val)
	if val == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: val, Valid: true}
}
