package finance

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrPersonalWorkspaceRequired = errors.New("this action is only available in an owner-owned Personal workspace")
	ErrOwnerAccessRequired       = errors.New("owner access is required for this action")
	ErrCrossSpaceAccessRequired  = errors.New("ownership of both source and destination workspaces is required")
	ErrAccountArchived           = errors.New("account is archived and cannot be used for new postings")
	ErrLoanBalanceInsufficient   = errors.New("repayment principal exceeds outstanding loan principal")
	ErrLoanComponentsMismatch    = errors.New("principal, interest, and fee components must equal total repayment amount")
	ErrAssetAlreadyDisposed      = errors.New("asset has already been disposed")
	ErrOwnerTransferPurpose      = errors.New("an explicit owner transfer purpose is required")
	ErrBudgetPeriodConflict      = errors.New("budget period dates are invalid")
	ErrBudgetCurrencyMismatch    = errors.New("budget currency does not match workspace or account currency")
)

// requirePersonalWorkspace enforces that the active workspace is a Personal workspace owned by the caller.
func requirePersonalWorkspace(c *gin.Context) (WorkspaceContext, bool) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return WorkspaceContext{}, false
	}
	if wsCtx.Kind != "personal" || !wsCtx.IsOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": ErrPersonalWorkspaceRequired.Error()}})
		return WorkspaceContext{}, false
	}
	return wsCtx, true
}

// requireOwnerContext enforces that the caller is authenticated and owns the active workspace (or is owner for /owner/* routes).
func requireOwnerContext(c *gin.Context) (WorkspaceContext, bool) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return WorkspaceContext{}, false
	}
	if !wsCtx.IsOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": ErrOwnerAccessRequired.Error()}})
		return WorkspaceContext{}, false
	}
	return wsCtx, true
}

type ledgerPostingLine struct {
	AccountID    *int64
	AccountClass string
	DebitMinor   int64
	CreditMinor  int64
	Description  string
}

// postBalancedLedgerTx verifies exact debit/credit equality and writes a balanced ledger entry + lines.
func postBalancedLedgerTx(
	ctx context.Context,
	qtx *db.Queries,
	workspaceID int64,
	sourceType string,
	sourceID int64,
	entryDate time.Time,
	currency string,
	exponent int32,
	description string,
	lines []ledgerPostingLine,
) (db.LedgerEntry, error) {
	var totalDebit, totalCredit int64
	for _, l := range lines {
		if l.DebitMinor < 0 || l.CreditMinor < 0 {
			return db.LedgerEntry{}, ErrLedgerUnbalanced
		}
		if (l.DebitMinor > 0 && l.CreditMinor > 0) || (l.DebitMinor == 0 && l.CreditMinor == 0) {
			return db.LedgerEntry{}, ErrLedgerUnbalanced
		}
		totalDebit += l.DebitMinor
		totalCredit += l.CreditMinor
	}
	if totalDebit <= 0 || totalDebit != totalCredit {
		return db.LedgerEntry{}, ErrLedgerUnbalanced
	}

	entry, err := qtx.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      workspaceID,
		SourceType:       sourceType,
		SourceID:         sourceID,
		EntryDate:        pgtype.Date{Time: entryDate, Valid: true},
		Currency:         currency,
		CurrencyExponent: exponent,
		Description:      pgtype.Text{String: description, Valid: description != ""},
	})
	if err != nil {
		return db.LedgerEntry{}, fmt.Errorf("create ledger entry: %w", err)
	}

	for _, l := range lines {
		var accID pgtype.Int8
		if l.AccountID != nil && *l.AccountID > 0 {
			accID = pgtype.Int8{Int64: *l.AccountID, Valid: true}
		}
		if _, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     accID,
			AccountClass:  l.AccountClass,
			DebitMinor:    l.DebitMinor,
			CreditMinor:   l.CreditMinor,
			Description:   pgtype.Text{String: l.Description, Valid: l.Description != ""},
		}); err != nil {
			return db.LedgerEntry{}, fmt.Errorf("create ledger line: %w", err)
		}
	}

	return entry, nil
}

func parseDateStrict(raw string) (time.Time, error) {
	t, err := time.Parse("2006-01-02", strings.TrimSpace(raw))
	if err != nil {
		return time.Time{}, errors.New("invalid date format, expected YYYY-MM-DD")
	}
	return t, nil
}

func resolveAmountMinor(amountStr string, amountMinor int64, currency string) (int64, error) {
	if strings.TrimSpace(amountStr) != "" {
		parsed, err := ParseMajorToMinor(strings.TrimSpace(amountStr), CurrencyExponent(currency))
		if err != nil {
			return 0, err
		}
		return parsed, nil
	}
	return amountMinor, nil
}

func resolveNonNegativeAmountMinor(amountStr string, amountMinor int64, currency string) (int64, error) {
	trimmed := strings.TrimSpace(amountStr)
	if trimmed == "0" || trimmed == "0.0" || trimmed == "0.00" || trimmed == "0.000" {
		return 0, nil
	}
	return resolveAmountMinor(amountStr, amountMinor, currency)
}

func accountBalanceClass(accountType string) string {
	switch accountType {
	case "card", "credit":
		return "liability"
	default:
		return "asset"
	}
}

func personalFinanceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": err.Error()}})
	case errors.Is(err, ErrPersonalWorkspaceRequired), errors.Is(err, ErrOwnerAccessRequired), errors.Is(err, ErrCrossSpaceAccessRequired), errors.Is(err, ErrForbiddenAccount), errors.Is(err, ErrForbiddenCategory):
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": err.Error()}})
	case errors.Is(err, ErrDuplicateIdempotent):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "IDEMPOTENCY_CONFLICT", "message": err.Error()}})
	case errors.Is(err, ErrLoanBalanceInsufficient):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "LOAN_BALANCE_INSUFFICIENT", "message": err.Error()}})
	case errors.Is(err, ErrLoanComponentsMismatch):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "LOAN_EVENT_COMPONENTS_MISMATCH", "message": err.Error()}})
	case errors.Is(err, ErrAssetAlreadyDisposed):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "ASSET_ALREADY_DISPOSED", "message": err.Error()}})
	case errors.Is(err, ErrOwnerTransferPurpose):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "OWNER_TRANSFER_PURPOSE_REQUIRED", "message": err.Error()}})
	case errors.Is(err, ErrAccountCurrencyMismatch), errors.Is(err, ErrBudgetCurrencyMismatch):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CURRENCY_MISMATCH", "message": err.Error()}})
	case errors.Is(err, ErrAccountArchived):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "ACCOUNT_ARCHIVED", "message": err.Error()}})
	case errors.Is(err, ErrInvalidBudgetDates), errors.Is(err, ErrInvalidBudgetAmount), errors.Is(err, ErrBudgetPeriodConflict):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_FAILED", "message": err.Error()}})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_FAILED", "message": err.Error()}})
	}
}

func pgInt8Ptr(v *int64) pgtype.Int8 {
	if v == nil || *v <= 0 {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: *v, Valid: true}
}

func pgDatePtr(t *time.Time) pgtype.Date {
	if t == nil {
		return pgtype.Date{}
	}
	return pgtype.Date{Time: *t, Valid: true}
}

func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
