package finance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type BudgetLineInput struct {
	CategoryID  *int64 `json:"category_id"`
	LimitMinor  int64  `json:"limit_minor"`
	LimitAmount string `json:"limit_amount"`
	Notes       string `json:"notes"`
}

type CreatePersonalBudgetInput struct {
	Name               string            `json:"name" binding:"required"`
	CategoryID         *int64            `json:"category_id"`
	Period             string            `json:"period"` // monthly, quarterly, annual, custom
	AmountMinor        int64             `json:"amount_minor"`
	Amount             string            `json:"amount"`
	IncomeGoalMinor    int64             `json:"income_goal_minor"`
	IncomeGoal         string            `json:"income_goal"`
	Currency           string            `json:"currency"`
	StartDate          string            `json:"start_date" binding:"required"`
	EndDate            string            `json:"end_date" binding:"required"`
	AlertThresholds    []int             `json:"alert_thresholds"`
	Status             string            `json:"status"` // draft, active
	Timezone           string            `json:"timezone"`
	Notes              string            `json:"notes"`
	Lines              []BudgetLineInput `json:"lines"`
	CopiedFromBudgetID *int64            `json:"copied_from_budget_id"`
	IdempotencyKey     string            `json:"idempotency_key"`
}

type UpdatePersonalBudgetInput struct {
	Name            string            `json:"name"`
	AmountMinor     int64             `json:"amount_minor"`
	Amount          string            `json:"amount"`
	IncomeGoalMinor *int64            `json:"income_goal_minor"`
	IncomeGoal      string            `json:"income_goal"`
	StartDate       string            `json:"start_date"`
	EndDate         string            `json:"end_date"`
	Status          string            `json:"status"` // draft, active, completed, archived
	AlertThresholds []int             `json:"alert_thresholds"`
	Notes           string            `json:"notes"`
	ChangeReason    string            `json:"change_reason"`
	Lines           []BudgetLineInput `json:"lines"`
}

type CopyBudgetInput struct {
	Name           string `json:"name"`
	StartDate      string `json:"start_date" binding:"required"`
	EndDate        string `json:"end_date" binding:"required"`
	Status         string `json:"status"` // default draft
	IdempotencyKey string `json:"idempotency_key"`
}

type BudgetLineStatus struct {
	Line                     db.ListBudgetLinesRow `json:"line"`
	ActualSpendingMinor      int64                 `json:"actual_spending_minor"`
	RemainingMinor           int64                 `json:"remaining_minor"`
	UsageBasisPoints         int64                 `json:"usage_basis_points"`
	UsagePercentageFormatted string                `json:"usage_percentage_formatted"`
}

type PersonalBudgetDetail struct {
	Budget                   db.Budget             `json:"budget"`
	BudgetAmountMinor        int64                 `json:"budget_amount_minor"`
	ActualSpendingMinor      int64                 `json:"actual_spending_minor"`
	RemainingMinor           int64                 `json:"remaining_minor"`
	UsageBasisPoints         int64                 `json:"usage_basis_points"`
	UsagePercentageFormatted string                `json:"usage_percentage_formatted"`
	IsOverBudget             bool                  `json:"is_over_budget"`
	Lines                    []BudgetLineStatus    `json:"lines"`
	Alerts                   []db.BudgetAlertEvent `json:"alerts"`
	Versions                 []db.BudgetVersion    `json:"versions"`
}

func normalizeThresholds(raw []int) ([]int, []byte) {
	if len(raw) == 0 {
		raw = []int{50, 80, 100}
	}
	seen := map[int]bool{}
	var out []int
	for _, t := range raw {
		if t > 0 && t <= 500 && !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	if len(out) == 0 {
		out = []int{50, 80, 100}
	}
	b, _ := json.Marshal(out)
	return out, b
}

func parseThresholdsJSON(raw []byte) []int {
	var out []int
	if err := json.Unmarshal(raw, &out); err != nil || len(out) == 0 {
		return []int{50, 80, 100}
	}
	return out
}

func (s *Service) CreatePersonalBudget(ctx context.Context, workspaceID, userID int64, idempKey string, in CreatePersonalBudgetInput) (PersonalBudgetDetail, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := int32(CurrencyExponent(currency))

	amountMinor, err := resolveAmountMinor(in.Amount, in.AmountMinor, currency)
	if err != nil {
		return PersonalBudgetDetail{}, err
	}
	if amountMinor <= 0 {
		return PersonalBudgetDetail{}, ErrInvalidBudgetAmount
	}

	incomeGoalMinor, err := resolveAmountMinor(in.IncomeGoal, in.IncomeGoalMinor, currency)
	if err != nil {
		return PersonalBudgetDetail{}, err
	}
	if incomeGoalMinor < 0 {
		return PersonalBudgetDetail{}, errors.New("income goal cannot be negative")
	}

	startDate, err := parseDateStrict(in.StartDate)
	if err != nil {
		return PersonalBudgetDetail{}, err
	}
	endDate, err := parseDateStrict(in.EndDate)
	if err != nil {
		return PersonalBudgetDetail{}, err
	}
	if endDate.Before(startDate) {
		return PersonalBudgetDetail{}, ErrInvalidBudgetDates
	}

	period := strings.TrimSpace(in.Period)
	if period == "" {
		period = "monthly"
	}
	if period != "monthly" && period != "quarterly" && period != "annual" && period != "custom" {
		return PersonalBudgetDetail{}, fmt.Errorf("invalid period: %s", period)
	}

	status := strings.TrimSpace(in.Status)
	if status == "" {
		status = "active"
	}
	if status != "draft" && status != "active" {
		return PersonalBudgetDetail{}, errors.New("initial budget status must be draft or active")
	}

	timezone := strings.TrimSpace(in.Timezone)
	if timezone == "" {
		timezone = "Africa/Lagos"
	}

	_, thresholdsJSON := normalizeThresholds(in.AlertThresholds)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PersonalBudgetDetail{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if idempKey != "" {
		existing, err := qtx.GetBudgetByIdempotency(ctx, db.GetBudgetByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			tx.Rollback(ctx)
			return s.GetPersonalBudgetDetail(ctx, workspaceID, existing.ID)
		}
		if !isNoRows(err) {
			return PersonalBudgetDetail{}, err
		}
	}

	if in.CategoryID != nil && *in.CategoryID > 0 {
		if _, err := qtx.GetCategoryByID(ctx, db.GetCategoryByIDParams{ID: *in.CategoryID, WorkspaceID: workspaceID}); isNoRows(err) {
			return PersonalBudgetDetail{}, ErrForbiddenCategory
		} else if err != nil {
			return PersonalBudgetDetail{}, err
		}
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	budget, err := qtx.CreatePersonalBudget(ctx, db.CreatePersonalBudgetParams{
		WorkspaceID:        workspaceID,
		Name:               strings.TrimSpace(in.Name),
		CategoryID:         pgInt8Ptr(in.CategoryID),
		Scope:              "personal",
		Period:             period,
		AmountMinor:        amountMinor,
		IncomeGoalMinor:    incomeGoalMinor,
		Currency:           currency,
		CurrencyExponent:   exponent,
		StartDate:          pgtype.Date{Time: startDate, Valid: true},
		EndDate:            pgtype.Date{Time: endDate, Valid: true},
		IsActive:           status == "active",
		Status:             status,
		AlertThresholds:    thresholdsJSON,
		CopiedFromBudgetID: pgInt8Ptr(in.CopiedFromBudgetID),
		Timezone:           timezone,
		Notes:              optionalPgText(in.Notes),
		IdempotencyKey:     idempParam,
		CreatedByUserID:    pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return PersonalBudgetDetail{}, fmt.Errorf("create personal budget: %w", err)
	}

	for _, line := range in.Lines {
		limitMinor, err := resolveAmountMinor(line.LimitAmount, line.LimitMinor, currency)
		if err != nil {
			return PersonalBudgetDetail{}, err
		}
		if limitMinor <= 0 {
			return PersonalBudgetDetail{}, ErrInvalidBudgetAmount
		}
		if line.CategoryID != nil && *line.CategoryID > 0 {
			if _, err := qtx.GetCategoryByID(ctx, db.GetCategoryByIDParams{ID: *line.CategoryID, WorkspaceID: workspaceID}); isNoRows(err) {
				return PersonalBudgetDetail{}, ErrForbiddenCategory
			} else if err != nil {
				return PersonalBudgetDetail{}, err
			}
		}
		if _, err := qtx.CreateBudgetLine(ctx, db.CreateBudgetLineParams{
			WorkspaceID: workspaceID,
			BudgetID:    budget.ID,
			CategoryID:  pgInt8Ptr(line.CategoryID),
			LimitMinor:  limitMinor,
			Notes:       optionalPgText(line.Notes),
		}); err != nil {
			return PersonalBudgetDetail{}, fmt.Errorf("create budget line: %w", err)
		}
	}

	snap, _ := json.Marshal(map[string]any{
		"name":              budget.Name,
		"amount_minor":      budget.AmountMinor,
		"income_goal_minor": budget.IncomeGoalMinor,
		"start_date":        budget.StartDate.Time.Format("2006-01-02"),
		"end_date":          budget.EndDate.Time.Format("2006-01-02"),
		"status":            budget.Status,
	})
	if _, err := qtx.CreateBudgetVersion(ctx, db.CreateBudgetVersionParams{
		WorkspaceID:     workspaceID,
		BudgetID:        budget.ID,
		VersionNumber:   1,
		Snapshot:        snap,
		ChangedByUserID: pgtype.Int8{Int64: userID, Valid: true},
		ChangeReason:    pgtype.Text{String: "Initial budget plan", Valid: true},
	}); err != nil {
		return PersonalBudgetDetail{}, fmt.Errorf("create budget version: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return PersonalBudgetDetail{}, fmt.Errorf("commit personal budget: %w", err)
	}

	return s.GetPersonalBudgetDetail(ctx, workspaceID, budget.ID)
}

func (s *Service) UpdatePersonalBudget(ctx context.Context, workspaceID, userID, budgetID int64, in UpdatePersonalBudgetInput) (PersonalBudgetDetail, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PersonalBudgetDetail{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	orig, err := qtx.GetBudgetByID(ctx, db.GetBudgetByIDParams{
		ID:          budgetID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return PersonalBudgetDetail{}, ErrNotFound
	}
	if err != nil {
		return PersonalBudgetDetail{}, err
	}

	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = orig.Name
	}

	amountMinor := orig.AmountMinor
	if in.Amount != "" || in.AmountMinor > 0 {
		parsed, err := resolveAmountMinor(in.Amount, in.AmountMinor, orig.Currency)
		if err != nil {
			return PersonalBudgetDetail{}, err
		}
		if parsed <= 0 {
			return PersonalBudgetDetail{}, ErrInvalidBudgetAmount
		}
		amountMinor = parsed
	}

	incomeGoalMinor := orig.IncomeGoalMinor
	if in.IncomeGoal != "" {
		parsed, err := resolveAmountMinor(in.IncomeGoal, 0, orig.Currency)
		if err != nil {
			return PersonalBudgetDetail{}, err
		}
		incomeGoalMinor = parsed
	} else if in.IncomeGoalMinor != nil {
		if *in.IncomeGoalMinor < 0 {
			return PersonalBudgetDetail{}, errors.New("income goal cannot be negative")
		}
		incomeGoalMinor = *in.IncomeGoalMinor
	}

	startDate := orig.StartDate
	if in.StartDate != "" {
		t, err := parseDateStrict(in.StartDate)
		if err != nil {
			return PersonalBudgetDetail{}, err
		}
		startDate = pgtype.Date{Time: t, Valid: true}
	}
	endDate := orig.EndDate
	if in.EndDate != "" {
		t, err := parseDateStrict(in.EndDate)
		if err != nil {
			return PersonalBudgetDetail{}, err
		}
		endDate = pgtype.Date{Time: t, Valid: true}
	}
	if endDate.Time.Before(startDate.Time) {
		return PersonalBudgetDetail{}, ErrInvalidBudgetDates
	}

	status := orig.Status
	if in.Status != "" {
		switch in.Status {
		case "draft", "active", "completed", "archived":
			status = in.Status
		default:
			return PersonalBudgetDetail{}, errors.New("invalid budget status")
		}
	}

	thresholdsJSON := orig.AlertThresholds
	if len(in.AlertThresholds) > 0 {
		_, thresholdsJSON = normalizeThresholds(in.AlertThresholds)
	}

	notes := orig.Notes
	if in.Notes != "" {
		notes = pgtype.Text{String: in.Notes, Valid: true}
	}

	updated, err := qtx.UpdatePersonalBudgetPlan(ctx, db.UpdatePersonalBudgetPlanParams{
		ID:              budgetID,
		WorkspaceID:     workspaceID,
		Name:            name,
		AmountMinor:     amountMinor,
		IncomeGoalMinor: incomeGoalMinor,
		StartDate:       startDate,
		EndDate:         endDate,
		Status:          status,
		AlertThresholds: thresholdsJSON,
		Notes:           notes,
	})
	if err != nil {
		return PersonalBudgetDetail{}, fmt.Errorf("update personal budget: %w", err)
	}

	if in.Lines != nil {
		if err := qtx.DeleteBudgetLinesByBudget(ctx, db.DeleteBudgetLinesByBudgetParams{
			WorkspaceID: workspaceID,
			BudgetID:    budgetID,
		}); err != nil {
			return PersonalBudgetDetail{}, err
		}
		for _, line := range in.Lines {
			limitMinor, err := resolveAmountMinor(line.LimitAmount, line.LimitMinor, orig.Currency)
			if err != nil {
				return PersonalBudgetDetail{}, err
			}
			if limitMinor <= 0 {
				return PersonalBudgetDetail{}, ErrInvalidBudgetAmount
			}
			if line.CategoryID != nil && *line.CategoryID > 0 {
				if _, err := qtx.GetCategoryByID(ctx, db.GetCategoryByIDParams{ID: *line.CategoryID, WorkspaceID: workspaceID}); isNoRows(err) {
					return PersonalBudgetDetail{}, ErrForbiddenCategory
				} else if err != nil {
					return PersonalBudgetDetail{}, err
				}
			}
			if _, err := qtx.CreateBudgetLine(ctx, db.CreateBudgetLineParams{
				WorkspaceID: workspaceID,
				BudgetID:    budgetID,
				CategoryID:  pgInt8Ptr(line.CategoryID),
				LimitMinor:  limitMinor,
				Notes:       optionalPgText(line.Notes),
			}); err != nil {
				return PersonalBudgetDetail{}, err
			}
		}
	}

	snap, _ := json.Marshal(map[string]any{
		"name":              updated.Name,
		"amount_minor":      updated.AmountMinor,
		"income_goal_minor": updated.IncomeGoalMinor,
		"start_date":        updated.StartDate.Time.Format("2006-01-02"),
		"end_date":          updated.EndDate.Time.Format("2006-01-02"),
		"status":            updated.Status,
	})
	reason := strings.TrimSpace(in.ChangeReason)
	if reason == "" {
		reason = "Updated budget plan"
	}
	if _, err := qtx.CreateBudgetVersion(ctx, db.CreateBudgetVersionParams{
		WorkspaceID:     workspaceID,
		BudgetID:        budgetID,
		VersionNumber:   updated.Version,
		Snapshot:        snap,
		ChangedByUserID: pgtype.Int8{Int64: userID, Valid: true},
		ChangeReason:    pgtype.Text{String: reason, Valid: true},
	}); err != nil {
		return PersonalBudgetDetail{}, fmt.Errorf("create budget version: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return PersonalBudgetDetail{}, fmt.Errorf("commit personal budget update: %w", err)
	}

	return s.GetPersonalBudgetDetail(ctx, workspaceID, budgetID)
}

func (s *Service) CopyPersonalBudget(ctx context.Context, workspaceID, userID, sourceBudgetID int64, idempKey string, in CopyBudgetInput) (PersonalBudgetDetail, error) {
	orig, err := s.queries.GetBudgetByID(ctx, db.GetBudgetByIDParams{
		ID:          sourceBudgetID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return PersonalBudgetDetail{}, ErrNotFound
	}
	if err != nil {
		return PersonalBudgetDetail{}, err
	}

	lines, err := s.queries.ListBudgetLines(ctx, db.ListBudgetLinesParams{
		WorkspaceID: workspaceID,
		BudgetID:    sourceBudgetID,
	})
	if err != nil {
		return PersonalBudgetDetail{}, err
	}

	lineInputs := make([]BudgetLineInput, 0, len(lines))
	for _, l := range lines {
		var catID *int64
		if l.CategoryID.Valid {
			v := l.CategoryID.Int64
			catID = &v
		}
		lineInputs = append(lineInputs, BudgetLineInput{
			CategoryID: catID,
			LimitMinor: l.LimitMinor,
			Notes:      l.Notes.String,
		})
	}

	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = orig.Name + " (Copy)"
	}
	status := strings.TrimSpace(in.Status)
	if status == "" {
		status = "draft"
	}

	var catID *int64
	if orig.CategoryID.Valid {
		v := orig.CategoryID.Int64
		catID = &v
	}

	return s.CreatePersonalBudget(ctx, workspaceID, userID, idempKey, CreatePersonalBudgetInput{
		Name:               name,
		CategoryID:         catID,
		Period:             orig.Period,
		AmountMinor:        orig.AmountMinor,
		IncomeGoalMinor:    orig.IncomeGoalMinor,
		Currency:           orig.Currency,
		StartDate:          in.StartDate,
		EndDate:            in.EndDate,
		AlertThresholds:    parseThresholdsJSON(orig.AlertThresholds),
		Status:             status,
		Timezone:           orig.Timezone,
		Notes:              orig.Notes.String,
		Lines:              lineInputs,
		CopiedFromBudgetID: &orig.ID,
		IdempotencyKey:     in.IdempotencyKey,
	})
}

func (s *Service) GetPersonalBudgetDetail(ctx context.Context, workspaceID, budgetID int64) (PersonalBudgetDetail, error) {
	b, err := s.queries.GetBudgetByID(ctx, db.GetBudgetByIDParams{
		ID:          budgetID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return PersonalBudgetDetail{}, ErrNotFound
	}
	if err != nil {
		return PersonalBudgetDetail{}, err
	}

	actual, err := s.queries.CalculatePersonalBudgetActual(ctx, db.CalculatePersonalBudgetActualParams{
		WorkspaceID: workspaceID,
		CategoryID:  b.CategoryID,
		FromDate:    b.StartDate,
		ToDate:      b.EndDate,
	})
	if err != nil {
		return PersonalBudgetDetail{}, fmt.Errorf("calculate personal budget actual: %w", err)
	}

	remaining := b.AmountMinor - actual
	var bps int64
	if b.AmountMinor > 0 {
		bps = (actual * 10000) / b.AmountMinor
	}

	lines, err := s.queries.ListBudgetLines(ctx, db.ListBudgetLinesParams{
		WorkspaceID: workspaceID,
		BudgetID:    budgetID,
	})
	if err != nil {
		return PersonalBudgetDetail{}, err
	}

	lineStatuses := make([]BudgetLineStatus, 0, len(lines))
	for _, l := range lines {
		lActual, err := s.queries.CalculatePersonalBudgetActual(ctx, db.CalculatePersonalBudgetActualParams{
			WorkspaceID: workspaceID,
			CategoryID:  l.CategoryID,
			FromDate:    b.StartDate,
			ToDate:      b.EndDate,
		})
		if err != nil {
			return PersonalBudgetDetail{}, err
		}
		var lBps int64
		if l.LimitMinor > 0 {
			lBps = (lActual * 10000) / l.LimitMinor
		}
		lineStatuses = append(lineStatuses, BudgetLineStatus{
			Line:                     l,
			ActualSpendingMinor:      lActual,
			RemainingMinor:           l.LimitMinor - lActual,
			UsageBasisPoints:         lBps,
			UsagePercentageFormatted: fmt.Sprintf("%.2f%%", float64(lBps)/100.0),
		})
	}

	alerts, err := s.queries.ListBudgetAlertEvents(ctx, db.ListBudgetAlertEventsParams{
		WorkspaceID: workspaceID,
		BudgetID:    pgtype.Int8{Int64: budgetID, Valid: true},
		Limit:       25,
	})
	if err != nil {
		return PersonalBudgetDetail{}, err
	}

	versions, err := s.queries.ListBudgetVersions(ctx, db.ListBudgetVersionsParams{
		WorkspaceID: workspaceID,
		BudgetID:    budgetID,
	})
	if err != nil {
		return PersonalBudgetDetail{}, err
	}

	return PersonalBudgetDetail{
		Budget:                   b,
		BudgetAmountMinor:        b.AmountMinor,
		ActualSpendingMinor:      actual,
		RemainingMinor:           remaining,
		UsageBasisPoints:         bps,
		UsagePercentageFormatted: fmt.Sprintf("%.2f%%", float64(bps)/100.0),
		IsOverBudget:             actual > b.AmountMinor,
		Lines:                    lineStatuses,
		Alerts:                   alerts,
		Versions:                 versions,
	}, nil
}

func (s *Service) ListPersonalBudgetsWithStatus(ctx context.Context, workspaceID int64, statusFilter string) ([]PersonalBudgetDetail, error) {
	budgets, err := s.ListBudgets(ctx, workspaceID, ListBudgetsFilter{Scope: "personal", Limit: 50})
	if err != nil {
		return nil, err
	}
	out := make([]PersonalBudgetDetail, 0, len(budgets))
	for _, b := range budgets {
		if statusFilter != "" && b.Status != statusFilter {
			continue
		}
		detail, err := s.GetPersonalBudgetDetail(ctx, workspaceID, b.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, detail)
	}
	return out, nil
}

// EvaluatePersonalBudgetAlerts checks active Personal budgets and inserts deduplicated threshold alerts.
func (s *Service) EvaluatePersonalBudgetAlerts(ctx context.Context, workspaceID, budgetID int64) ([]db.BudgetAlertEvent, error) {
	detail, err := s.GetPersonalBudgetDetail(ctx, workspaceID, budgetID)
	if err != nil {
		return nil, err
	}
	if detail.Budget.Status != "active" || detail.BudgetAmountMinor <= 0 {
		return detail.Alerts, nil
	}

	thresholds := parseThresholdsJSON(detail.Budget.AlertThresholds)
	for _, th := range thresholds {
		if detail.UsageBasisPoints >= int64(th)*100 {
			msg := fmt.Sprintf("Budget \"%s\" reached %d%% of its %s limit (currently %s).",
				detail.Budget.Name, th, detail.Budget.Currency, detail.UsagePercentageFormatted)
			_, _ = s.queries.InsertBudgetAlertEvent(ctx, db.InsertBudgetAlertEventParams{
				WorkspaceID:      workspaceID,
				BudgetID:         budgetID,
				ThresholdPercent: int32(th),
				ActualMinor:      detail.ActualSpendingMinor,
				LimitMinor:       detail.BudgetAmountMinor,
				UsageBasisPoints: detail.UsageBasisPoints,
				Message:          msg,
			})
		}
	}

	return s.queries.ListBudgetAlertEvents(ctx, db.ListBudgetAlertEventsParams{
		WorkspaceID: workspaceID,
		BudgetID:    pgtype.Int8{Int64: budgetID, Valid: true},
		Limit:       25,
	})
}

// evaluateActivePersonalBudgetsOnDate is a non-fatal helper called after Personal expense postings.
func (s *Service) evaluateActivePersonalBudgetsOnDate(ctx context.Context, workspaceID int64, effectiveDate time.Time) {
	budgets, err := s.ListBudgets(ctx, workspaceID, ListBudgetsFilter{Scope: "personal", Limit: 50})
	if err != nil {
		return
	}
	for _, b := range budgets {
		if b.Status != "active" {
			continue
		}
		if !effectiveDate.Before(b.StartDate.Time) && !effectiveDate.After(b.EndDate.Time) {
			_, _ = s.EvaluatePersonalBudgetAlerts(ctx, workspaceID, b.ID)
		}
	}
}
