package finance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

// ==================== Subledger Reconciliation ====================

type ReconciliationRunDetail struct {
	Run         db.ReconciliationRun          `json:"run"`
	Differences []db.ReconciliationDifference `json:"differences"`
}

func (s *Service) RunSubledgerReconciliation(ctx context.Context, workspaceID, userID int64, asOfDateStr string) (ReconciliationRunDetail, error) {
	asOf := time.Now().UTC()
	if strings.TrimSpace(asOfDateStr) != "" {
		parsed, err := parseDateStrict(asOfDateStr)
		if err != nil {
			return ReconciliationRunDetail{}, err
		}
		asOf = parsed
	}

	sub, err := s.queries.GetSubledgerBalances(ctx, workspaceID)
	if err != nil {
		return ReconciliationRunDetail{}, err
	}

	type checkDef struct {
		name         string
		mappingKey   string
		subledgerVal int64
		creditNormal bool
	}
	checks := []checkDef{
		{name: "Accounts Receivable", mappingKey: "ar_control", subledgerVal: sub.ArSubledgerMinor, creditNormal: false},
		{name: "Accounts Payable", mappingKey: "ap_control", subledgerVal: sub.ApSubledgerMinor, creditNormal: true},
		{name: "Customer Deposits", mappingKey: "customer_deposits", subledgerVal: sub.CustomerDepositsSubledgerMinor, creditNormal: true},
		{name: "Supplier Advances", mappingKey: "supplier_advances", subledgerVal: sub.SupplierAdvancesSubledgerMinor, creditNormal: false},
		{name: "Inventory", mappingKey: "inventory_control", subledgerVal: sub.InventorySubledgerMinor, creditNormal: false},
		{name: "Loans Receivable", mappingKey: "loans_receivable", subledgerVal: sub.LoansReceivableSubledgerMinor, creditNormal: false},
		{name: "Loans Payable", mappingKey: "loans_payable", subledgerVal: sub.LoansPayableSubledgerMinor, creditNormal: true},
		{name: "Cash & Bank", mappingKey: "cash_default", subledgerVal: sub.CashAccountsSubledgerMinor, creditNormal: false},
	}

	type diffRow struct {
		name      string
		ctrlAccID pgtype.Int8
		glBal     int64
		subBal    int64
		diff      int64
		status    string
		details   string
	}
	var results []diffRow
	failed := 0

	for _, c := range checks {
		var ctrlAccID pgtype.Int8
		var glBal int64
		mapping, err := s.queries.GetAccountMappingByKey(ctx, db.GetAccountMappingByKeyParams{
			WorkspaceID: workspaceID,
			MappingKey:  c.mappingKey,
		})
		if err == nil {
			ctrlAccID = pgtype.Int8{Int64: mapping.ChartAccountID, Valid: true}
			rawNet, err := s.queries.GetChartAccountGLBalance(ctx, db.GetChartAccountGLBalanceParams{
				WorkspaceID:    workspaceID,
				ChartAccountID: pgtype.Int8{Int64: mapping.ChartAccountID, Valid: true},
				AsOfDate:       pgtype.Date{Time: asOf, Valid: true},
			})
			if err == nil {
				if c.creditNormal {
					glBal = -rawNet
				} else {
					glBal = rawNet
				}
			}
		}

		diff := glBal - c.subledgerVal
		status := "matched"
		detail := "GL control balance matches subledger"
		if diff != 0 {
			status = "mismatch"
			detail = fmt.Sprintf("GL (%d) differs from subledger (%d) by %d minor units", glBal, c.subledgerVal, diff)
			failed++
		}
		results = append(results, diffRow{
			name:      c.name,
			ctrlAccID: ctrlAccID,
			glBal:     glBal,
			subBal:    c.subledgerVal,
			diff:      diff,
			status:    status,
			details:   detail,
		})
	}

	runStatus := "passed"
	if failed > 0 {
		runStatus = "failed"
	}

	run, err := s.queries.CreateReconciliationRun(ctx, db.CreateReconciliationRunParams{
		WorkspaceID:  workspaceID,
		AsOfDate:     pgtype.Date{Time: asOf, Valid: true},
		Status:       runStatus,
		TotalChecks:  int32(len(results)),
		FailedChecks: int32(failed),
		RunByUserID:  pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return ReconciliationRunDetail{}, err
	}

	diffs := make([]db.ReconciliationDifference, 0, len(results))
	for _, r := range results {
		d, err := s.queries.CreateReconciliationDifference(ctx, db.CreateReconciliationDifferenceParams{
			RunID:                 run.ID,
			WorkspaceID:           workspaceID,
			SubledgerName:         r.name,
			ControlAccountID:      r.ctrlAccID,
			GlBalanceMinor:        r.glBal,
			SubledgerBalanceMinor: r.subBal,
			DifferenceMinor:       r.diff,
			Status:                r.status,
			Details:               pgtype.Text{String: r.details, Valid: true},
		})
		if err != nil {
			return ReconciliationRunDetail{}, err
		}
		diffs = append(diffs, d)
	}

	if failed > 0 {
		payload, _ := json.Marshal(map[string]any{"run_id": run.ID, "failed_checks": failed})
		_, _ = s.pool.Exec(ctx, `INSERT INTO audit_events (workspace_id, actor_user_id, event_type, subject_type, subject_id, metadata) VALUES ($1, $2, 'subledger_reconciliation_failed', 'reconciliation_run', $3, $4)`,
			workspaceID, userID, strconv.FormatInt(run.ID, 10), payload)
	}

	return ReconciliationRunDetail{Run: run, Differences: diffs}, nil
}

// ==================== Tax Codes, Schedules & Payments ====================

type CreateTaxCodeInput struct {
	Code           string `json:"code" binding:"required"`
	Name           string `json:"name" binding:"required"`
	TaxType        string `json:"tax_type" binding:"required"`       // vat, wht, other
	Classification string `json:"classification" binding:"required"` // taxable, zero_rated, exempt, out_of_scope
	RateBps        int32  `json:"rate_bps"`
}

func (s *Service) CreateTaxCode(ctx context.Context, workspaceID int64, in CreateTaxCodeInput) (db.TaxCode, error) {
	return s.queries.CreateTaxCode(ctx, db.CreateTaxCodeParams{
		WorkspaceID:    workspaceID,
		Code:           strings.ToUpper(strings.TrimSpace(in.Code)),
		Name:           strings.TrimSpace(in.Name),
		TaxType:        strings.ToLower(strings.TrimSpace(in.TaxType)),
		Classification: strings.ToLower(strings.TrimSpace(in.Classification)),
		RateBps:        in.RateBps,
	})
}

type RecordTaxPaymentInput struct {
	TaxPeriodID    *int64 `json:"tax_period_id"`
	TaxType        string `json:"tax_type" binding:"required"` // vat, wht, other
	MoneyAccountID int64  `json:"money_account_id" binding:"required"`
	AmountMinor    int64  `json:"amount_minor"`
	Amount         string `json:"amount"`
	Currency       string `json:"currency"`
	PaymentDate    string `json:"payment_date" binding:"required"`
	Reference      string `json:"reference"`
	EvidenceKey    string `json:"evidence_key"`
	Notes          string `json:"notes"`
	IdempotencyKey string `json:"idempotency_key"`
}

func (s *Service) RecordTaxPayment(ctx context.Context, workspaceID, userID int64, idempKey string, in RecordTaxPaymentInput) (db.TaxPayment, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	payDate, err := parseDateStrict(in.PaymentDate)
	if err != nil {
		return db.TaxPayment{}, err
	}
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exp := int32(CurrencyExponent(currency))

	if idempKey != "" {
		existing, err := s.queries.GetTaxPaymentByIdempotency(ctx, db.GetTaxPaymentByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			return existing, nil
		}
		if !isNoRows(err) {
			return db.TaxPayment{}, err
		}
	}

	amountMinor, err := resolveAmountMinor(in.Amount, in.AmountMinor, currency)
	if err != nil {
		return db.TaxPayment{}, err
	}
	if amountMinor <= 0 {
		return db.TaxPayment{}, errors.New("tax payment amount must be positive")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.TaxPayment{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	acc, err := qtx.GetMoneyAccountForUpdate(ctx, db.GetMoneyAccountForUpdateParams{
		ID:          in.MoneyAccountID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return db.TaxPayment{}, ErrForbiddenAccount
	}
	if err != nil {
		return db.TaxPayment{}, err
	}
	if !acc.IsActive {
		return db.TaxPayment{}, ErrAccountArchived
	}
	if acc.Currency != currency {
		return db.TaxPayment{}, ErrAccountCurrencyMismatch
	}

	mt, err := qtx.CreateMoneyTransaction(ctx, db.CreateMoneyTransactionParams{
		WorkspaceID:      workspaceID,
		Direction:        "money_out",
		Status:           "posted",
		AmountMinor:      amountMinor,
		Currency:         currency,
		CurrencyExponent: exp,
		EffectiveDate:    pgtype.Date{Time: payDate, Valid: true},
		MoneyAccountID:   pgtype.Int8{Int64: acc.ID, Valid: true},
		Purpose:          "tax_payment",
		Notes:            optionalPgText(in.Notes),
		Reference:        optionalPgText(in.Reference),
		CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
		PostedAt:         pgtype.Timestamptz{Time: payDate, Valid: true},
	})
	if err != nil {
		return db.TaxPayment{}, err
	}

	if _, err := qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
		ID:                  acc.ID,
		WorkspaceID:         workspaceID,
		CurrentBalanceMinor: -amountMinor,
	}); err != nil {
		return db.TaxPayment{}, err
	}

	le, err := postBalancedLedgerTx(
		ctx, qtx, workspaceID, "tax_payment", mt.ID, payDate,
		currency, exp, fmt.Sprintf("Tax payment (%s)", strings.ToUpper(in.TaxType)),
		[]ledgerPostingLine{
			{AccountClass: "liability", DebitMinor: amountMinor, Description: "Reduce tax payable"},
			{AccountID: &acc.ID, AccountClass: accountBalanceClass(acc.AccountType), CreditMinor: amountMinor, Description: "Tax payment cash out"},
		},
	)
	if err != nil {
		return db.TaxPayment{}, err
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}
	tp, err := qtx.CreateTaxPayment(ctx, db.CreateTaxPaymentParams{
		WorkspaceID:        workspaceID,
		TaxPeriodID:        pgInt8Ptr(in.TaxPeriodID),
		TaxType:            strings.ToLower(strings.TrimSpace(in.TaxType)),
		MoneyAccountID:     acc.ID,
		AmountMinor:        amountMinor,
		Currency:           currency,
		CurrencyExponent:   exp,
		PaymentDate:        pgtype.Date{Time: payDate, Valid: true},
		Reference:          optionalPgText(in.Reference),
		EvidenceKey:        optionalPgText(in.EvidenceKey),
		Notes:              optionalPgText(in.Notes),
		MoneyTransactionID: pgtype.Int8{Int64: mt.ID, Valid: true},
		LedgerEntryID:      pgtype.Int8{Int64: le.ID, Valid: true},
		IdempotencyKey:     idempParam,
		CreatedByUserID:    pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return db.TaxPayment{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return db.TaxPayment{}, err
	}
	return tp, nil
}

// ==================== Accounting Periods & Close ====================

type CreateAccountingPeriodInput struct {
	Name              string `json:"name" binding:"required"`
	StartDate         string `json:"start_date" binding:"required"`
	EndDate           string `json:"end_date" binding:"required"`
	ReportingCurrency string `json:"reporting_currency"`
}

func (s *Service) CreateAccountingPeriod(ctx context.Context, workspaceID int64, in CreateAccountingPeriodInput) (db.AccountingPeriod, error) {
	start, err := parseDateStrict(in.StartDate)
	if err != nil {
		return db.AccountingPeriod{}, err
	}
	end, err := parseDateStrict(in.EndDate)
	if err != nil {
		return db.AccountingPeriod{}, err
	}
	if end.Before(start) {
		return db.AccountingPeriod{}, errors.New("end_date must be on or after start_date")
	}
	curr := strings.ToUpper(strings.TrimSpace(in.ReportingCurrency))
	if curr == "" {
		curr = "NGN"
	}
	return s.queries.CreateAccountingPeriod(ctx, db.CreateAccountingPeriodParams{
		WorkspaceID:       workspaceID,
		Name:              strings.TrimSpace(in.Name),
		StartDate:         pgtype.Date{Time: start, Valid: true},
		EndDate:           pgtype.Date{Time: end, Valid: true},
		Status:            "open",
		ReportingCurrency: curr,
	})
}

type PeriodCloseChecklistResult struct {
	Run    db.PeriodCloseRun     `json:"run"`
	Checks []db.PeriodCloseCheck `json:"checks"`
}

func (s *Service) RunPeriodCloseChecklist(ctx context.Context, workspaceID, userID, periodID int64) (PeriodCloseChecklistResult, error) {
	return s.runPeriodCloseChecklistWithQueries(ctx, s.queries, workspaceID, userID, periodID)
}

func (s *Service) runPeriodCloseChecklistWithQueries(ctx context.Context, q *db.Queries, workspaceID, userID, periodID int64) (PeriodCloseChecklistResult, error) {
	period, err := q.GetAccountingPeriodByID(ctx, db.GetAccountingPeriodByIDParams{
		ID:          periodID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return PeriodCloseChecklistResult{}, ErrNotFound
	}
	if err != nil {
		return PeriodCloseChecklistResult{}, err
	}

	tb, err := s.GenerateReport(ctx, workspaceID, "trial_balance",
		period.StartDate.Time.Format("2006-01-02"),
		period.EndDate.Time.Format("2006-01-02"),
		period.ReportingCurrency)
	if err != nil {
		return PeriodCloseChecklistResult{}, err
	}

	recon, err := s.RunSubledgerReconciliation(ctx, workspaceID, userID, period.EndDate.Time.Format("2006-01-02"))
	if err != nil {
		return PeriodCloseChecklistResult{}, err
	}

	type checkItem struct {
		key      string
		label    string
		severity string
		passed   bool
		detail   string
		diff     int64
	}
	var items []checkItem

	items = append(items, checkItem{
		key:      "trial_balance",
		label:    "Trial Balance debits == credits",
		severity: "critical",
		passed:   tb.InvariantPassed,
		detail:   fmt.Sprintf("Dr %s / Cr %s", tb.Totals["closing_debit_minor"], tb.Totals["closing_credit_minor"]),
	})

	for _, d := range recon.Differences {
		sev := "warning"
		if d.SubledgerName == "Accounts Receivable" || d.SubledgerName == "Accounts Payable" || d.SubledgerName == "Inventory" {
			sev = "critical"
		}
		items = append(items, checkItem{
			key:      "recon_" + strings.ToLower(strings.ReplaceAll(d.SubledgerName, " ", "_")),
			label:    d.SubledgerName + " GL reconciliation",
			severity: sev,
			passed:   d.Status == "matched",
			detail:   d.Details.String,
			diff:     d.DifferenceMinor,
		})
	}

	var failedJobs int64
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*)::bigint FROM outbox_jobs WHERE status = 'failed' AND payload->>'workspace_id' = $1`, fmt.Sprint(workspaceID)).Scan(&failedJobs)
	items = append(items, checkItem{
		key:      "failed_jobs",
		label:    "Failed background posting/export jobs",
		severity: "warning",
		passed:   failedJobs == 0,
		detail:   fmt.Sprintf("%d failed job(s)", failedJobs),
		diff:     failedJobs,
	})

	var critFails, warns int32
	for _, it := range items {
		if !it.passed {
			if it.severity == "critical" {
				critFails++
			} else {
				warns++
			}
		}
	}
	status := "passed"
	if critFails > 0 {
		status = "blocked"
	}

	run, err := q.CreatePeriodCloseRun(ctx, db.CreatePeriodCloseRunParams{
		WorkspaceID:        workspaceID,
		AccountingPeriodID: period.ID,
		Status:             status,
		CriticalFailures:   critFails,
		WarningsCount:      warns,
		Summary:            pgtype.Text{String: fmt.Sprintf("%d critical failures, %d warnings", critFails, warns), Valid: true},
		RunByUserID:        pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return PeriodCloseChecklistResult{}, err
	}

	checks := make([]db.PeriodCloseCheck, 0, len(items))
	for _, it := range items {
		chk, err := q.CreatePeriodCloseCheck(ctx, db.CreatePeriodCloseCheckParams{
			CloseRunID:      run.ID,
			WorkspaceID:     workspaceID,
			CheckKey:        it.key,
			Label:           it.label,
			Severity:        it.severity,
			Passed:          it.passed,
			Detail:          it.detail,
			DifferenceMinor: it.diff,
		})
		if err != nil {
			return PeriodCloseChecklistResult{}, err
		}
		checks = append(checks, chk)
	}

	return PeriodCloseChecklistResult{Run: run, Checks: checks}, nil
}

func (s *Service) CloseAccountingPeriod(ctx context.Context, workspaceID, userID, periodID int64) (db.AccountingPeriod, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.AccountingPeriod{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	period, err := qtx.GetAccountingPeriodForUpdate(ctx, db.GetAccountingPeriodForUpdateParams{
		ID:          periodID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return db.AccountingPeriod{}, ErrNotFound
	}
	if err != nil {
		return db.AccountingPeriod{}, err
	}
	if period.Status == "locked" {
		return db.AccountingPeriod{}, ErrPeriodLocked
	}
	if period.Status == "closed" {
		return period, nil
	}

	checklist, err := s.runPeriodCloseChecklistWithQueries(ctx, qtx, workspaceID, userID, periodID)
	if err != nil {
		return db.AccountingPeriod{}, err
	}
	if checklist.Run.CriticalFailures > 0 {
		return db.AccountingPeriod{}, ErrPeriodCloseCheckFailed
	}

	updated, err := qtx.UpdateAccountingPeriodStatus(ctx, db.UpdateAccountingPeriodStatusParams{
		ID:             period.ID,
		WorkspaceID:    workspaceID,
		Status:         "closed",
		ClosedByUserID: pgtype.Int8{Int64: userID, Valid: true},
		ClosedAt:       pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
	if err != nil {
		return db.AccountingPeriod{}, err
	}

	payload, _ := json.Marshal(map[string]any{"period_id": period.ID, "close_run_id": checklist.Run.ID})
	if _, err := tx.Exec(ctx, `INSERT INTO audit_events (workspace_id, actor_user_id, event_type, subject_type, subject_id, metadata) VALUES ($1, $2, 'period_closed', 'accounting_period', $3, $4)`,
		workspaceID, userID, strconv.FormatInt(period.ID, 10), payload); err != nil {
		return db.AccountingPeriod{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return db.AccountingPeriod{}, err
	}
	return updated, nil
}

func (s *Service) LockAccountingPeriod(ctx context.Context, workspaceID, userID, periodID int64) (db.AccountingPeriod, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.AccountingPeriod{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	period, err := qtx.GetAccountingPeriodForUpdate(ctx, db.GetAccountingPeriodForUpdateParams{
		ID:          periodID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return db.AccountingPeriod{}, ErrNotFound
	}
	if err != nil {
		return db.AccountingPeriod{}, err
	}
	if period.Status != "closed" && period.Status != "locked" {
		return db.AccountingPeriod{}, errors.New("period must be closed before locking")
	}
	if period.Status == "locked" {
		return period, nil
	}

	updated, err := qtx.UpdateAccountingPeriodStatus(ctx, db.UpdateAccountingPeriodStatusParams{
		ID:             period.ID,
		WorkspaceID:    workspaceID,
		Status:         "locked",
		LockedByUserID: pgtype.Int8{Int64: userID, Valid: true},
		LockedAt:       pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
	if err != nil {
		return db.AccountingPeriod{}, err
	}

	payload, _ := json.Marshal(map[string]any{"period_id": period.ID})
	if _, err := tx.Exec(ctx, `INSERT INTO audit_events (workspace_id, actor_user_id, event_type, subject_type, subject_id, metadata) VALUES ($1, $2, 'period_locked', 'accounting_period', $3, $4)`,
		workspaceID, userID, strconv.FormatInt(period.ID, 10), payload); err != nil {
		return db.AccountingPeriod{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return db.AccountingPeriod{}, err
	}
	return updated, nil
}

func (s *Service) ReopenAccountingPeriod(ctx context.Context, workspaceID, userID, periodID int64, reason string) (db.AccountingPeriod, error) {
	if strings.TrimSpace(reason) == "" {
		return db.AccountingPeriod{}, errors.New("reopen reason is required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.AccountingPeriod{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	period, err := qtx.GetAccountingPeriodForUpdate(ctx, db.GetAccountingPeriodForUpdateParams{
		ID:          periodID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return db.AccountingPeriod{}, ErrNotFound
	}
	if err != nil {
		return db.AccountingPeriod{}, err
	}
	if period.Status == "locked" {
		return db.AccountingPeriod{}, ErrPeriodLocked
	}

	updated, err := qtx.UpdateAccountingPeriodStatus(ctx, db.UpdateAccountingPeriodStatusParams{
		ID:               period.ID,
		WorkspaceID:      workspaceID,
		Status:           "open",
		ReopenedByUserID: pgtype.Int8{Int64: userID, Valid: true},
		ReopenedAt:       pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		ReopenReason:     pgtype.Text{String: reason, Valid: true},
	})
	if err != nil {
		return db.AccountingPeriod{}, err
	}

	payload, _ := json.Marshal(map[string]any{"period_id": period.ID, "reason": reason})
	if _, err := tx.Exec(ctx, `INSERT INTO audit_events (workspace_id, actor_user_id, event_type, subject_type, subject_id, metadata) VALUES ($1, $2, 'period_reopened', 'accounting_period', $3, $4)`,
		workspaceID, userID, strconv.FormatInt(period.ID, 10), payload); err != nil {
		return db.AccountingPeriod{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return db.AccountingPeriod{}, err
	}
	return updated, nil
}

// ==================== Projection Rebuilds ====================

func (s *Service) RunProjectionRebuild(ctx context.Context, workspaceID, userID int64, idempKey, scope string) (db.ProjectionRebuildRun, error) {
	if scope == "" {
		scope = "all"
	}
	if idempKey != "" {
		existing, err := s.queries.GetProjectionRebuildByIdempotency(ctx, db.GetProjectionRebuildByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			return existing, nil
		}
		if !isNoRows(err) {
			return db.ProjectionRebuildRun{}, err
		}
	}

	beforeSub, err := s.queries.GetSubledgerBalances(ctx, workspaceID)
	if err != nil {
		return db.ProjectionRebuildRun{}, err
	}
	beforeJSON, _ := json.Marshal(beforeSub)

	// Verify authoritative journals balance without mutating any journal entries
	var unbalanced int64
	if err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM (
			SELECT ledger_entry_id FROM ledger_lines
			WHERE workspace_id = $1
			GROUP BY ledger_entry_id
			HAVING SUM(debit_minor) <> SUM(credit_minor)
		) bad`, workspaceID).Scan(&unbalanced); err != nil {
		return db.ProjectionRebuildRun{}, err
	}

	afterSub, err := s.queries.GetSubledgerBalances(ctx, workspaceID)
	if err != nil {
		return db.ProjectionRebuildRun{}, err
	}
	afterJSON, _ := json.Marshal(afterSub)

	verified := unbalanced == 0
	status := "completed"
	var errMsg pgtype.Text
	if !verified {
		status = "failed"
		errMsg = pgtype.Text{String: fmt.Sprintf("%d unbalanced ledger entries detected", unbalanced), Valid: true}
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}
	return s.queries.CreateProjectionRebuildRun(ctx, db.CreateProjectionRebuildRunParams{
		WorkspaceID:     workspaceID,
		Scope:           scope,
		Status:          status,
		BeforeSnapshot:  beforeJSON,
		AfterSnapshot:   afterJSON,
		Verified:        verified,
		ErrorMessage:    errMsg,
		IdempotencyKey:  idempParam,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
}
