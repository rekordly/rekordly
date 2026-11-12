package finance

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type PersonalDashboard struct {
	FromDate              string                                `json:"from_date"`
	ToDate                string                                `json:"to_date"`
	AsOf                  string                                `json:"as_of"`
	Currency              string                                `json:"currency"`
	CurrencyExponent      int                                   `json:"currency_exponent"`
	CashInflowMinor       int64                                 `json:"cash_inflow_minor,string"`
	CashOutflowMinor      int64                                 `json:"cash_outflow_minor,string"`
	NetCashMovementMinor  int64                                 `json:"net_cash_movement_minor,string"`
	IncomeMinor           int64                                 `json:"income_minor,string"`
	ExpenseMinor          int64                                 `json:"expense_minor,string"`
	NetIncomeMinor        int64                                 `json:"net_income_minor,string"`
	TotalCashBalanceMinor int64                                 `json:"total_cash_balance_minor,string"`
	Accounts              []db.MoneyAccount                     `json:"accounts"`
	SpendingByCategory    []db.GetPersonalSpendingByCategoryRow `json:"spending_by_category"`
	Budgets               []PersonalBudgetDetail                `json:"budgets"`
	RecentActivity        []db.ListPersonalActivityRow          `json:"recent_activity"`
	UpcomingLoans         []LoanDetail                          `json:"upcoming_loans"`
	NeedsReviewCount      int64                                 `json:"needs_review_count"`
	BasisNote             string                                `json:"basis_note"`
}

func (s *Service) GetPersonalDashboard(ctx context.Context, workspaceID int64, fromDateStr, toDateStr, currency string) (PersonalDashboard, error) {
	now := time.Now().UTC()
	if fromDateStr == "" && toDateStr == "" {
		fromDateStr = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
		toDateStr = now.Format("2006-01-02")
	}
	from, to, err := resolveSummaryWindow(fromDateStr, toDateStr, now)
	if err != nil {
		return PersonalDashboard{}, err
	}
	if currency == "" {
		currency = "NGN"
	}
	exp := CurrencyExponent(currency)

	cashMov, err := s.queries.GetPersonalPeriodCashMovement(ctx, db.GetPersonalPeriodCashMovementParams{
		WorkspaceID: workspaceID,
		Currency:    currency,
		FromDate:    pgtype.Date{Time: from, Valid: true},
		ToDate:      pgtype.Date{Time: to, Valid: true},
	})
	if err != nil {
		return PersonalDashboard{}, err
	}

	incExp, err := s.queries.GetPersonalPeriodIncomeExpense(ctx, db.GetPersonalPeriodIncomeExpenseParams{
		WorkspaceID: workspaceID,
		Currency:    currency,
		FromDate:    pgtype.Date{Time: from, Valid: true},
		ToDate:      pgtype.Date{Time: to, Valid: true},
	})
	if err != nil {
		return PersonalDashboard{}, err
	}

	accounts, err := s.ListAccountsOrdered(ctx, workspaceID, nil)
	if err != nil {
		return PersonalDashboard{}, err
	}
	var totalBal int64
	for _, a := range accounts {
		if a.Currency == currency {
			totalBal += a.CurrentBalanceMinor
		}
	}

	spendingByCat, err := s.queries.GetPersonalSpendingByCategory(ctx, db.GetPersonalSpendingByCategoryParams{
		WorkspaceID: workspaceID,
		Currency:    currency,
		FromDate:    pgtype.Date{Time: from, Valid: true},
		ToDate:      pgtype.Date{Time: to, Valid: true},
	})
	if err != nil {
		return PersonalDashboard{}, err
	}

	budgets, err := s.ListPersonalBudgetsWithStatus(ctx, workspaceID, "active")
	if err != nil {
		return PersonalDashboard{}, err
	}

	recent, err := s.queries.ListPersonalActivity(ctx, db.ListPersonalActivityParams{
		WorkspaceID: workspaceID,
		Limit:       5,
		FromDate:    pgtype.Date{Time: from, Valid: true},
		ToDate:      pgtype.Date{Time: to, Valid: true},
		ActivityTab: pgtype.Text{String: "all", Valid: true},
	})
	if err != nil {
		return PersonalDashboard{}, err
	}

	upcomingDueCutoff := now.AddDate(0, 0, 14)
	loanRows, err := s.queries.ListUpcomingLoanDueDates(ctx, db.ListUpcomingLoanDueDatesParams{
		WorkspaceID: workspaceID,
		DueDate:     pgtype.Date{Time: upcomingDueCutoff, Valid: true},
	})
	if err != nil {
		return PersonalDashboard{}, err
	}
	upcomingLoans := make([]LoanDetail, 0, len(loanRows))
	for _, lr := range loanRows {
		upcomingLoans = append(upcomingLoans, LoanDetail{
			Loan:          lr,
			DerivedStatus: deriveLoanStatus(lr, now),
		})
	}

	needsReview, err := s.queries.CountPersonalNeedsReview(ctx, workspaceID)
	if err != nil {
		return PersonalDashboard{}, err
	}

	return PersonalDashboard{
		FromDate:              from.Format("2006-01-02"),
		ToDate:                to.Format("2006-01-02"),
		AsOf:                  now.Format(time.RFC3339),
		Currency:              currency,
		CurrencyExponent:      exp,
		CashInflowMinor:       cashMov.CashInflowMinor,
		CashOutflowMinor:      cashMov.CashOutflowMinor,
		NetCashMovementMinor:  cashMov.CashInflowMinor - cashMov.CashOutflowMinor,
		IncomeMinor:           incExp.IncomeMinor,
		ExpenseMinor:          incExp.ExpenseMinor,
		NetIncomeMinor:        incExp.IncomeMinor - incExp.ExpenseMinor,
		TotalCashBalanceMinor: totalBal,
		Accounts:              accounts,
		SpendingByCategory:    spendingByCat,
		Budgets:               budgets,
		RecentActivity:        recent,
		UpcomingLoans:         upcomingLoans,
		NeedsReviewCount:      needsReview,
		BasisNote:             "Posted Personal records only. Own-account transfers, loan principal, investment purchases, asset acquisitions, opening balances, and drafts are excluded from Income & Expense.",
	}, nil
}

type PersonalActivityFilter struct {
	Tab        string // all, income, expenses, transfers, loans, investments, assets, drafts
	FromDate   string
	ToDate     string
	CursorDate string
	CursorID   int64
	Limit      int32
}

type PersonalActivityResult struct {
	Items      []db.ListPersonalActivityRow `json:"items"`
	Drafts     []db.MoneyRecordDraft        `json:"drafts,omitempty"`
	NextCursor *ActivityCursor              `json:"next_cursor,omitempty"`
	FromDate   string                       `json:"from_date"`
	ToDate     string                       `json:"to_date"`
}

type ActivityCursor struct {
	Date string `json:"date"`
	ID   int64  `json:"id"`
}

func (s *Service) ListPersonalActivity(ctx context.Context, workspaceID int64, f PersonalActivityFilter) (PersonalActivityResult, error) {
	now := time.Now().UTC()
	if f.FromDate == "" && f.ToDate == "" {
		f.FromDate = now.AddDate(0, 0, -30).Format("2006-01-02")
		f.ToDate = now.Format("2006-01-02")
	}
	from, to, err := resolveSummaryWindow(f.FromDate, f.ToDate, now)
	if err != nil {
		return PersonalActivityResult{}, err
	}

	limit := f.Limit
	if limit <= 0 || limit > 100 {
		limit = 25
	}

	tab := f.Tab
	if tab == "" {
		tab = "all"
	}

	if tab == "drafts" {
		drafts, err := s.queries.ListMoneyRecordDrafts(ctx, db.ListMoneyRecordDraftsParams{
			WorkspaceID: workspaceID,
			Limit:       limit,
		})
		if err != nil {
			return PersonalActivityResult{}, err
		}
		return PersonalActivityResult{
			Items:    []db.ListPersonalActivityRow{},
			Drafts:   drafts,
			FromDate: from.Format("2006-01-02"),
			ToDate:   to.Format("2006-01-02"),
		}, nil
	}

	var cursorDateParam pgtype.Date
	var cursorIDParam pgtype.Int8
	if f.CursorDate != "" && f.CursorID > 0 {
		cd, err := parseDateStrict(f.CursorDate)
		if err != nil {
			return PersonalActivityResult{}, err
		}
		cursorDateParam = pgtype.Date{Time: cd, Valid: true}
		cursorIDParam = pgtype.Int8{Int64: f.CursorID, Valid: true}
	}

	rows, err := s.queries.ListPersonalActivity(ctx, db.ListPersonalActivityParams{
		WorkspaceID: workspaceID,
		Limit:       limit + 1,
		FromDate:    pgtype.Date{Time: from, Valid: true},
		ToDate:      pgtype.Date{Time: to, Valid: true},
		CursorDate:  cursorDateParam,
		CursorID:    cursorIDParam,
		ActivityTab: pgtype.Text{String: tab, Valid: true},
	})
	if err != nil {
		return PersonalActivityResult{}, err
	}

	var nextCursor *ActivityCursor
	if int32(len(rows)) > limit {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		nextCursor = &ActivityCursor{
			Date: last.EffectiveDate.Time.Format("2006-01-02"),
			ID:   last.ID,
		}
	}

	return PersonalActivityResult{
		Items:      rows,
		NextCursor: nextCursor,
		FromDate:   from.Format("2006-01-02"),
		ToDate:     to.Format("2006-01-02"),
	}, nil
}
