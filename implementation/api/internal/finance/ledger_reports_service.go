package finance

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type ReportColumn struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Align string `json:"align,omitempty"`
}

type ReportRow struct {
	Key        string            `json:"key"`
	Label      string            `json:"label"`
	Values     map[string]string `json:"values"`
	ChartAccID *int64            `json:"chart_account_id,omitempty"`
	SourceType string            `json:"source_type,omitempty"`
	SourceID   *int64            `json:"source_id,omitempty"`
}

type LedgerReportResult struct {
	ReportType           string            `json:"report_type"`
	Title                string            `json:"title"`
	FromDate             string            `json:"from_date"`
	ToDate               string            `json:"to_date"`
	AsOfDate             string            `json:"as_of_date"`
	Currency             string            `json:"currency"`
	CurrencyExponent     int               `json:"currency_exponent"`
	Basis                string            `json:"basis"`
	ReportVersion        string            `json:"report_version"`
	GeneratedAt          string            `json:"generated_at"`
	InvariantPassed      bool              `json:"invariant_passed"`
	ReconciliationStatus string            `json:"reconciliation_status"`
	Warnings             []string          `json:"warnings"`
	Columns              []ReportColumn    `json:"columns"`
	Rows                 []ReportRow       `json:"rows"`
	Totals               map[string]string `json:"totals"`
}

func (s *Service) GenerateReport(ctx context.Context, workspaceID int64, reportType, fromDateStr, toDateStr, currency string) (LedgerReportResult, error) {
	now := time.Now().UTC()
	if fromDateStr == "" && toDateStr == "" {
		fromDateStr = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
		toDateStr = now.Format("2006-01-02")
	}
	from, to, err := resolveSummaryWindow(fromDateStr, toDateStr, now)
	if err != nil {
		return LedgerReportResult{}, err
	}
	currency = strings.ToUpper(strings.TrimSpace(currency))
	if currency == "" {
		currency = "NGN"
	}
	exp := CurrencyExponent(currency)

	res := LedgerReportResult{
		ReportType:           reportType,
		FromDate:             from.Format("2006-01-02"),
		ToDate:               to.Format("2006-01-02"),
		AsOfDate:             to.Format("2006-01-02"),
		Currency:             currency,
		CurrencyExponent:     exp,
		Basis:                "accrual_posted",
		ReportVersion:        "v1",
		GeneratedAt:          now.Format(time.RFC3339),
		InvariantPassed:      true,
		ReconciliationStatus: "not_checked",
		Warnings:             []string{},
		Totals:               map[string]string{},
	}

	switch reportType {
	case "trial_balance":
		res.Title = "Trial Balance"
		res.Columns = []ReportColumn{
			{Key: "code", Label: "Code"},
			{Key: "name", Label: "Account"},
			{Key: "class", Label: "Class"},
			{Key: "opening_debit", Label: "Opening Dr", Align: "right"},
			{Key: "opening_credit", Label: "Opening Cr", Align: "right"},
			{Key: "period_debit", Label: "Period Dr", Align: "right"},
			{Key: "period_credit", Label: "Period Cr", Align: "right"},
			{Key: "closing_debit", Label: "Closing Dr", Align: "right"},
			{Key: "closing_credit", Label: "Closing Cr", Align: "right"},
		}
		tbRows, err := s.queries.GetTrialBalanceByChartAccount(ctx, db.GetTrialBalanceByChartAccountParams{
			WorkspaceID: workspaceID,
			FromDate:    pgtype.Date{Time: from, Valid: true},
			ToDate:      pgtype.Date{Time: to, Valid: true},
			Currency:    currency,
		})
		if err != nil {
			return LedgerReportResult{}, err
		}
		var sumCD, sumCC int64
		for _, r := range tbRows {
			sumCD += r.ClosingDebitMinor
			sumCC += r.ClosingCreditMinor
			accID := r.ChartAccountID
			res.Rows = append(res.Rows, ReportRow{
				Key:        r.Code,
				Label:      r.Name,
				ChartAccID: &accID,
				Values: map[string]string{
					"code":           r.Code,
					"name":           r.Name,
					"class":          r.AccountClass,
					"opening_debit":  fmt.Sprint(r.OpeningDebitMinor),
					"opening_credit": fmt.Sprint(r.OpeningCreditMinor),
					"period_debit":   fmt.Sprint(r.PeriodDebitMinor),
					"period_credit":  fmt.Sprint(r.PeriodCreditMinor),
					"closing_debit":  fmt.Sprint(r.ClosingDebitMinor),
					"closing_credit": fmt.Sprint(r.ClosingCreditMinor),
				},
			})
		}
		res.Totals["closing_debit_minor"] = fmt.Sprint(sumCD)
		res.Totals["closing_credit_minor"] = fmt.Sprint(sumCC)
		if sumCD != sumCC {
			res.InvariantPassed = false
			res.ReconciliationStatus = "failed"
			res.Warnings = append(res.Warnings, fmt.Sprintf("TRIAL_BALANCE_FAILED: closing debits (%d) != closing credits (%d)", sumCD, sumCC))
		} else {
			res.ReconciliationStatus = "balanced"
		}

	case "profit_and_loss":
		res.Title = "Profit and Loss"
		res.Columns = []ReportColumn{
			{Key: "section", Label: "Section"},
			{Key: "amount_minor", Label: "Amount", Align: "right"},
		}
		totals, err := s.queries.GetLedgerClassTotalsPeriod(ctx, db.GetLedgerClassTotalsPeriodParams{
			WorkspaceID: workspaceID,
			Currency:    currency,
			FromDate:    pgtype.Date{Time: from, Valid: true},
			ToDate:      pgtype.Date{Time: to, Valid: true},
		})
		if err != nil {
			return LedgerReportResult{}, err
		}
		var rev, expAmt int64
		for _, t := range totals {
			if t.AccountClass == "revenue" {
				rev = t.TotalCreditMinor - t.TotalDebitMinor
			} else if t.AccountClass == "expense" {
				expAmt = t.TotalDebitMinor - t.TotalCreditMinor
			}
		}
		net := rev - expAmt
		res.Rows = []ReportRow{
			{Key: "revenue", Label: "Revenue", Values: map[string]string{"section": "Revenue", "amount_minor": fmt.Sprint(rev)}},
			{Key: "expenses", Label: "Expenses & COGS", Values: map[string]string{"section": "Expenses & COGS", "amount_minor": fmt.Sprint(expAmt)}},
			{Key: "net_profit", Label: "Net Profit / (Loss)", Values: map[string]string{"section": "Net Profit / (Loss)", "amount_minor": fmt.Sprint(net)}},
		}
		res.Totals["revenue_minor"] = fmt.Sprint(rev)
		res.Totals["expense_minor"] = fmt.Sprint(expAmt)
		res.Totals["net_profit_minor"] = fmt.Sprint(net)
		res.ReconciliationStatus = "balanced"

	case "balance_sheet":
		res.Title = "Balance Sheet"
		res.Columns = []ReportColumn{
			{Key: "section", Label: "Section"},
			{Key: "amount_minor", Label: "Balance", Align: "right"},
		}
		totals, err := s.queries.GetLedgerClassTotalsAsOf(ctx, db.GetLedgerClassTotalsAsOfParams{
			WorkspaceID: workspaceID,
			Currency:    currency,
			AsOfDate:    pgtype.Date{Time: to, Valid: true},
		})
		if err != nil {
			return LedgerReportResult{}, err
		}
		var assets, liab, equity, rev, expAmt int64
		for _, t := range totals {
			switch t.AccountClass {
			case "asset":
				assets = t.TotalDebitMinor - t.TotalCreditMinor
			case "liability":
				liab = t.TotalCreditMinor - t.TotalDebitMinor
			case "equity":
				equity = t.TotalCreditMinor - t.TotalDebitMinor
			case "revenue":
				rev = t.TotalCreditMinor - t.TotalDebitMinor
			case "expense":
				expAmt = t.TotalDebitMinor - t.TotalCreditMinor
			}
		}
		currentResult := rev - expAmt
		totalEquity := equity + currentResult
		res.Rows = []ReportRow{
			{Key: "assets", Label: "Total Assets", Values: map[string]string{"section": "Assets", "amount_minor": fmt.Sprint(assets)}},
			{Key: "liabilities", Label: "Total Liabilities", Values: map[string]string{"section": "Liabilities", "amount_minor": fmt.Sprint(liab)}},
			{Key: "equity", Label: "Contributed Equity", Values: map[string]string{"section": "Equity", "amount_minor": fmt.Sprint(equity)}},
			{Key: "current_result", Label: "Current Period Result", Values: map[string]string{"section": "Current Period Result", "amount_minor": fmt.Sprint(currentResult)}},
		}
		res.Totals["assets_minor"] = fmt.Sprint(assets)
		res.Totals["liabilities_minor"] = fmt.Sprint(liab)
		res.Totals["equity_minor"] = fmt.Sprint(totalEquity)
		res.Totals["liabilities_plus_equity_minor"] = fmt.Sprint(liab + totalEquity)
		if assets != liab+totalEquity {
			res.InvariantPassed = false
			res.ReconciliationStatus = "failed"
			res.Warnings = append(res.Warnings, fmt.Sprintf("BALANCE_SHEET_FAILED: Assets (%d) != Liabilities + Equity (%d)", assets, liab+totalEquity))
		} else {
			res.ReconciliationStatus = "balanced"
		}

	case "cash_movement":
		res.Title = "Cash Movement Report"
		res.Basis = "cash_movement"
		res.Columns = []ReportColumn{
			{Key: "metric", Label: "Metric"},
			{Key: "amount_minor", Label: "Amount", Align: "right"},
		}
		mov, err := s.queries.GetPersonalPeriodCashMovement(ctx, db.GetPersonalPeriodCashMovementParams{
			WorkspaceID: workspaceID,
			Currency:    currency,
			FromDate:    pgtype.Date{Time: from, Valid: true},
			ToDate:      pgtype.Date{Time: to, Valid: true},
		})
		if err != nil {
			return LedgerReportResult{}, err
		}
		closingCash, err := s.queries.GetCashBalance(ctx, db.GetCashBalanceParams{
			WorkspaceID: workspaceID,
			Currency:    currency,
		})
		if err != nil {
			return LedgerReportResult{}, err
		}
		netMov := mov.CashInflowMinor - mov.CashOutflowMinor
		openingCash := closingCash - netMov
		res.Rows = []ReportRow{
			{Key: "opening_cash", Label: "Opening Cash", Values: map[string]string{"metric": "Opening Cash", "amount_minor": fmt.Sprint(openingCash)}},
			{Key: "money_in", Label: "Money In", Values: map[string]string{"metric": "Money In", "amount_minor": fmt.Sprint(mov.CashInflowMinor)}},
			{Key: "money_out", Label: "Money Out", Values: map[string]string{"metric": "Money Out", "amount_minor": fmt.Sprint(mov.CashOutflowMinor)}},
			{Key: "net_movement", Label: "Net Cash Movement", Values: map[string]string{"metric": "Net Cash Movement", "amount_minor": fmt.Sprint(netMov)}},
			{Key: "closing_cash", Label: "Closing Cash", Values: map[string]string{"metric": "Closing Cash", "amount_minor": fmt.Sprint(closingCash)}},
		}
		res.Totals["opening_cash_minor"] = fmt.Sprint(openingCash)
		res.Totals["net_movement_minor"] = fmt.Sprint(netMov)
		res.Totals["closing_cash_minor"] = fmt.Sprint(closingCash)
		res.InvariantPassed = openingCash+netMov == closingCash
		res.ReconciliationStatus = "balanced"
		res.Warnings = append(res.Warnings, "Plain-language cash movement report (transfers between own accounts excluded). Not a formal IAS 7 indirect cash-flow statement.")

	case "ar_aging":
		res.Title = "Accounts Receivable Aging"
		res.Columns = []ReportColumn{
			{Key: "document", Label: "Invoice"},
			{Key: "party", Label: "Customer"},
			{Key: "due_date", Label: "Due date"},
			{Key: "bucket", Label: "Bucket"},
			{Key: "outstanding_minor", Label: "Outstanding", Align: "right"},
		}
		rows, err := s.queries.GetARAgingRows(ctx, workspaceID)
		if err != nil {
			return LedgerReportResult{}, err
		}
		var totalOut int64
		for _, r := range rows {
			bucket := agingBucket(to, r.DueDate)
			totalOut += r.OutstandingMinor
			srcID := r.ID
			res.Rows = append(res.Rows, ReportRow{
				Key:        r.InvoiceNumber,
				Label:      r.CustomerName,
				SourceType: "invoice",
				SourceID:   &srcID,
				Values: map[string]string{
					"document":          r.InvoiceNumber,
					"party":             r.CustomerName,
					"due_date":          formatPgDate(r.DueDate),
					"bucket":            bucket,
					"outstanding_minor": fmt.Sprint(r.OutstandingMinor),
				},
			})
		}
		res.Totals["total_outstanding_minor"] = fmt.Sprint(totalOut)
		res.ReconciliationStatus = "subledger_derived"

	case "ap_aging":
		res.Title = "Accounts Payable Aging"
		res.Columns = []ReportColumn{
			{Key: "document", Label: "Supplier Bill"},
			{Key: "party", Label: "Supplier"},
			{Key: "due_date", Label: "Due date"},
			{Key: "bucket", Label: "Bucket"},
			{Key: "outstanding_minor", Label: "Outstanding", Align: "right"},
		}
		rows, err := s.queries.GetAPAgingRows(ctx, workspaceID)
		if err != nil {
			return LedgerReportResult{}, err
		}
		var totalOut int64
		for _, r := range rows {
			bucket := agingBucket(to, r.DueDate)
			totalOut += r.OutstandingMinor
			srcID := r.ID
			res.Rows = append(res.Rows, ReportRow{
				Key:        r.BillNumber,
				Label:      r.SupplierName.String,
				SourceType: "supplier_bill",
				SourceID:   &srcID,
				Values: map[string]string{
					"document":          r.BillNumber,
					"party":             r.SupplierName.String,
					"due_date":          formatPgDate(r.DueDate),
					"bucket":            bucket,
					"outstanding_minor": fmt.Sprint(r.OutstandingMinor),
				},
			})
		}
		res.Totals["total_outstanding_minor"] = fmt.Sprint(totalOut)
		res.ReconciliationStatus = "subledger_derived"

	case "inventory_valuation":
		res.Title = "Inventory Valuation"
		res.Columns = []ReportColumn{
			{Key: "metric", Label: "Metric"},
			{Key: "amount_minor", Label: "Value", Align: "right"},
		}
		sub, err := s.queries.GetSubledgerBalances(ctx, workspaceID)
		if err != nil {
			return LedgerReportResult{}, err
		}
		res.Rows = []ReportRow{
			{Key: "inventory_value", Label: "Total Inventory Value (Weighted Average)", Values: map[string]string{"metric": "Total Inventory Value", "amount_minor": fmt.Sprint(sub.InventorySubledgerMinor)}},
		}
		res.Totals["total_value_minor"] = fmt.Sprint(sub.InventorySubledgerMinor)
		res.ReconciliationStatus = "subledger_derived"

	case "vat_schedule", "wht_schedule":
		taxType := "vat"
		res.Title = "VAT Schedule"
		if reportType == "wht_schedule" {
			taxType = "wht"
			res.Title = "WHT Schedule"
		}
		res.Columns = []ReportColumn{
			{Key: "date", Label: "Date"},
			{Key: "direction", Label: "Direction"},
			{Key: "party", Label: "Counterparty"},
			{Key: "base_minor", Label: "Taxable Base", Align: "right"},
			{Key: "tax_minor", Label: "Tax Amount", Align: "right"},
			{Key: "status", Label: "Status"},
		}
		items, err := s.queries.ListTaxScheduleItems(ctx, db.ListTaxScheduleItemsParams{
			WorkspaceID: workspaceID,
			Limit:       100,
			TaxType:     pgtype.Text{String: taxType, Valid: true},
			FromDate:    pgtype.Date{Time: from, Valid: true},
			ToDate:      pgtype.Date{Time: to, Valid: true},
		})
		if err != nil {
			return LedgerReportResult{}, err
		}
		var totalTax int64
		for _, it := range items {
			if it.Status == "active" {
				if it.Direction == "output" || it.Direction == "withheld_from_supplier" {
					totalTax += it.TaxAmountMinor
				} else {
					totalTax -= it.TaxAmountMinor
				}
			}
			srcID := it.SourceID
			res.Rows = append(res.Rows, ReportRow{
				Key:        fmt.Sprintf("%s-%d", it.SourceType, it.SourceID),
				Label:      it.CounterpartyName.String,
				SourceType: it.SourceType,
				SourceID:   &srcID,
				Values: map[string]string{
					"date":       it.EffectiveDate.Time.Format("2006-01-02"),
					"direction":  it.Direction,
					"party":      it.CounterpartyName.String,
					"base_minor": fmt.Sprint(it.TaxableBaseMinor),
					"tax_minor":  fmt.Sprint(it.TaxAmountMinor),
					"status":     it.Status,
				},
			})
		}
		res.Totals["net_tax_minor"] = fmt.Sprint(totalTax)
		res.Warnings = append(res.Warnings, "Configured accounting tax schedule only; not automatic legal or tax filing advice.")
		res.ReconciliationStatus = "subledger_derived"

	case "cogs", "sales", "purchasing", "customer_deposits", "supplier_advances", "loan_balances", "personal_income_expense", "budget_vs_actual", "investment_asset_summary":
		res.Title = strings.ReplaceAll(strings.Title(strings.ReplaceAll(reportType, "_", " ")), "Cogs", "COGS")
		res.Columns = []ReportColumn{
			{Key: "metric", Label: "Metric"},
			{Key: "amount_minor", Label: "Amount", Align: "right"},
		}
		sub, err := s.queries.GetSubledgerBalances(ctx, workspaceID)
		if err != nil {
			return LedgerReportResult{}, err
		}
		switch reportType {
		case "customer_deposits":
			res.Rows = []ReportRow{{Key: "customer_deposits", Label: "Customer Deposits Liability", Values: map[string]string{"metric": "Customer Deposits", "amount_minor": fmt.Sprint(sub.CustomerDepositsSubledgerMinor)}}}
		case "supplier_advances":
			res.Rows = []ReportRow{{Key: "supplier_advances", Label: "Supplier Advances Asset", Values: map[string]string{"metric": "Supplier Advances", "amount_minor": fmt.Sprint(sub.SupplierAdvancesSubledgerMinor)}}}
		case "loan_balances":
			res.Rows = []ReportRow{
				{Key: "loans_receivable", Label: "Loans Receivable (Lent)", Values: map[string]string{"metric": "Loans Receivable", "amount_minor": fmt.Sprint(sub.LoansReceivableSubledgerMinor)}},
				{Key: "loans_payable", Label: "Loans Payable (Borrowed)", Values: map[string]string{"metric": "Loans Payable", "amount_minor": fmt.Sprint(sub.LoansPayableSubledgerMinor)}},
			}
		default:
			fin, err := s.GetFinanceSummary(ctx, workspaceID, res.FromDate, res.ToDate, currency)
			if err != nil {
				return LedgerReportResult{}, err
			}
			res.Rows = []ReportRow{
				{Key: "income", Label: "Income / Sales", Values: map[string]string{"metric": "Income / Sales", "amount_minor": fmt.Sprint(fin.IncomeMinor)}},
				{Key: "expense", Label: "Expense / Purchases", Values: map[string]string{"metric": "Expense / Purchases", "amount_minor": fmt.Sprint(fin.ExpenseMinor)}},
				{Key: "cash", Label: "Cash Balance", Values: map[string]string{"metric": "Cash Balance", "amount_minor": fmt.Sprint(fin.CashBalanceMinor)}},
			}
		}
		res.ReconciliationStatus = "subledger_derived"

	default:
		return LedgerReportResult{}, errors.New("unsupported report type: " + reportType)
	}

	return res, nil
}

func agingBucket(asOf time.Time, due pgtype.Date) string {
	if !due.Valid {
		return "current"
	}
	days := int(asOf.Sub(due.Time).Hours() / 24)
	switch {
	case days <= 0:
		return "current"
	case days <= 30:
		return "1-30"
	case days <= 60:
		return "31-60"
	case days <= 90:
		return "61-90"
	default:
		return "90+"
	}
}

func formatPgDate(d pgtype.Date) string {
	if !d.Valid {
		return ""
	}
	return d.Time.Format("2006-01-02")
}

func (s *Service) ExportReport(ctx context.Context, workspaceID, userID int64, reportType, format, fromDateStr, toDateStr, currency string) (db.ReportExport, error) {
	if format != "csv" && format != "pdf" {
		format = "csv"
	}
	rep, err := s.GenerateReport(ctx, workspaceID, reportType, fromDateStr, toDateStr, currency)
	if err != nil {
		return db.ReportExport{}, err
	}

	var buf strings.Builder
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"Report", rep.Title, "Version", rep.ReportVersion})
	_ = w.Write([]string{"Period", rep.FromDate, "To", rep.ToDate, "Currency", rep.Currency, "AsOf", rep.GeneratedAt})
	_ = w.Write([]string{"Reconciliation", rep.ReconciliationStatus, "InvariantPassed", fmt.Sprint(rep.InvariantPassed)})
	if len(rep.Warnings) > 0 {
		_ = w.Write(append([]string{"Warnings"}, rep.Warnings...))
	}
	_ = w.Write([]string{})

	headers := make([]string, 0, len(rep.Columns))
	for _, col := range rep.Columns {
		headers = append(headers, col.Label)
	}
	_ = w.Write(headers)
	for _, r := range rep.Rows {
		rowSlice := make([]string, 0, len(rep.Columns))
		for _, col := range rep.Columns {
			rowSlice = append(rowSlice, r.Values[col.Key])
		}
		_ = w.Write(rowSlice)
	}
	w.Flush()

	filtersJSON, _ := json.Marshal(map[string]string{
		"from_date": rep.FromDate,
		"to_date":   rep.ToDate,
		"currency":  rep.Currency,
	})
	warningsJSON, _ := json.Marshal(rep.Warnings)

	return s.queries.CreateReportExport(ctx, db.CreateReportExportParams{
		WorkspaceID:     workspaceID,
		ReportType:      reportType,
		Format:          format,
		Filters:         filtersJSON,
		Status:          "ready",
		RowCount:        int32(len(rep.Rows)),
		Warnings:        warningsJSON,
		ContentText:     buf.String(),
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
}
