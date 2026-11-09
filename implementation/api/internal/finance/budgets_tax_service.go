package finance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrPlanLimitExceeded   = errors.New("plan limit exceeded for active budgets")
	ErrInvalidBudgetDates  = errors.New("budget end date must be on or after start date")
	ErrInvalidBudgetAmount = errors.New("budget amount must be greater than zero")
)

// PlanLimitChecker abstracts entitlement/limit validation without coupling to billing engine.
type PlanLimitChecker interface {
	CheckBudgetLimit(ctx context.Context, workspaceID int64) error
}

// DefaultPlanLimitChecker counts active budgets in the workspace.
type DefaultPlanLimitChecker struct {
	queries          *db.Queries
	maxActiveBudgets int64
}

func NewDefaultPlanLimitChecker(queries *db.Queries, maxActiveBudgets int64) *DefaultPlanLimitChecker {
	if maxActiveBudgets <= 0 {
		maxActiveBudgets = 50
	}
	return &DefaultPlanLimitChecker{
		queries:          queries,
		maxActiveBudgets: maxActiveBudgets,
	}
}

func (c *DefaultPlanLimitChecker) CheckBudgetLimit(ctx context.Context, workspaceID int64) error {
	count, err := c.queries.CountActiveBudgets(ctx, workspaceID)
	if err != nil {
		return fmt.Errorf("count active budgets: %w", err)
	}
	if count >= c.maxActiveBudgets {
		return ErrPlanLimitExceeded
	}
	return nil
}

func (s *Service) getPlanLimitChecker() PlanLimitChecker {
	if s.planLimitChecker != nil {
		return s.planLimitChecker
	}
	return NewDefaultPlanLimitChecker(s.queries, 50)
}

func (s *Service) SetPlanLimitChecker(checker PlanLimitChecker) {
	s.planLimitChecker = checker
}

// ---------------- Budget Types ----------------

type CreateBudgetInput struct {
	Name             string `json:"name" binding:"required"`
	CategoryID       *int64 `json:"category_id"`
	Scope            string `json:"scope"`  // personal, business, all (default business)
	Period           string `json:"period"` // monthly, quarterly, annual, custom (default monthly)
	AmountMinor      int64  `json:"amount_minor"`
	Amount           string `json:"amount"` // optional major decimal string
	Currency         string `json:"currency"`
	CurrencyExponent int    `json:"currency_exponent"`
	StartDate        string `json:"start_date" binding:"required"` // YYYY-MM-DD
	EndDate          string `json:"end_date" binding:"required"`   // YYYY-MM-DD
	Notes            string `json:"notes"`
	IdempotencyKey   string `json:"idempotency_key"`
}

type UpdateBudgetInput struct {
	Name        string `json:"name"`
	AmountMinor int64  `json:"amount_minor"`
	StartDate   string `json:"start_date"`
	EndDate     string `json:"end_date"`
	Notes       string `json:"notes"`
	IsActive    *bool  `json:"is_active"`
}

type ListBudgetsFilter struct {
	Scope    string
	IsActive *bool
	FromDate string
	ToDate   string
	Limit    int32
}

type BudgetDetail struct {
	Budget db.Budget `json:"budget"`
}

type BudgetStatusResult struct {
	Budget                   db.Budget `json:"budget"`
	BudgetAmountMinor        int64     `json:"budget_amount_minor"`
	ActualSpendingMinor      int64     `json:"actual_spending_minor"`
	RemainingMinor           int64     `json:"remaining_minor"`
	UsageBasisPoints         int64     `json:"usage_basis_points"` // e.g. 7500 = 75.00%
	UsagePercentageFormatted string    `json:"usage_percentage_formatted"`
	IsOverBudget             bool      `json:"is_over_budget"`
}

// ---------------- Budget Service Logic ----------------

func (s *Service) CreateBudget(ctx context.Context, workspaceID, userID int64, in CreateBudgetInput) (BudgetDetail, error) {
	if in.Amount != "" {
		parsed, err := ParseMajorToMinor(in.Amount, CurrencyExponent(in.Currency))
		if err != nil {
			return BudgetDetail{}, err
		}
		in.AmountMinor = parsed
	}
	if in.AmountMinor <= 0 {
		return BudgetDetail{}, ErrInvalidBudgetAmount
	}

	startDate, err := time.Parse("2006-01-02", in.StartDate)
	if err != nil {
		return BudgetDetail{}, fmt.Errorf("invalid start_date format, expected YYYY-MM-DD: %w", err)
	}

	endDate, err := time.Parse("2006-01-02", in.EndDate)
	if err != nil {
		return BudgetDetail{}, fmt.Errorf("invalid end_date format, expected YYYY-MM-DD: %w", err)
	}

	if endDate.Before(startDate) {
		return BudgetDetail{}, ErrInvalidBudgetDates
	}

	currency := in.Currency
	if currency == "" {
		currency = "NGN"
	}
	exponent := in.CurrencyExponent
	if exponent <= 0 {
		exponent = 2
	}

	scope := in.Scope
	if scope == "" {
		scope = "business"
	}
	if scope != "business" && scope != "personal" && scope != "all" {
		return BudgetDetail{}, fmt.Errorf("invalid scope: %s", scope)
	}

	period := in.Period
	if period == "" {
		period = "monthly"
	}
	if period != "monthly" && period != "quarterly" && period != "annual" && period != "custom" {
		return BudgetDetail{}, fmt.Errorf("invalid period: %s", period)
	}

	// Idempotency check
	if in.IdempotencyKey != "" {
		existing, err := s.queries.GetBudgetByIdempotency(ctx, db.GetBudgetByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: in.IdempotencyKey, Valid: true},
		})
		if err == nil {
			return BudgetDetail{Budget: existing}, nil
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return BudgetDetail{}, fmt.Errorf("check budget idempotency: %w", err)
		}
	}

	// Plan limit check
	checker := s.getPlanLimitChecker()
	if err := checker.CheckBudgetLimit(ctx, workspaceID); err != nil {
		return BudgetDetail{}, err
	}

	// Category workspace verification
	var categoryIDParam pgtype.Int8
	if in.CategoryID != nil && *in.CategoryID > 0 {
		cat, err := s.queries.GetCategoryByID(ctx, db.GetCategoryByIDParams{
			ID:          *in.CategoryID,
			WorkspaceID: workspaceID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return BudgetDetail{}, ErrForbiddenCategory
		} else if err != nil {
			return BudgetDetail{}, fmt.Errorf("check category: %w", err)
		}
		categoryIDParam = pgtype.Int8{Int64: cat.ID, Valid: true}
	}

	var idempParam pgtype.Text
	if in.IdempotencyKey != "" {
		idempParam = pgtype.Text{String: in.IdempotencyKey, Valid: true}
	}

	record, err := s.queries.CreateBudget(ctx, db.CreateBudgetParams{
		WorkspaceID:      workspaceID,
		Name:             in.Name,
		CategoryID:       categoryIDParam,
		Scope:            scope,
		Period:           period,
		AmountMinor:      in.AmountMinor,
		Currency:         currency,
		CurrencyExponent: int32(exponent),
		StartDate:        pgtype.Date{Time: startDate, Valid: true},
		EndDate:          pgtype.Date{Time: endDate, Valid: true},
		IsActive:         true,
		Notes:            optionalPgText(in.Notes),
		IdempotencyKey:   idempParam,
		CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return BudgetDetail{}, fmt.Errorf("create budget: %w", err)
	}

	return BudgetDetail{Budget: record}, nil
}

func (s *Service) GetBudget(ctx context.Context, workspaceID, budgetID int64) (BudgetDetail, error) {
	b, err := s.queries.GetBudgetByID(ctx, db.GetBudgetByIDParams{
		ID:          budgetID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return BudgetDetail{}, ErrNotFound
	} else if err != nil {
		return BudgetDetail{}, err
	}
	return BudgetDetail{Budget: b}, nil
}

func (s *Service) ListBudgets(ctx context.Context, workspaceID int64, filter ListBudgetsFilter) ([]db.Budget, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var scopeParam pgtype.Text
	if filter.Scope != "" {
		scopeParam = pgtype.Text{String: filter.Scope, Valid: true}
	}

	var activeParam pgtype.Bool
	if filter.IsActive != nil {
		activeParam = pgtype.Bool{Bool: *filter.IsActive, Valid: true}
	}

	var fromDateParam pgtype.Date
	if filter.FromDate != "" {
		if t, err := time.Parse("2006-01-02", filter.FromDate); err == nil {
			fromDateParam = pgtype.Date{Time: t, Valid: true}
		}
	}

	var toDateParam pgtype.Date
	if filter.ToDate != "" {
		if t, err := time.Parse("2006-01-02", filter.ToDate); err == nil {
			toDateParam = pgtype.Date{Time: t, Valid: true}
		}
	}

	return s.queries.ListBudgets(ctx, db.ListBudgetsParams{
		WorkspaceID: workspaceID,
		Limit:       limit,
		Scope:       scopeParam,
		IsActive:    activeParam,
		FromDate:    fromDateParam,
		ToDate:      toDateParam,
	})
}

func (s *Service) UpdateBudget(ctx context.Context, workspaceID, userID, budgetID int64, in UpdateBudgetInput) (BudgetDetail, error) {
	orig, err := s.queries.GetBudgetByID(ctx, db.GetBudgetByIDParams{
		ID:          budgetID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return BudgetDetail{}, ErrNotFound
	} else if err != nil {
		return BudgetDetail{}, err
	}

	name := orig.Name
	if in.Name != "" {
		name = in.Name
	}

	amountMinor := orig.AmountMinor
	if in.AmountMinor > 0 {
		amountMinor = in.AmountMinor
	}

	startDate := orig.StartDate
	if in.StartDate != "" {
		t, err := time.Parse("2006-01-02", in.StartDate)
		if err != nil {
			return BudgetDetail{}, fmt.Errorf("invalid start_date format: %w", err)
		}
		startDate = pgtype.Date{Time: t, Valid: true}
	}

	endDate := orig.EndDate
	if in.EndDate != "" {
		t, err := time.Parse("2006-01-02", in.EndDate)
		if err != nil {
			return BudgetDetail{}, fmt.Errorf("invalid end_date format: %w", err)
		}
		endDate = pgtype.Date{Time: t, Valid: true}
	}

	if endDate.Time.Before(startDate.Time) {
		return BudgetDetail{}, ErrInvalidBudgetDates
	}

	notes := orig.Notes
	if in.Notes != "" {
		notes = pgtype.Text{String: in.Notes, Valid: true}
	}

	isActive := orig.IsActive
	if in.IsActive != nil {
		isActive = *in.IsActive
	}

	updated, err := s.queries.UpdateBudget(ctx, db.UpdateBudgetParams{
		ID:          budgetID,
		WorkspaceID: workspaceID,
		Name:        name,
		AmountMinor: amountMinor,
		StartDate:   startDate,
		EndDate:     endDate,
		Notes:       notes,
		IsActive:    isActive,
	})
	if err != nil {
		return BudgetDetail{}, fmt.Errorf("update budget: %w", err)
	}

	return BudgetDetail{Budget: updated}, nil
}

func (s *Service) DeleteBudget(ctx context.Context, workspaceID, budgetID int64) error {
	_, err := s.queries.GetBudgetByID(ctx, db.GetBudgetByIDParams{
		ID:          budgetID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}

	return s.queries.DeleteBudget(ctx, db.DeleteBudgetParams{
		ID:          budgetID,
		WorkspaceID: workspaceID,
	})
}

func (s *Service) GetBudgetStatus(ctx context.Context, workspaceID, budgetID int64) (BudgetStatusResult, error) {
	budget, err := s.queries.GetBudgetByID(ctx, db.GetBudgetByIDParams{
		ID:          budgetID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return BudgetStatusResult{}, ErrNotFound
	} else if err != nil {
		return BudgetStatusResult{}, err
	}

	actualMinor, err := s.queries.CalculateBudgetActualSpending(ctx, db.CalculateBudgetActualSpendingParams{
		WorkspaceID: workspaceID,
		FromDate:    budget.StartDate,
		ToDate:      budget.EndDate,
		CategoryID:  budget.CategoryID,
	})
	if err != nil {
		return BudgetStatusResult{}, fmt.Errorf("calculate budget spending: %w", err)
	}

	remainingMinor := budget.AmountMinor - actualMinor
	var usageBasisPoints int64
	if budget.AmountMinor > 0 {
		usageBasisPoints = (actualMinor * 10000) / budget.AmountMinor
	}

	// Format basis points into exact XX.XX% string with pure integer division
	wholePercent := usageBasisPoints / 100
	remainderPercent := usageBasisPoints % 100
	if remainderPercent < 0 {
		remainderPercent = -remainderPercent
	}
	formattedUsage := fmt.Sprintf("%d.%02d%%", wholePercent, remainderPercent)

	return BudgetStatusResult{
		Budget:                   budget,
		BudgetAmountMinor:        budget.AmountMinor,
		ActualSpendingMinor:      actualMinor,
		RemainingMinor:           remainingMinor,
		UsageBasisPoints:         usageBasisPoints,
		UsagePercentageFormatted: formattedUsage,
		IsOverBudget:             actualMinor > budget.AmountMinor,
	}, nil
}

// ---------------- Tax-Readiness Aggregates ----------------

type TaxReadinessReport struct {
	WorkspaceID int64  `json:"workspace_id"`
	FromDate    string `json:"from_date"`
	ToDate      string `json:"to_date"`
	Scope       string `json:"scope"`
	Currency    string `json:"currency"`

	// Output VAT (Sales & Finalized Invoices)
	OutputVAT OutputVATSummary `json:"output_vat"`

	// Input VAT (Confirmed Purchases)
	InputVAT InputVATSummary `json:"input_vat"`

	// Net VAT
	NetVAT NetVATSummary `json:"net_vat"`

	// Workspace Tax Settings
	TaxSettings TaxSettingsSummary `json:"tax_settings"`
}

type OutputVATSummary struct {
	TaxableSalesMinor int64 `json:"taxable_sales_minor"`
	OutputVatMinor    int64 `json:"output_vat_minor"`
	TotalGrossMinor   int64 `json:"total_gross_minor"`
	InvoicesCount     int64 `json:"invoices_count"`
	SalesCount        int64 `json:"sales_count"`
	TotalCount        int64 `json:"total_count"`
}

type InputVATSummary struct {
	TaxablePurchasesMinor int64 `json:"taxable_purchases_minor"`
	InputVatMinor         int64 `json:"input_vat_minor"`
	TotalGrossMinor       int64 `json:"total_gross_minor"`
	PurchasesCount        int64 `json:"purchases_count"`
}

type NetVATSummary struct {
	NetVatPayableMinor int64  `json:"net_vat_payable_minor"`
	Status             string `json:"status"` // "payable", "refundable", "balanced"
}

type TaxSettingsSummary struct {
	TaxIdentificationNumber   string `json:"tax_identification_number"`
	DefaultVatRateBasisPoints int32  `json:"default_vat_rate_basis_points"`
	IsVatRegistered           bool   `json:"is_vat_registered"`
}

type UpdateTaxSettingsInput struct {
	TaxIdentificationNumber   string `json:"tax_identification_number"`
	DefaultVatRateBasisPoints *int32 `json:"default_vat_rate_basis_points"`
	IsVatRegistered           *bool  `json:"is_vat_registered"`
}

func (s *Service) GetTaxReadinessReport(ctx context.Context, workspaceID int64, fromDateStr, toDateStr, scope string) (TaxReadinessReport, error) {
	fromTime, err := time.Parse("2006-01-02", fromDateStr)
	if err != nil {
		return TaxReadinessReport{}, fmt.Errorf("invalid from_date, expected YYYY-MM-DD: %w", err)
	}

	toTime, err := time.Parse("2006-01-02", toDateStr)
	if err != nil {
		return TaxReadinessReport{}, fmt.Errorf("invalid to_date, expected YYYY-MM-DD: %w", err)
	}

	if toTime.Before(fromTime) {
		return TaxReadinessReport{}, errors.New("to_date must be on or after from_date")
	}

	if scope == "" {
		scope = "business"
	}

	fromDate := pgtype.Date{Time: fromTime, Valid: true}
	toDate := pgtype.Date{Time: toTime, Valid: true}

	// 1. Output VAT from Finalized Invoices
	invOut, err := s.queries.CalculateOutputVatInvoices(ctx, db.CalculateOutputVatInvoicesParams{
		WorkspaceID: workspaceID,
		FromDate:    fromDate,
		ToDate:      toDate,
	})
	if err != nil {
		return TaxReadinessReport{}, fmt.Errorf("calculate output vat invoices: %w", err)
	}

	// 2. Output VAT from Confirmed Sales
	saleOut, err := s.queries.CalculateOutputVatSales(ctx, db.CalculateOutputVatSalesParams{
		WorkspaceID: workspaceID,
		FromDate:    fromDate,
		ToDate:      toDate,
	})
	if err != nil {
		return TaxReadinessReport{}, fmt.Errorf("calculate output vat sales: %w", err)
	}

	// 3. Input VAT from Confirmed Purchases
	purchIn, err := s.queries.CalculateInputVatPurchases(ctx, db.CalculateInputVatPurchasesParams{
		WorkspaceID: workspaceID,
		FromDate:    fromDate,
		ToDate:      toDate,
	})
	if err != nil {
		return TaxReadinessReport{}, fmt.Errorf("calculate input vat purchases: %w", err)
	}

	// Combined Output VAT
	totalTaxableSalesMinor := invOut.TaxableSubtotalMinor + saleOut.TaxableSubtotalMinor
	totalOutputVatMinor := invOut.OutputVatMinor + saleOut.OutputVatMinor
	totalGrossSalesMinor := invOut.TotalSalesMinor + saleOut.TotalSalesMinor

	// Net VAT: Output VAT minus Input VAT
	netVatPayableMinor := totalOutputVatMinor - purchIn.InputVatMinor
	var netStatus string
	if netVatPayableMinor > 0 {
		netStatus = "payable"
	} else if netVatPayableMinor < 0 {
		netStatus = "refundable"
	} else {
		netStatus = "balanced"
	}

	// Tax Settings
	taxSettings, err := s.queries.GetWorkspaceTaxSettings(ctx, workspaceID)
	settingsSummary := TaxSettingsSummary{
		DefaultVatRateBasisPoints: 750, // Nigerian 7.5% default
		IsVatRegistered:           false,
	}
	if err == nil {
		if taxSettings.TaxIdentificationNumber.Valid {
			settingsSummary.TaxIdentificationNumber = taxSettings.TaxIdentificationNumber.String
		}
		settingsSummary.DefaultVatRateBasisPoints = taxSettings.DefaultVatRateBasisPoints
		settingsSummary.IsVatRegistered = taxSettings.IsVatRegistered
	}

	return TaxReadinessReport{
		WorkspaceID: workspaceID,
		FromDate:    fromDateStr,
		ToDate:      toDateStr,
		Scope:       scope,
		Currency:    "NGN",
		OutputVAT: OutputVATSummary{
			TaxableSalesMinor: totalTaxableSalesMinor,
			OutputVatMinor:    totalOutputVatMinor,
			TotalGrossMinor:   totalGrossSalesMinor,
			InvoicesCount:     invOut.Count,
			SalesCount:        saleOut.Count,
			TotalCount:        invOut.Count + saleOut.Count,
		},
		InputVAT: InputVATSummary{
			TaxablePurchasesMinor: purchIn.TaxableSubtotalMinor,
			InputVatMinor:         purchIn.InputVatMinor,
			TotalGrossMinor:       purchIn.TotalPurchasesMinor,
			PurchasesCount:        purchIn.Count,
		},
		NetVAT: NetVATSummary{
			NetVatPayableMinor: netVatPayableMinor,
			Status:             netStatus,
		},
		TaxSettings: settingsSummary,
	}, nil
}

func (s *Service) GetTaxSettings(ctx context.Context, workspaceID int64) (TaxSettingsSummary, error) {
	ts, err := s.queries.GetWorkspaceTaxSettings(ctx, workspaceID)
	if errors.Is(err, pgx.ErrNoRows) {
		return TaxSettingsSummary{
			DefaultVatRateBasisPoints: 750,
			IsVatRegistered:           false,
		}, nil
	} else if err != nil {
		return TaxSettingsSummary{}, err
	}

	var tin string
	if ts.TaxIdentificationNumber.Valid {
		tin = ts.TaxIdentificationNumber.String
	}
	return TaxSettingsSummary{
		TaxIdentificationNumber:   tin,
		DefaultVatRateBasisPoints: ts.DefaultVatRateBasisPoints,
		IsVatRegistered:           ts.IsVatRegistered,
	}, nil
}

func (s *Service) UpdateTaxSettings(ctx context.Context, workspaceID int64, in UpdateTaxSettingsInput) (TaxSettingsSummary, error) {
	existing, _ := s.GetTaxSettings(ctx, workspaceID)

	tin := existing.TaxIdentificationNumber
	if in.TaxIdentificationNumber != "" {
		tin = in.TaxIdentificationNumber
	}

	vatBasisPoints := existing.DefaultVatRateBasisPoints
	if in.DefaultVatRateBasisPoints != nil && *in.DefaultVatRateBasisPoints >= 0 {
		vatBasisPoints = *in.DefaultVatRateBasisPoints
	}

	isRegistered := existing.IsVatRegistered
	if in.IsVatRegistered != nil {
		isRegistered = *in.IsVatRegistered
	}

	var tinParam pgtype.Text
	if tin != "" {
		tinParam = pgtype.Text{String: tin, Valid: true}
	}

	saved, err := s.queries.UpsertWorkspaceTaxSettings(ctx, db.UpsertWorkspaceTaxSettingsParams{
		WorkspaceID:               workspaceID,
		TaxIdentificationNumber:   tinParam,
		DefaultVatRateBasisPoints: vatBasisPoints,
		IsVatRegistered:           isRegistered,
	})
	if err != nil {
		return TaxSettingsSummary{}, fmt.Errorf("upsert tax settings: %w", err)
	}

	var resTin string
	if saved.TaxIdentificationNumber.Valid {
		resTin = saved.TaxIdentificationNumber.String
	}

	return TaxSettingsSummary{
		TaxIdentificationNumber:   resTin,
		DefaultVatRateBasisPoints: saved.DefaultVatRateBasisPoints,
		IsVatRegistered:           saved.IsVatRegistered,
	}, nil
}
