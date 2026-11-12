package finance

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrJournalUnbalanced            = errors.New("journal debits must equal credits and be positive")
	ErrAccountMappingMissing        = errors.New("required chart account mapping is missing")
	ErrAccountTypeInvalid           = errors.New("account class or subtype is invalid")
	ErrControlAccountPostingBlocked = errors.New("direct manual posting to a protected control account is forbidden")
	ErrPeriodClosed                 = errors.New("accounting period is closed for ordinary posting")
	ErrPeriodLocked                 = errors.New("accounting period is locked")
	ErrPeriodCloseCheckFailed       = errors.New("critical period-close checks failed")
	ErrSubledgerReconFailed         = errors.New("subledger reconciliation failed")
	ErrChartCycleDetected           = errors.New("parent account assignment would create a cycle")
	ErrSystemAccountProtected       = errors.New("system or control accounts cannot be archived")
	ErrManualJournalApprovalSelf    = errors.New("creator cannot approve their own manual journal when separation of duties applies")
)

func blueprint11Error(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": err.Error()}})
	case errors.Is(err, ErrJournalUnbalanced):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "JOURNAL_UNBALANCED", "message": err.Error()}})
	case errors.Is(err, ErrAccountMappingMissing):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "ACCOUNT_MAPPING_MISSING", "message": err.Error()}})
	case errors.Is(err, ErrAccountTypeInvalid), errors.Is(err, ErrChartCycleDetected):
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "ACCOUNT_TYPE_INVALID", "message": err.Error()}})
	case errors.Is(err, ErrControlAccountPostingBlocked), errors.Is(err, ErrSystemAccountProtected):
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "CONTROL_ACCOUNT_POSTING_FORBIDDEN", "message": err.Error()}})
	case errors.Is(err, ErrPeriodClosed):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "PERIOD_CLOSED", "message": err.Error()}})
	case errors.Is(err, ErrPeriodLocked):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "PERIOD_LOCKED", "message": err.Error()}})
	case errors.Is(err, ErrPeriodCloseCheckFailed):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "PERIOD_CLOSE_CHECK_FAILED", "message": err.Error()}})
	case errors.Is(err, ErrSubledgerReconFailed):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "SUBLEDGER_RECONCILIATION_FAILED", "message": err.Error()}})
	case errors.Is(err, ErrDuplicateIdempotent):
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "IDEMPOTENCY_CONFLICT", "message": err.Error()}})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_FAILED", "message": err.Error()}})
	}
}

type defaultChartDef struct {
	Code             string
	Name             string
	Class            string
	Subtype          string
	IsSystem         bool
	IsControl        bool
	ControlSubledger string
	MappingKey       string
}

func defaultChartDefinitions(kind string) []defaultChartDef {
	defs := []defaultChartDef{
		{Code: "1000", Name: "Cash & Bank", Class: "asset", Subtype: "cash_and_bank", IsSystem: true, IsControl: true, ControlSubledger: "cash_bank", MappingKey: "cash_default"},
		{Code: "1400", Name: "Loans Receivable", Class: "asset", Subtype: "loans_receivable", IsSystem: true, IsControl: true, ControlSubledger: "loans_receivable", MappingKey: "loans_receivable"},
		{Code: "1500", Name: "Investments", Class: "asset", Subtype: "investments", IsSystem: true, MappingKey: "investments"},
		{Code: "1600", Name: "Property & Personal Assets", Class: "asset", Subtype: "property_assets", IsSystem: true, MappingKey: "personal_assets"},
		{Code: "2200", Name: "Loans Payable", Class: "liability", Subtype: "loans_payable", IsSystem: true, IsControl: true, ControlSubledger: "loans_payable", MappingKey: "loans_payable"},
		{Code: "2900", Name: "Suspense / Unclassified", Class: "liability", Subtype: "suspense", IsSystem: true, IsControl: true, ControlSubledger: "suspense", MappingKey: "suspense"},
		{Code: "3000", Name: "Owner Capital", Class: "equity", Subtype: "owner_capital", IsSystem: true, MappingKey: "owner_capital"},
		{Code: "3100", Name: "Owner Drawings", Class: "equity", Subtype: "owner_drawings", IsSystem: true, MappingKey: "owner_drawings"},
		{Code: "3200", Name: "Opening Balance Equity", Class: "equity", Subtype: "opening_balance_equity", IsSystem: true, MappingKey: "opening_balance_equity"},
		{Code: "4200", Name: "Interest & Other Income", Class: "revenue", Subtype: "other_operating_income", IsSystem: true, MappingKey: "interest_income"},
		{Code: "6000", Name: "Operating & General Expenses", Class: "expense", Subtype: "operating_expense", IsSystem: true, MappingKey: "operating_expense"},
		{Code: "6100", Name: "Interest & Finance Expense", Class: "expense", Subtype: "interest_expense", IsSystem: true, MappingKey: "interest_expense"},
	}

	if kind == "business" {
		defs = append(defs,
			defaultChartDef{Code: "1100", Name: "Accounts Receivable", Class: "asset", Subtype: "accounts_receivable", IsSystem: true, IsControl: true, ControlSubledger: "ar", MappingKey: "ar_control"},
			defaultChartDef{Code: "1200", Name: "Inventory", Class: "asset", Subtype: "inventory", IsSystem: true, IsControl: true, ControlSubledger: "inventory", MappingKey: "inventory_control"},
			defaultChartDef{Code: "1300", Name: "Supplier Advances", Class: "asset", Subtype: "supplier_advances", IsSystem: true, IsControl: true, ControlSubledger: "supplier_advances", MappingKey: "supplier_advances"},
			defaultChartDef{Code: "1700", Name: "VAT Recoverable", Class: "asset", Subtype: "tax_recoverable", IsSystem: true, IsControl: true, ControlSubledger: "tax_recoverable", MappingKey: "vat_recoverable"},
			defaultChartDef{Code: "1800", Name: "WHT Receivable", Class: "asset", Subtype: "tax_recoverable", IsSystem: true, MappingKey: "wht_receivable"},
			defaultChartDef{Code: "2000", Name: "Accounts Payable", Class: "liability", Subtype: "accounts_payable", IsSystem: true, IsControl: true, ControlSubledger: "ap", MappingKey: "ap_control"},
			defaultChartDef{Code: "2100", Name: "Customer Deposits", Class: "liability", Subtype: "customer_deposits", IsSystem: true, IsControl: true, ControlSubledger: "customer_deposits", MappingKey: "customer_deposits"},
			defaultChartDef{Code: "2300", Name: "VAT Payable", Class: "liability", Subtype: "tax_payable", IsSystem: true, IsControl: true, ControlSubledger: "tax_payable", MappingKey: "vat_payable"},
			defaultChartDef{Code: "2400", Name: "WHT Payable", Class: "liability", Subtype: "tax_payable", IsSystem: true, MappingKey: "wht_payable"},
			defaultChartDef{Code: "2500", Name: "GRNI / Accrued Purchases", Class: "liability", Subtype: "grni", IsSystem: true, IsControl: true, ControlSubledger: "grni", MappingKey: "grni"},
			defaultChartDef{Code: "4000", Name: "Product Sales Revenue", Class: "revenue", Subtype: "product_sales", IsSystem: true, MappingKey: "sales_revenue"},
			defaultChartDef{Code: "4100", Name: "Service Revenue", Class: "revenue", Subtype: "service_revenue", IsSystem: true, MappingKey: "service_revenue"},
			defaultChartDef{Code: "5000", Name: "Cost of Goods Sold", Class: "expense", Subtype: "cogs", IsSystem: true, MappingKey: "cogs"},
			defaultChartDef{Code: "6200", Name: "Inventory Loss & Adjustment", Class: "expense", Subtype: "inventory_adjustment", IsSystem: true, MappingKey: "inventory_adjustment"},
		)
	}
	return defs
}

// SeedDefaultChartOfAccounts creates default chart accounts and mappings idempotently.
func (s *Service) SeedDefaultChartOfAccounts(ctx context.Context, workspaceID int64, kind string) ([]db.ChartAccount, error) {
	if kind != "personal" && kind != "business" {
		kind = "business"
	}
	for _, d := range defaultChartDefinitions(kind) {
		acc, err := s.queries.GetChartAccountByCode(ctx, db.GetChartAccountByCodeParams{
			WorkspaceID: workspaceID,
			Code:        d.Code,
		})
		if isNoRows(err) {
			var subledger pgtype.Text
			if d.ControlSubledger != "" {
				subledger = pgtype.Text{String: d.ControlSubledger, Valid: true}
			}
			acc, err = s.queries.CreateChartAccount(ctx, db.CreateChartAccountParams{
				WorkspaceID:      workspaceID,
				Code:             d.Code,
				Name:             d.Name,
				AccountClass:     d.Class,
				Subtype:          d.Subtype,
				IsSystem:         d.IsSystem,
				IsControl:        d.IsControl,
				ControlSubledger: subledger,
				IsActive:         true,
				TemplateVersion:  "v1",
			})
			if err != nil {
				return nil, fmt.Errorf("seed chart account %s: %w", d.Code, err)
			}
		} else if err != nil {
			return nil, err
		}

		if d.MappingKey != "" {
			if _, err := s.queries.GetAccountMappingByKey(ctx, db.GetAccountMappingByKeyParams{
				WorkspaceID: workspaceID,
				MappingKey:  d.MappingKey,
			}); isNoRows(err) {
				if _, err := s.queries.UpsertAccountMapping(ctx, db.UpsertAccountMappingParams{
					WorkspaceID:    workspaceID,
					MappingKey:     d.MappingKey,
					ChartAccountID: acc.ID,
				}); err != nil {
					return nil, err
				}
			}
		}
	}
	return s.ListChartAccounts(ctx, workspaceID, "", nil)
}

type CreateChartAccountInput struct {
	Code                string `json:"code" binding:"required"`
	Name                string `json:"name" binding:"required"`
	AccountClass        string `json:"account_class" binding:"required"`
	Subtype             string `json:"subtype" binding:"required"`
	ParentID            *int64 `json:"parent_id"`
	CurrencyRestriction string `json:"currency_restriction"`
	Description         string `json:"description"`
}

func (s *Service) CreateChartAccount(ctx context.Context, workspaceID int64, in CreateChartAccountInput) (db.ChartAccount, error) {
	code := strings.TrimSpace(in.Code)
	name := strings.TrimSpace(in.Name)
	class := strings.ToLower(strings.TrimSpace(in.AccountClass))
	subtype := strings.ToLower(strings.TrimSpace(in.Subtype))
	if code == "" || name == "" || subtype == "" {
		return db.ChartAccount{}, ErrAccountTypeInvalid
	}
	switch class {
	case "asset", "liability", "equity", "revenue", "expense":
	default:
		return db.ChartAccount{}, ErrAccountTypeInvalid
	}

	if in.ParentID != nil && *in.ParentID > 0 {
		parent, err := s.queries.GetChartAccountByID(ctx, db.GetChartAccountByIDParams{
			ID:          *in.ParentID,
			WorkspaceID: workspaceID,
		})
		if isNoRows(err) {
			return db.ChartAccount{}, ErrForbiddenAccount
		}
		if err != nil {
			return db.ChartAccount{}, err
		}
		if parent.AccountClass != class {
			return db.ChartAccount{}, errors.New("parent account must share the same account_class")
		}
	}

	var currRestriction pgtype.Text
	if c := strings.ToUpper(strings.TrimSpace(in.CurrencyRestriction)); c != "" {
		if len(c) != 3 {
			return db.ChartAccount{}, errors.New("currency_restriction must be a 3-letter ISO code")
		}
		currRestriction = pgtype.Text{String: c, Valid: true}
	}

	return s.queries.CreateChartAccount(ctx, db.CreateChartAccountParams{
		WorkspaceID:         workspaceID,
		Code:                code,
		Name:                name,
		AccountClass:        class,
		Subtype:             subtype,
		ParentID:            pgInt8Ptr(in.ParentID),
		CurrencyRestriction: currRestriction,
		IsSystem:            false,
		IsControl:           false,
		IsActive:            true,
		TemplateVersion:     "v1",
		Description:         optionalPgText(in.Description),
	})
}

type UpdateChartAccountInput struct {
	Name        string `json:"name"`
	ParentID    *int64 `json:"parent_id"`
	Description string `json:"description"`
}

func (s *Service) UpdateChartAccount(ctx context.Context, workspaceID, accountID int64, in UpdateChartAccountInput) (db.ChartAccount, error) {
	acc, err := s.queries.GetChartAccountByID(ctx, db.GetChartAccountByIDParams{
		ID:          accountID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return db.ChartAccount{}, ErrNotFound
	}
	if err != nil {
		return db.ChartAccount{}, err
	}

	if in.ParentID != nil && *in.ParentID > 0 {
		if *in.ParentID == accountID {
			return db.ChartAccount{}, ErrChartCycleDetected
		}
		// Walk up ancestors to prevent cycles
		curID := *in.ParentID
		for depth := 0; depth < 32; depth++ {
			parent, err := s.queries.GetChartAccountByID(ctx, db.GetChartAccountByIDParams{
				ID:          curID,
				WorkspaceID: workspaceID,
			})
			if isNoRows(err) {
				return db.ChartAccount{}, ErrForbiddenAccount
			}
			if err != nil {
				return db.ChartAccount{}, err
			}
			if depth == 0 && parent.AccountClass != acc.AccountClass {
				return db.ChartAccount{}, errors.New("parent account must have compatible account_class")
			}
			if !parent.ParentID.Valid {
				break
			}
			if parent.ParentID.Int64 == accountID {
				return db.ChartAccount{}, ErrChartCycleDetected
			}
			curID = parent.ParentID.Int64
		}
	}

	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = acc.Name
	}

	return s.queries.UpdateChartAccount(ctx, db.UpdateChartAccountParams{
		ID:          accountID,
		WorkspaceID: workspaceID,
		Name:        name,
		ParentID:    pgInt8Ptr(in.ParentID),
		Description: optionalPgText(in.Description),
	})
}

func (s *Service) ArchiveChartAccount(ctx context.Context, workspaceID, accountID int64) (db.ChartAccount, error) {
	acc, err := s.queries.GetChartAccountByID(ctx, db.GetChartAccountByIDParams{
		ID:          accountID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return db.ChartAccount{}, ErrNotFound
	}
	if err != nil {
		return db.ChartAccount{}, err
	}
	if acc.IsSystem || acc.IsControl {
		return db.ChartAccount{}, ErrSystemAccountProtected
	}
	return s.queries.ArchiveChartAccount(ctx, db.ArchiveChartAccountParams{
		ID:          accountID,
		WorkspaceID: workspaceID,
	})
}

func (s *Service) ListChartAccounts(ctx context.Context, workspaceID int64, class string, isActive *bool) ([]db.ChartAccount, error) {
	var classParam pgtype.Text
	if class != "" {
		classParam = pgtype.Text{String: class, Valid: true}
	}
	var activeParam pgtype.Bool
	if isActive != nil {
		activeParam = pgtype.Bool{Bool: *isActive, Valid: true}
	}
	return s.queries.ListChartAccounts(ctx, db.ListChartAccountsParams{
		WorkspaceID:  workspaceID,
		IsActive:     activeParam,
		AccountClass: classParam,
	})
}

func (s *Service) ListAccountMappings(ctx context.Context, workspaceID int64) ([]db.ListAccountMappingsRow, error) {
	return s.queries.ListAccountMappings(ctx, workspaceID)
}

func (s *Service) UpsertAccountMapping(ctx context.Context, workspaceID, userID int64, mappingKey string, chartAccountID int64) (db.AccountMapping, error) {
	if _, err := s.queries.GetChartAccountByID(ctx, db.GetChartAccountByIDParams{
		ID:          chartAccountID,
		WorkspaceID: workspaceID,
	}); isNoRows(err) {
		return db.AccountMapping{}, ErrForbiddenAccount
	} else if err != nil {
		return db.AccountMapping{}, err
	}
	return s.queries.UpsertAccountMapping(ctx, db.UpsertAccountMappingParams{
		WorkspaceID:     workspaceID,
		MappingKey:      strings.TrimSpace(mappingKey),
		ChartAccountID:  chartAccountID,
		UpdatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
}
