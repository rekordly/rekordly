-- Blueprint 11: Chart of Accounts, Journal Engine, Subledger Reconciliation, Reports, Tax & Period Close

-- ==================== Chart of Accounts & Mappings ====================

-- name: CreateChartAccount :one
INSERT INTO chart_accounts (
    workspace_id, code, name, account_class, subtype, parent_id,
    currency_restriction, is_system, is_control, control_subledger,
    is_active, template_version, description
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10,
    $11, $12, $13
) RETURNING *;

-- name: GetChartAccountByID :one
SELECT * FROM chart_accounts
WHERE id = $1 AND workspace_id = $2;

-- name: GetChartAccountByCode :one
SELECT * FROM chart_accounts
WHERE workspace_id = $1 AND code = $2;

-- name: ListChartAccounts :many
SELECT * FROM chart_accounts
WHERE workspace_id = $1
  AND (sqlc.narg('is_active')::boolean IS NULL OR is_active = sqlc.narg('is_active'))
  AND (sqlc.narg('account_class')::text IS NULL OR account_class = sqlc.narg('account_class'))
ORDER BY code ASC, id ASC;

-- name: UpdateChartAccount :one
UPDATE chart_accounts
SET name = $3,
    parent_id = $4,
    description = $5,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: ArchiveChartAccount :one
UPDATE chart_accounts
SET is_active = false,
    archived_at = now(),
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND is_system = false AND is_control = false
RETURNING *;

-- name: UpsertAccountMapping :one
INSERT INTO account_mappings (workspace_id, mapping_key, chart_account_id, updated_by_user_id)
VALUES ($1, $2, $3, $4)
ON CONFLICT (workspace_id, mapping_key)
DO UPDATE SET chart_account_id = EXCLUDED.chart_account_id,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              updated_at = now()
RETURNING *;

-- name: GetAccountMappingByKey :one
SELECT am.*, ca.code AS account_code, ca.name AS account_name, ca.account_class, ca.is_control
FROM account_mappings am
JOIN chart_accounts ca ON ca.id = am.chart_account_id AND ca.workspace_id = am.workspace_id
WHERE am.workspace_id = $1 AND am.mapping_key = $2;

-- name: ListAccountMappings :many
SELECT am.*, ca.code AS account_code, ca.name AS account_name, ca.account_class
FROM account_mappings am
JOIN chart_accounts ca ON ca.id = am.chart_account_id AND ca.workspace_id = am.workspace_id
WHERE am.workspace_id = $1
ORDER BY am.mapping_key ASC;

-- ==================== Posting Templates ====================

-- name: GetActivePostingTemplate :one
SELECT * FROM posting_template_versions
WHERE template_key = $1 AND is_active = true
ORDER BY id DESC
LIMIT 1;

-- name: ListPostingTemplates :many
SELECT * FROM posting_template_versions
WHERE is_active = true
ORDER BY template_key ASC;

-- ==================== Journal Engine & Drill-Down ====================

-- name: CreateEngineLedgerEntry :one
INSERT INTO ledger_entries (
    workspace_id, source_type, source_id, entry_date, currency, currency_exponent,
    description, template_key, template_version, status, reversal_of_entry_id,
    accounting_period_id, outlet_id, posted_by_user_id, idempotency_key
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12, $13, $14, $15
) RETURNING *;

-- name: CreateEngineLedgerLine :one
INSERT INTO ledger_lines (
    ledger_entry_id, workspace_id, account_id, chart_account_id, account_class,
    debit_minor, credit_minor, description, party_id, outlet_id, tax_code_id, dimension_tags
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10, $11, $12
) RETURNING *;

-- name: GetEngineLedgerEntryByID :one
SELECT * FROM ledger_entries
WHERE id = $1 AND workspace_id = $2;

-- name: GetEngineLedgerEntryForUpdate :one
SELECT * FROM ledger_entries
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: GetEngineLedgerEntryByIdempotency :one
SELECT * FROM ledger_entries
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: MarkEngineLedgerEntryReversed :one
UPDATE ledger_entries
SET is_reversed = true,
    status = 'reversed',
    reversed_by_entry_id = $3
WHERE id = $1 AND workspace_id = $2 AND is_reversed = false
RETURNING *;

-- name: ListLedgerLinesByEntry :many
SELECT ll.*,
       ca.code AS chart_account_code,
       ca.name AS chart_account_name,
       ma.name AS money_account_name
FROM ledger_lines ll
LEFT JOIN chart_accounts ca ON ca.id = ll.chart_account_id AND ca.workspace_id = ll.workspace_id
LEFT JOIN money_accounts ma ON ma.id = ll.account_id AND ma.workspace_id = ll.workspace_id
WHERE ll.workspace_id = $1 AND ll.ledger_entry_id = $2
ORDER BY ll.id ASC;

-- name: ListJournalsCursor :many
SELECT le.*
FROM ledger_entries le
WHERE le.workspace_id = $1
  AND (sqlc.narg('from_date')::date IS NULL OR le.entry_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR le.entry_date <= sqlc.narg('to_date'))
  AND (sqlc.narg('source_type')::text IS NULL OR le.source_type = sqlc.narg('source_type'))
  AND (sqlc.narg('period_id')::bigint IS NULL OR le.accounting_period_id = sqlc.narg('period_id'))
  AND (sqlc.narg('outlet_id')::bigint IS NULL OR le.outlet_id = sqlc.narg('outlet_id'))
  AND (
      sqlc.narg('chart_account_id')::bigint IS NULL
      OR EXISTS (
          SELECT 1 FROM ledger_lines ll
          WHERE ll.ledger_entry_id = le.id AND ll.workspace_id = le.workspace_id AND ll.chart_account_id = sqlc.narg('chart_account_id')
      )
  )
  AND (
      sqlc.narg('cursor_date')::date IS NULL
      OR (le.entry_date, le.id) < (sqlc.narg('cursor_date')::date, sqlc.narg('cursor_id')::bigint)
  )
ORDER BY le.entry_date DESC, le.id DESC
LIMIT $2;

-- ==================== Financial Reports (Trial Balance, P&L, Balance Sheet) ====================

-- name: GetTrialBalanceByChartAccount :many
SELECT
    ca.id AS chart_account_id,
    ca.code,
    ca.name,
    ca.account_class,
    ca.subtype,
    ca.is_control,
    COALESCE(SUM(CASE WHEN le.entry_date < sqlc.arg('from_date')::date THEN ll.debit_minor ELSE 0 END), 0)::bigint AS opening_debit_minor,
    COALESCE(SUM(CASE WHEN le.entry_date < sqlc.arg('from_date')::date THEN ll.credit_minor ELSE 0 END), 0)::bigint AS opening_credit_minor,
    COALESCE(SUM(CASE WHEN le.entry_date >= sqlc.arg('from_date')::date AND le.entry_date <= sqlc.arg('to_date')::date THEN ll.debit_minor ELSE 0 END), 0)::bigint AS period_debit_minor,
    COALESCE(SUM(CASE WHEN le.entry_date >= sqlc.arg('from_date')::date AND le.entry_date <= sqlc.arg('to_date')::date THEN ll.credit_minor ELSE 0 END), 0)::bigint AS period_credit_minor,
    COALESCE(SUM(CASE WHEN le.entry_date <= sqlc.arg('to_date')::date THEN ll.debit_minor ELSE 0 END), 0)::bigint AS closing_debit_minor,
    COALESCE(SUM(CASE WHEN le.entry_date <= sqlc.arg('to_date')::date THEN ll.credit_minor ELSE 0 END), 0)::bigint AS closing_credit_minor
FROM chart_accounts ca
LEFT JOIN ledger_lines ll ON ll.chart_account_id = ca.id AND ll.workspace_id = ca.workspace_id
LEFT JOIN ledger_entries le ON le.id = ll.ledger_entry_id AND le.workspace_id = ll.workspace_id AND le.currency = sqlc.arg('currency')::text
WHERE ca.workspace_id = $1
GROUP BY ca.id, ca.code, ca.name, ca.account_class, ca.subtype, ca.is_control
ORDER BY ca.code ASC;

-- name: GetLedgerClassTotalsAsOf :many
SELECT
    ll.account_class,
    COALESCE(SUM(ll.debit_minor), 0)::bigint AS total_debit_minor,
    COALESCE(SUM(ll.credit_minor), 0)::bigint AS total_credit_minor
FROM ledger_lines ll
JOIN ledger_entries le ON le.id = ll.ledger_entry_id AND le.workspace_id = ll.workspace_id
WHERE ll.workspace_id = $1
  AND le.currency = sqlc.arg('currency')::text
  AND le.entry_date <= sqlc.arg('as_of_date')::date
GROUP BY ll.account_class;

-- name: GetLedgerClassTotalsPeriod :many
SELECT
    ll.account_class,
    COALESCE(SUM(ll.debit_minor), 0)::bigint AS total_debit_minor,
    COALESCE(SUM(ll.credit_minor), 0)::bigint AS total_credit_minor
FROM ledger_lines ll
JOIN ledger_entries le ON le.id = ll.ledger_entry_id AND le.workspace_id = ll.workspace_id
WHERE ll.workspace_id = $1
  AND le.currency = sqlc.arg('currency')::text
  AND le.entry_date >= sqlc.arg('from_date')::date
  AND le.entry_date <= sqlc.arg('to_date')::date
GROUP BY ll.account_class;

-- name: GetARAgingRows :many
SELECT
    i.id,
    i.invoice_number,
    i.customer_name,
    i.issue_date,
    i.due_date,
    i.currency,
    i.currency_exponent,
    i.total_amount_minor,
    i.paid_amount_minor,
    (i.total_amount_minor - i.paid_amount_minor)::bigint AS outstanding_minor
FROM invoices i
WHERE i.workspace_id = $1
  AND i.status IN ('finalized', 'partially_paid', 'overdue')
  AND (i.total_amount_minor - i.paid_amount_minor) > 0
ORDER BY i.due_date ASC NULLS LAST, i.id ASC;

-- name: GetAPAgingRows :many
SELECT
    sb.id,
    sb.supplier_invoice_number AS bill_number,
    c.name AS supplier_name,
    sb.bill_date,
    sb.due_date,
    sb.currency,
    sb.currency_exponent,
    sb.total_minor AS total_amount_minor,
    (sb.total_minor - sb.outstanding_minor)::bigint AS paid_amount_minor,
    sb.outstanding_minor
FROM supplier_bills sb
LEFT JOIN counterparties c ON c.id = sb.supplier_id AND c.workspace_id = sb.workspace_id
WHERE sb.workspace_id = $1
  AND sb.status IN ('approved', 'partially_paid')
  AND sb.outstanding_minor > 0
ORDER BY sb.due_date ASC NULLS LAST, sb.id ASC;

-- ==================== Subledger Reconciliation ====================

-- name: CreateReconciliationRun :one
INSERT INTO reconciliation_runs (workspace_id, as_of_date, status, total_checks, failed_checks, run_by_user_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CreateReconciliationDifference :one
INSERT INTO reconciliation_differences (
    run_id, workspace_id, subledger_name, control_account_id,
    gl_balance_minor, subledger_balance_minor, difference_minor, status, details
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: ListReconciliationRuns :many
SELECT * FROM reconciliation_runs
WHERE workspace_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: ListReconciliationDifferences :many
SELECT * FROM reconciliation_differences
WHERE workspace_id = $1 AND run_id = $2
ORDER BY id ASC;

-- name: GetSubledgerBalances :one
SELECT
    COALESCE((SELECT SUM(i.total_amount_minor - i.paid_amount_minor) FROM invoices i WHERE i.workspace_id = sqlc.arg('workspace_id') AND i.status IN ('finalized', 'partially_paid', 'overdue')), 0)::bigint AS ar_subledger_minor,
    COALESCE((SELECT SUM(sb.outstanding_minor) FROM supplier_bills sb WHERE sb.workspace_id = sqlc.arg('workspace_id') AND sb.status IN ('approved', 'partially_paid')), 0)::bigint AS ap_subledger_minor,
    COALESCE((SELECT SUM(cw.balance_minor) FROM customer_wallets cw WHERE cw.workspace_id = sqlc.arg('workspace_id')), 0)::bigint AS customer_deposits_subledger_minor,
    COALESCE((SELECT SUM(sa.available_minor) FROM supplier_advances sa WHERE sa.workspace_id = sqlc.arg('workspace_id') AND sa.status IN ('open', 'partially_applied')), 0)::bigint AS supplier_advances_subledger_minor,
    COALESCE((SELECT SUM(ib.value_on_hand_minor) FROM inventory_balances ib WHERE ib.workspace_id = sqlc.arg('workspace_id')), 0)::bigint AS inventory_subledger_minor,
    COALESCE((SELECT SUM(l1.outstanding_principal_minor) FROM loans l1 WHERE l1.workspace_id = sqlc.arg('workspace_id') AND l1.direction = 'lent' AND l1.status IN ('active', 'partially_repaid', 'overdue')), 0)::bigint AS loans_receivable_subledger_minor,
    COALESCE((SELECT SUM(l2.outstanding_principal_minor) FROM loans l2 WHERE l2.workspace_id = sqlc.arg('workspace_id') AND l2.direction = 'borrowed' AND l2.status IN ('active', 'partially_repaid', 'overdue')), 0)::bigint AS loans_payable_subledger_minor,
    COALESCE((SELECT SUM(ma.current_balance_minor) FROM money_accounts ma WHERE ma.workspace_id = sqlc.arg('workspace_id') AND ma.is_active = true), 0)::bigint AS cash_accounts_subledger_minor;

-- name: GetChartAccountGLBalance :one
SELECT COALESCE(SUM(ll.debit_minor - ll.credit_minor), 0)::bigint AS net_debit_balance_minor
FROM ledger_lines ll
JOIN ledger_entries le ON le.id = ll.ledger_entry_id AND le.workspace_id = ll.workspace_id
WHERE ll.workspace_id = $1
  AND ll.chart_account_id = $2
  AND le.entry_date <= sqlc.arg('as_of_date')::date;

-- ==================== Accounting Periods & Close ====================

-- name: CreateAccountingPeriod :one
INSERT INTO accounting_periods (workspace_id, name, start_date, end_date, status, reporting_currency)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetAccountingPeriodByID :one
SELECT * FROM accounting_periods
WHERE id = $1 AND workspace_id = $2;

-- name: GetAccountingPeriodForUpdate :one
SELECT * FROM accounting_periods
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: FindAccountingPeriodForDate :one
SELECT * FROM accounting_periods
WHERE workspace_id = $1 AND start_date <= $2 AND end_date >= $2
LIMIT 1;

-- name: FindEarliestOpenPeriodAfter :one
SELECT * FROM accounting_periods
WHERE workspace_id = $1 AND status = 'open' AND end_date >= $2
ORDER BY start_date ASC
LIMIT 1;

-- name: ListAccountingPeriods :many
SELECT * FROM accounting_periods
WHERE workspace_id = $1
ORDER BY start_date DESC, id DESC;

-- name: UpdateAccountingPeriodStatus :one
UPDATE accounting_periods
SET status = $3,
    closed_by_user_id = COALESCE(sqlc.narg('closed_by_user_id'), closed_by_user_id),
    closed_at = COALESCE(sqlc.narg('closed_at'), closed_at),
    locked_by_user_id = COALESCE(sqlc.narg('locked_by_user_id'), locked_by_user_id),
    locked_at = COALESCE(sqlc.narg('locked_at'), locked_at),
    reopened_by_user_id = COALESCE(sqlc.narg('reopened_by_user_id'), reopened_by_user_id),
    reopened_at = COALESCE(sqlc.narg('reopened_at'), reopened_at),
    reopen_reason = COALESCE(sqlc.narg('reopen_reason'), reopen_reason),
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreatePeriodCloseRun :one
INSERT INTO period_close_runs (workspace_id, accounting_period_id, status, critical_failures, warnings_count, summary, run_by_user_id)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: CreatePeriodCloseCheck :one
INSERT INTO period_close_checks (close_run_id, workspace_id, check_key, label, severity, passed, detail, difference_minor)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListPeriodCloseRuns :many
SELECT * FROM period_close_runs
WHERE workspace_id = $1 AND accounting_period_id = $2
ORDER BY created_at DESC, id DESC;

-- name: ListPeriodCloseChecks :many
SELECT * FROM period_close_checks
WHERE workspace_id = $1 AND close_run_id = $2
ORDER BY id ASC;

-- ==================== Manual Journals ====================

-- name: CreateManualJournalDraft :one
INSERT INTO manual_journal_drafts (
    workspace_id, entry_date, currency, currency_exponent,
    description, reference, evidence_key, status, created_by_user_id, idempotency_key
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: CreateManualJournalDraftLine :one
INSERT INTO manual_journal_draft_lines (
    draft_id, workspace_id, chart_account_id, debit_minor, credit_minor, description, outlet_id, party_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetManualJournalDraftByID :one
SELECT * FROM manual_journal_drafts
WHERE id = $1 AND workspace_id = $2;

-- name: GetManualJournalDraftForUpdate :one
SELECT * FROM manual_journal_drafts
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: GetManualJournalDraftByIdempotency :one
SELECT * FROM manual_journal_drafts
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListManualJournalDrafts :many
SELECT * FROM manual_journal_drafts
WHERE workspace_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: ListManualJournalDraftLines :many
SELECT l.*, ca.code AS chart_account_code, ca.name AS chart_account_name, ca.is_control
FROM manual_journal_draft_lines l
JOIN chart_accounts ca ON ca.id = l.chart_account_id AND ca.workspace_id = l.workspace_id
WHERE l.workspace_id = $1 AND l.draft_id = $2
ORDER BY l.id ASC;

-- name: MarkManualJournalPosted :one
UPDATE manual_journal_drafts
SET status = 'posted',
    approved_by_user_id = $3,
    approved_at = now(),
    posted_ledger_entry_id = $4,
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- ==================== Tax Codes, Schedules & Payments ====================

-- name: CreateTaxCode :one
INSERT INTO tax_codes (workspace_id, code, name, tax_type, classification, rate_bps)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListTaxCodes :many
SELECT * FROM tax_codes
WHERE workspace_id = $1 AND is_active = true
ORDER BY tax_type ASC, code ASC;

-- name: CreateTaxScheduleItem :one
INSERT INTO tax_schedule_items (
    workspace_id, tax_period_id, tax_code_id, tax_type, direction,
    source_type, source_id, counterparty_name, certificate_ref,
    taxable_base_minor, tax_amount_minor, rate_bps, effective_date, status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING *;

-- name: ListTaxScheduleItems :many
SELECT * FROM tax_schedule_items
WHERE workspace_id = $1
  AND (sqlc.narg('tax_type')::text IS NULL OR tax_type = sqlc.narg('tax_type'))
  AND (sqlc.narg('from_date')::date IS NULL OR effective_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR effective_date <= sqlc.narg('to_date'))
ORDER BY effective_date DESC, id DESC
LIMIT $2;

-- name: CreateTaxPayment :one
INSERT INTO tax_payments (
    workspace_id, tax_period_id, tax_type, money_account_id, amount_minor,
    currency, currency_exponent, payment_date, reference, evidence_key, notes,
    money_transaction_id, ledger_entry_id, idempotency_key, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
RETURNING *;

-- name: GetTaxPaymentByIdempotency :one
SELECT * FROM tax_payments
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListTaxPayments :many
SELECT * FROM tax_payments
WHERE workspace_id = $1
ORDER BY payment_date DESC, id DESC
LIMIT $2;

-- ==================== Projection Rebuilds & Report Exports ====================

-- name: CreateProjectionRebuildRun :one
INSERT INTO projection_rebuild_runs (
    workspace_id, scope, status, before_snapshot, after_snapshot,
    verified, error_message, idempotency_key, created_by_user_id, completed_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
RETURNING *;

-- name: GetProjectionRebuildByIdempotency :one
SELECT * FROM projection_rebuild_runs
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListProjectionRebuildRuns :many
SELECT * FROM projection_rebuild_runs
WHERE workspace_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: CreateReportExport :one
INSERT INTO report_exports (
    workspace_id, report_type, format, filters, status, row_count, warnings, content_text, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetReportExportByID :one
SELECT * FROM report_exports
WHERE id = $1 AND workspace_id = $2;

-- name: ListReportExports :many
SELECT id, workspace_id, report_type, format, filters, status, row_count, warnings, expires_at, created_by_user_id, created_at
FROM report_exports
WHERE workspace_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;
