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

const maxSearchLength = 100

var searchEscaper = strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`)

// searchParam bounds a list search and makes LIKE wildcards match literally.
func searchParam(raw string) pgtype.Text {
	term := []rune(strings.TrimSpace(raw))
	if len(term) == 0 {
		return pgtype.Text{}
	}
	if len(term) > maxSearchLength {
		term = term[:maxSearchLength]
	}
	return pgtype.Text{String: searchEscaper.Replace(string(term)), Valid: true}
}

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

// PeriodTotals are the income and expense of the comparison period.
type PeriodTotals struct {
	FromDate     string `json:"from_date"`
	ToDate       string `json:"to_date"`
	IncomeMinor  int64  `json:"income_minor,string"`
	ExpenseMinor int64  `json:"expense_minor,string"`
	NetMinor     int64  `json:"net_minor,string"`
}

// OpenBalances are amounts still unpaid today, whatever the period.
type OpenBalances struct {
	SalesUnpaidMinor     int64 `json:"sales_unpaid_minor,string"`
	SalesUnpaidCount     int64 `json:"sales_unpaid_count"`
	InvoicesUnpaidMinor  int64 `json:"invoices_unpaid_minor,string"`
	InvoicesUnpaidCount  int64 `json:"invoices_unpaid_count"`
	InvoicesOverdueMinor int64 `json:"invoices_overdue_minor,string"`
	InvoicesOverdueCount int64 `json:"invoices_overdue_count"`
	PurchasesUnpaidMinor int64 `json:"purchases_unpaid_minor,string"`
	PurchasesUnpaidCount int64 `json:"purchases_unpaid_count"`
}

// DailyFinance is one day of ledger income and expense.
type DailyFinance struct {
	Date         string `json:"date"`
	IncomeMinor  int64  `json:"income_minor,string"`
	ExpenseMinor int64  `json:"expense_minor,string"`
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
	// Previous is the window just before this one, used for change chips.
	Previous   PeriodTotals `json:"previous"`
	Open       OpenBalances `json:"open"`
	SalesMinor int64        `json:"sales_minor,string"`
	SalesCount int64        `json:"sales_count"`
	// Collected so far on the sales made in this period.
	SalesPaidMinor     int64 `json:"sales_paid_minor,string"`
	PurchasesMinor     int64 `json:"purchases_minor,string"`
	PurchasesPaidMinor int64 `json:"purchases_paid_minor,string"`
	PurchasesCount     int64 `json:"purchases_count"`
	// LastSevenDays ends on to_date and always has seven entries.
	LastSevenDays []DailyFinance `json:"last_7_days"`
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

// previousWindow returns the comparison window. A window that starts on the 1st
// compares with the same days the same number of months earlier (1-13 Nov vs 1-13 Oct);
// any other window compares with the same number of days immediately before.
func previousWindow(from, to time.Time) (time.Time, time.Time) {
	if from.Day() == 1 {
		months := (to.Year()-from.Year())*12 + int(to.Month()-from.Month()) + 1
		prevFrom := from.AddDate(0, -months, 0)
		prevTo := shiftMonthsClamped(to, -months)
		return prevFrom, prevTo
	}
	days := int(to.Sub(from).Hours()/24) + 1
	prevTo := from.AddDate(0, 0, -1)
	return prevTo.AddDate(0, 0, -(days - 1)), prevTo
}

// shiftMonthsClamped moves a date by whole months, keeping it inside the target month (31 Mar - 1 month = 28/29 Feb).
func shiftMonthsClamped(t time.Time, months int) time.Time {
	firstOfTarget := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, months, 0)
	lastDay := firstOfTarget.AddDate(0, 1, -1).Day()
	day := t.Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(firstOfTarget.Year(), firstOfTarget.Month(), day, 0, 0, 0, 0, time.UTC)
}

// fillDays returns seven consecutive days from start, with zero for days that have no entries.
func fillDays(start time.Time, rows []db.GetDailyIncomeExpenseRow) []DailyFinance {
	byDay := make(map[string]db.GetDailyIncomeExpenseRow, len(rows))
	for _, row := range rows {
		byDay[row.Day.Time.Format("2006-01-02")] = row
	}
	out := make([]DailyFinance, 0, 7)
	for i := 0; i < 7; i++ {
		key := start.AddDate(0, 0, i).Format("2006-01-02")
		row := byDay[key]
		out = append(out, DailyFinance{Date: key, IncomeMinor: row.IncomeMinor, ExpenseMinor: row.ExpenseMinor})
	}
	return out
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

	prevFrom, prevTo := previousWindow(from, to)
	prevTotals, err := s.queries.GetIncomeExpenseTotals(ctx, db.GetIncomeExpenseTotalsParams{
		WorkspaceID: workspaceID, Currency: currency,
		FromDate: pgtype.Date{Time: prevFrom, Valid: true}, ToDate: pgtype.Date{Time: prevTo, Valid: true},
	})
	if err != nil {
		return FinanceSummary{}, fmt.Errorf("previous totals: %w", err)
	}
	open, err := s.queries.GetOpenBalances(ctx, db.GetOpenBalancesParams{
		WorkspaceID: workspaceID, Currency: currency, Today: pgtype.Date{Time: time.Now().UTC(), Valid: true},
	})
	if err != nil {
		return FinanceSummary{}, fmt.Errorf("open balances: %w", err)
	}
	sales, err := s.queries.GetSalesTotals(ctx, db.GetSalesTotalsParams{
		WorkspaceID: workspaceID, Currency: currency, FromDate: fromParam, ToDate: toParam,
	})
	if err != nil {
		return FinanceSummary{}, fmt.Errorf("sales totals: %w", err)
	}

	purchases, err := s.queries.GetPurchaseTotals(ctx, db.GetPurchaseTotalsParams{
		WorkspaceID: workspaceID, Currency: currency, FromDate: fromParam, ToDate: toParam,
	})
	if err != nil {
		return FinanceSummary{}, fmt.Errorf("purchase totals: %w", err)
	}
	weekFrom := to.AddDate(0, 0, -6)
	days, err := s.queries.GetDailyIncomeExpense(ctx, db.GetDailyIncomeExpenseParams{
		WorkspaceID: workspaceID, Currency: currency,
		FromDate: pgtype.Date{Time: weekFrom, Valid: true}, ToDate: toParam,
	})
	if err != nil {
		return FinanceSummary{}, fmt.Errorf("daily totals: %w", err)
	}

	summary := FinanceSummary{
		Previous: PeriodTotals{
			FromDate:     prevFrom.Format("2006-01-02"),
			ToDate:       prevTo.Format("2006-01-02"),
			IncomeMinor:  prevTotals.IncomeMinor,
			ExpenseMinor: prevTotals.ExpenseMinor,
			NetMinor:     prevTotals.IncomeMinor - prevTotals.ExpenseMinor,
		},
		Open:               OpenBalances(open),
		SalesMinor:         sales.TotalMinor,
		SalesCount:         sales.SaleCount,
		SalesPaidMinor:     sales.PaidMinor,
		PurchasesMinor:     purchases.TotalMinor,
		PurchasesPaidMinor: purchases.PaidMinor,
		PurchasesCount:     purchases.PurchaseCount,
		LastSevenDays:      fillDays(weekFrom, days),
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
	wsCtx, ok := requirePermission(c, "reports.view_basic", "money.view", "sales.view")
	if !ok {
		return
	}
	summary, err := h.service.GetFinanceSummary(c.Request.Context(), wsCtx.WorkspaceID, c.Query("from_date"), c.Query("to_date"), c.Query("currency"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": summary})
}
