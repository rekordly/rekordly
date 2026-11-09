package finance

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

const maxSummaryWindow = 366 * 2 * 24 * time.Hour

// MonthlyFinance is one month of ledger income and expense. Money is a JSON string.
type MonthlyFinance struct {
	Month        string `json:"month"`
	IncomeMinor  int64  `json:"income_minor,string"`
	ExpenseMinor int64  `json:"expense_minor,string"`
}

// CategorySpending is the total spent in one category.
type CategorySpending struct {
	Category   string `json:"category"`
	TotalMinor int64  `json:"total_minor,string"`
}

// FinanceSummary holds dashboard totals, all computed on the server.
type FinanceSummary struct {
	FromDate           string             `json:"from_date"`
	ToDate             string             `json:"to_date"`
	Currency           string             `json:"currency"`
	CurrencyExponent   int                `json:"currency_exponent"`
	IncomeMinor        int64              `json:"income_minor,string"`
	ExpenseMinor       int64              `json:"expense_minor,string"`
	NetMinor           int64              `json:"net_minor,string"`
	CashBalanceMinor   int64              `json:"cash_balance_minor,string"`
	Monthly            []MonthlyFinance   `json:"monthly"`
	SpendingByCategory []CategorySpending `json:"spending_by_category"`
}

func resolveSummaryWindow(fromDate, toDate string, now time.Time) (time.Time, time.Time, error) {
	to := now
	if toDate != "" {
		parsed, err := time.Parse("2006-01-02", toDate)
		if err != nil {
			return time.Time{}, time.Time{}, errors.New("invalid to_date, expected YYYY-MM-DD")
		}
		to = parsed
	}
	// Default to the current month and the five before it.
	from := time.Date(to.Year(), to.Month()-5, 1, 0, 0, 0, 0, time.UTC)
	if fromDate != "" {
		parsed, err := time.Parse("2006-01-02", fromDate)
		if err != nil {
			return time.Time{}, time.Time{}, errors.New("invalid from_date, expected YYYY-MM-DD")
		}
		from = parsed
	}
	if to.Before(from) {
		return time.Time{}, time.Time{}, errors.New("to_date must be on or after from_date")
	}
	if to.Sub(from) > maxSummaryWindow {
		return time.Time{}, time.Time{}, errors.New("the date range cannot be longer than two years")
	}
	return from, to, nil
}

// GetFinanceSummary aggregates in SQL; no raw records reach the client.
func (s *Service) GetFinanceSummary(ctx context.Context, workspaceID int64, fromDate, toDate, currency string) (FinanceSummary, error) {
	from, to, err := resolveSummaryWindow(fromDate, toDate, time.Now().UTC())
	if err != nil {
		return FinanceSummary{}, err
	}
	currency = strings.ToUpper(strings.TrimSpace(currency))
	if currency == "" {
		currency = "NGN"
	}
	if len(currency) != 3 {
		return FinanceSummary{}, errors.New("currency must be a 3-letter code")
	}

	fromParam := pgtype.Date{Time: from, Valid: true}
	toParam := pgtype.Date{Time: to, Valid: true}

	totals, err := s.queries.GetIncomeExpenseTotals(ctx, db.GetIncomeExpenseTotalsParams{
		WorkspaceID: workspaceID, Currency: currency, FromDate: fromParam, ToDate: toParam,
	})
	if err != nil {
		return FinanceSummary{}, fmt.Errorf("income expense totals: %w", err)
	}
	cash, err := s.queries.GetCashBalance(ctx, db.GetCashBalanceParams{WorkspaceID: workspaceID, Currency: currency})
	if err != nil {
		return FinanceSummary{}, fmt.Errorf("cash balance: %w", err)
	}
	months, err := s.queries.GetMonthlyIncomeExpense(ctx, db.GetMonthlyIncomeExpenseParams{
		WorkspaceID: workspaceID, Currency: currency, FromDate: fromParam, ToDate: toParam,
	})
	if err != nil {
		return FinanceSummary{}, fmt.Errorf("monthly totals: %w", err)
	}
	categories, err := s.queries.GetSpendingByCategory(ctx, db.GetSpendingByCategoryParams{
		WorkspaceID: workspaceID, Currency: currency, FromDate: fromParam, ToDate: toParam,
	})
	if err != nil {
		return FinanceSummary{}, fmt.Errorf("spending by category: %w", err)
	}

	summary := FinanceSummary{
		FromDate:           from.Format("2006-01-02"),
		ToDate:             to.Format("2006-01-02"),
		Currency:           currency,
		CurrencyExponent:   CurrencyExponent(currency),
		IncomeMinor:        totals.IncomeMinor,
		ExpenseMinor:       totals.ExpenseMinor,
		NetMinor:           totals.IncomeMinor - totals.ExpenseMinor,
		CashBalanceMinor:   cash,
		Monthly:            make([]MonthlyFinance, 0, 24),
		SpendingByCategory: make([]CategorySpending, 0, len(categories)),
	}
	byMonth := make(map[string]db.GetMonthlyIncomeExpenseRow, len(months))
	for _, month := range months {
		byMonth[month.Month] = month
	}
	// Include quiet months so a trend chart has a continuous line.
	for cursor := time.Date(from.Year(), from.Month(), 1, 0, 0, 0, 0, time.UTC); !cursor.After(to); cursor = cursor.AddDate(0, 1, 0) {
		key := cursor.Format("2006-01")
		row := byMonth[key]
		summary.Monthly = append(summary.Monthly, MonthlyFinance{Month: key, IncomeMinor: row.IncomeMinor, ExpenseMinor: row.ExpenseMinor})
	}
	for _, category := range categories {
		summary.SpendingByCategory = append(summary.SpendingByCategory, CategorySpending{Category: category.CategoryName, TotalMinor: category.TotalMinor})
	}
	return summary, nil
}

// @Summary Finance summary
// @Description Income, expense, cash balance, monthly trend and category spending for a workspace.
// @Tags reports
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param from_date query string false "From Date (YYYY-MM-DD)"
// @Param to_date query string false "To Date (YYYY-MM-DD)"
// @Param currency query string false "ISO currency code"
// @Success 200 {object} map[string]any
// @Failure 400 {object} map[string]any
// @Router /api/v1/reports/summary [get]
func (h *Handler) getFinanceSummary(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": "Workspace is required"}})
		return
	}
	summary, err := h.service.GetFinanceSummary(c.Request.Context(), wsCtx.WorkspaceID, c.Query("from_date"), c.Query("to_date"), c.Query("currency"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": summary})
}
