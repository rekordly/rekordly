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

type TemplatePostingRequest struct {
	TemplateKey    string `json:"template_key" binding:"required"`
	SourceType     string `json:"source_type" binding:"required"`
	SourceID       int64  `json:"source_id" binding:"required"`
	EntryDate      string `json:"entry_date" binding:"required"`
	Currency       string `json:"currency"`
	AmountMinor    int64  `json:"amount_minor"`
	Amount         string `json:"amount"`
	TaxMinor       int64  `json:"tax_minor"`
	PrincipalMinor int64  `json:"principal_minor"`
	InterestMinor  int64  `json:"interest_minor"`
	FeeMinor       int64  `json:"fee_minor"`
	MoneyAccountID *int64 `json:"money_account_id"`
	OutletID       *int64 `json:"outlet_id"`
	PartyID        *int64 `json:"party_id"`
	Description    string `json:"description"`
	AllowNextOpen  bool   `json:"allow_next_open_period"`
}

type ProposedJournalLine struct {
	ChartAccountID   int64  `json:"chart_account_id"`
	ChartAccountCode string `json:"chart_account_code"`
	ChartAccountName string `json:"chart_account_name"`
	AccountClass     string `json:"account_class"`
	MoneyAccountID   *int64 `json:"money_account_id,omitempty"`
	DebitMinor       int64  `json:"debit_minor,string"`
	CreditMinor      int64  `json:"credit_minor,string"`
	Description      string `json:"description"`
}

type PostingPreviewResult struct {
	TemplateKey      string                `json:"template_key"`
	TemplateVersion  string                `json:"template_version"`
	EntryDate        string                `json:"entry_date"`
	Currency         string                `json:"currency"`
	PeriodID         *int64                `json:"accounting_period_id,omitempty"`
	Lines            []ProposedJournalLine `json:"lines"`
	TotalDebitMinor  int64                 `json:"total_debit_minor,string"`
	TotalCreditMinor int64                 `json:"total_credit_minor,string"`
}

type JournalDetail struct {
	Entry       db.LedgerEntry                 `json:"entry"`
	Lines       []db.ListLedgerLinesByEntryRow `json:"lines"`
	SourceLink  string                         `json:"source_link"`
	TotalDebit  int64                          `json:"total_debit_minor,string"`
	TotalCredit int64                          `json:"total_credit_minor,string"`
}

func (s *Service) resolveMappedChartAccount(ctx context.Context, qtx *db.Queries, workspaceID int64, mappingKey string) (db.GetAccountMappingByKeyRow, error) {
	row, err := qtx.GetAccountMappingByKey(ctx, db.GetAccountMappingByKeyParams{
		WorkspaceID: workspaceID,
		MappingKey:  mappingKey,
	})
	if isNoRows(err) {
		return db.GetAccountMappingByKeyRow{}, fmt.Errorf("%w: %s", ErrAccountMappingMissing, mappingKey)
	}
	return row, err
}

func (s *Service) validatePeriodForDateTx(ctx context.Context, qtx *db.Queries, workspaceID int64, entryDate time.Time, allowNextOpen bool) (*db.AccountingPeriod, time.Time, error) {
	p, err := qtx.FindAccountingPeriodForDate(ctx, db.FindAccountingPeriodForDateParams{
		WorkspaceID: workspaceID,
		StartDate:   pgtype.Date{Time: entryDate, Valid: true},
	})
	if isNoRows(err) {
		return nil, entryDate, nil
	}
	if err != nil {
		return nil, entryDate, err
	}
	switch p.Status {
	case "open", "soft_closed":
		return &p, entryDate, nil
	case "closed":
		if allowNextOpen {
			next, err := qtx.FindEarliestOpenPeriodAfter(ctx, db.FindEarliestOpenPeriodAfterParams{
				WorkspaceID: workspaceID,
				EndDate:     pgtype.Date{Time: entryDate, Valid: true},
			})
			if err == nil {
				return &next, next.StartDate.Time, nil
			}
		}
		return nil, entryDate, ErrPeriodClosed
	case "locked":
		if allowNextOpen {
			next, err := qtx.FindEarliestOpenPeriodAfter(ctx, db.FindEarliestOpenPeriodAfterParams{
				WorkspaceID: workspaceID,
				EndDate:     pgtype.Date{Time: entryDate, Valid: true},
			})
			if err == nil {
				return &next, next.StartDate.Time, nil
			}
		}
		return nil, entryDate, ErrPeriodLocked
	default:
		return &p, entryDate, nil
	}
}

func (s *Service) buildTemplateLines(ctx context.Context, qtx *db.Queries, workspaceID int64, req TemplatePostingRequest, totalMinor int64) ([]ProposedJournalLine, string, error) {
	tmpl, err := qtx.GetActivePostingTemplate(ctx, req.TemplateKey)
	if isNoRows(err) {
		return nil, "", fmt.Errorf("unknown posting template: %s", req.TemplateKey)
	}
	if err != nil {
		return nil, "", err
	}

	addLine := func(mappingKey string, debit, credit int64, desc string, moneyAccID *int64) (ProposedJournalLine, error) {
		m, err := s.resolveMappedChartAccount(ctx, qtx, workspaceID, mappingKey)
		if err != nil {
			return ProposedJournalLine{}, err
		}
		return ProposedJournalLine{
			ChartAccountID:   m.ChartAccountID,
			ChartAccountCode: m.AccountCode,
			ChartAccountName: m.AccountName,
			AccountClass:     m.AccountClass,
			MoneyAccountID:   moneyAccID,
			DebitMinor:       debit,
			CreditMinor:      credit,
			Description:      desc,
		}, nil
	}

	var lines []ProposedJournalLine
	appendIf := func(mappingKey string, debit, credit int64, desc string, moneyAccID *int64) error {
		if debit == 0 && credit == 0 {
			return nil
		}
		l, err := addLine(mappingKey, debit, credit, desc, moneyAccID)
		if err != nil {
			return err
		}
		lines = append(lines, l)
		return nil
	}

	switch req.TemplateKey {
	case "personal_expense":
		if err := appendIf("operating_expense", totalMinor, 0, "Personal expense", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("cash_default", 0, totalMinor, "Cash paid", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
	case "business_cash_sale":
		net := totalMinor - req.TaxMinor
		if err := appendIf("cash_default", totalMinor, 0, "Cash sale received", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
		if err := appendIf("sales_revenue", 0, net, "Sales revenue", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("vat_payable", 0, req.TaxMinor, "Output VAT", nil); err != nil {
			return nil, "", err
		}
	case "service_invoice":
		net := totalMinor - req.TaxMinor
		if err := appendIf("ar_control", totalMinor, 0, "Accounts receivable", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("service_revenue", 0, net, "Service revenue", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("vat_payable", 0, req.TaxMinor, "Output VAT", nil); err != nil {
			return nil, "", err
		}
	case "invoice_collection":
		if err := appendIf("cash_default", totalMinor, 0, "Invoice collection", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
		if err := appendIf("ar_control", 0, totalMinor, "Clear AR", nil); err != nil {
			return nil, "", err
		}
	case "customer_deposit":
		if err := appendIf("cash_default", totalMinor, 0, "Customer deposit received", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
		if err := appendIf("customer_deposits", 0, totalMinor, "Customer deposit liability", nil); err != nil {
			return nil, "", err
		}
	case "deposit_application":
		if err := appendIf("customer_deposits", totalMinor, 0, "Apply customer deposit", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("ar_control", 0, totalMinor, "Reduce AR", nil); err != nil {
			return nil, "", err
		}
	case "goods_receipt_grni":
		if err := appendIf("inventory_control", totalMinor, 0, "Inventory received", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("grni", 0, totalMinor, "GRNI accrued liability", nil); err != nil {
			return nil, "", err
		}
	case "approved_supplier_bill":
		net := totalMinor - req.TaxMinor
		if err := appendIf("grni", net, 0, "Clear GRNI", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("vat_recoverable", req.TaxMinor, 0, "Input VAT", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("ap_control", 0, totalMinor, "Accounts payable", nil); err != nil {
			return nil, "", err
		}
	case "supplier_bill_payment":
		if err := appendIf("ap_control", totalMinor, 0, "Settle accounts payable", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("cash_default", 0, totalMinor, "Cash paid to supplier", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
	case "inventory_sale_cogs":
		if err := appendIf("cogs", totalMinor, 0, "Cost of goods sold", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("inventory_control", 0, totalMinor, "Inventory issued", nil); err != nil {
			return nil, "", err
		}
	case "stock_adjustment":
		if err := appendIf("inventory_adjustment", totalMinor, 0, "Stock adjustment loss", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("inventory_control", 0, totalMinor, "Inventory adjustment", nil); err != nil {
			return nil, "", err
		}
	case "owner_capital":
		if err := appendIf("cash_default", totalMinor, 0, "Owner capital contribution", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
		if err := appendIf("owner_capital", 0, totalMinor, "Owner capital equity", nil); err != nil {
			return nil, "", err
		}
	case "owner_drawings":
		if err := appendIf("owner_drawings", totalMinor, 0, "Owner drawing", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("cash_default", 0, totalMinor, "Cash paid for drawing", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
	case "loan_borrowed":
		if err := appendIf("cash_default", totalMinor, 0, "Loan proceeds received", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
		if err := appendIf("loans_payable", 0, totalMinor, "Loan payable", nil); err != nil {
			return nil, "", err
		}
	case "loan_repayment":
		prin := req.PrincipalMinor
		if prin == 0 && req.InterestMinor == 0 && req.FeeMinor == 0 {
			prin = totalMinor
		}
		if err := appendIf("loans_payable", prin, 0, "Loan principal repaid", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("interest_expense", req.InterestMinor+req.FeeMinor, 0, "Loan interest & fees", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("cash_default", 0, prin+req.InterestMinor+req.FeeMinor, "Loan repayment cash out", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
	case "investment_purchase":
		if err := appendIf("investments", totalMinor, 0, "Investment acquisition", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("cash_default", 0, totalMinor, "Cash paid for investment", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
	case "investment_sale":
		if err := appendIf("cash_default", totalMinor, 0, "Investment disposal proceeds", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
		if err := appendIf("investments", 0, totalMinor, "Remove investment basis", nil); err != nil {
			return nil, "", err
		}
	case "asset_purchase":
		if err := appendIf("personal_assets", totalMinor, 0, "Asset acquisition", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("cash_default", 0, totalMinor, "Cash paid for asset", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
	case "asset_disposal":
		if err := appendIf("cash_default", totalMinor, 0, "Asset disposal proceeds", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
		if err := appendIf("personal_assets", 0, totalMinor, "Remove asset basis", nil); err != nil {
			return nil, "", err
		}
	case "tax_payment":
		if err := appendIf("vat_payable", totalMinor, 0, "Tax liability remittance", nil); err != nil {
			return nil, "", err
		}
		if err := appendIf("cash_default", 0, totalMinor, "Tax payment cash out", req.MoneyAccountID); err != nil {
			return nil, "", err
		}
	default:
		return nil, "", fmt.Errorf("template %s requires explicit line builder", req.TemplateKey)
	}

	return lines, tmpl.Version, nil
}

func (s *Service) PreviewTemplatePosting(ctx context.Context, workspaceID int64, req TemplatePostingRequest) (PostingPreviewResult, error) {
	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "NGN"
	}
	totalMinor, err := resolveAmountMinor(req.Amount, req.AmountMinor, currency)
	if err != nil {
		return PostingPreviewResult{}, err
	}
	if totalMinor <= 0 {
		return PostingPreviewResult{}, ErrJournalUnbalanced
	}
	entryDate, err := parseDateStrict(req.EntryDate)
	if err != nil {
		return PostingPreviewResult{}, err
	}

	period, effDate, err := s.validatePeriodForDateTx(ctx, s.queries, workspaceID, entryDate, req.AllowNextOpen)
	if err != nil {
		return PostingPreviewResult{}, err
	}
	lines, version, err := s.buildTemplateLines(ctx, s.queries, workspaceID, req, totalMinor)
	if err != nil {
		return PostingPreviewResult{}, err
	}

	var sumD, sumC int64
	for _, l := range lines {
		sumD += l.DebitMinor
		sumC += l.CreditMinor
	}
	if sumD <= 0 || sumD != sumC {
		return PostingPreviewResult{}, ErrJournalUnbalanced
	}

	var periodID *int64
	if period != nil {
		periodID = &period.ID
	}

	return PostingPreviewResult{
		TemplateKey:      req.TemplateKey,
		TemplateVersion:  version,
		EntryDate:        effDate.Format("2006-01-02"),
		Currency:         currency,
		PeriodID:         periodID,
		Lines:            lines,
		TotalDebitMinor:  sumD,
		TotalCreditMinor: sumC,
	}, nil
}

func (s *Service) PostFromTemplate(ctx context.Context, workspaceID, userID int64, idempKey string, req TemplatePostingRequest) (JournalDetail, error) {
	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exp := int32(CurrencyExponent(currency))
	totalMinor, err := resolveAmountMinor(req.Amount, req.AmountMinor, currency)
	if err != nil {
		return JournalDetail{}, err
	}
	if totalMinor <= 0 {
		return JournalDetail{}, ErrJournalUnbalanced
	}
	entryDate, err := parseDateStrict(req.EntryDate)
	if err != nil {
		return JournalDetail{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return JournalDetail{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if idempKey != "" {
		existing, err := qtx.GetEngineLedgerEntryByIdempotency(ctx, db.GetEngineLedgerEntryByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			tx.Rollback(ctx)
			return s.GetJournalDetail(ctx, workspaceID, existing.ID)
		}
		if !isNoRows(err) {
			return JournalDetail{}, err
		}
	}

	period, effDate, err := s.validatePeriodForDateTx(ctx, qtx, workspaceID, entryDate, req.AllowNextOpen)
	if err != nil {
		return JournalDetail{}, err
	}

	lines, version, err := s.buildTemplateLines(ctx, qtx, workspaceID, req, totalMinor)
	if err != nil {
		return JournalDetail{}, err
	}

	var sumD, sumC int64
	for _, l := range lines {
		if l.DebitMinor < 0 || l.CreditMinor < 0 || (l.DebitMinor > 0 && l.CreditMinor > 0) || (l.DebitMinor == 0 && l.CreditMinor == 0) {
			return JournalDetail{}, ErrJournalUnbalanced
		}
		sumD += l.DebitMinor
		sumC += l.CreditMinor
	}
	if sumD <= 0 || sumD != sumC {
		return JournalDetail{}, ErrJournalUnbalanced
	}

	var periodID pgtype.Int8
	if period != nil {
		periodID = pgtype.Int8{Int64: period.ID, Valid: true}
	}
	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	entry, err := qtx.CreateEngineLedgerEntry(ctx, db.CreateEngineLedgerEntryParams{
		WorkspaceID:        workspaceID,
		SourceType:         req.SourceType,
		SourceID:           req.SourceID,
		EntryDate:          pgtype.Date{Time: effDate, Valid: true},
		Currency:           currency,
		CurrencyExponent:   exp,
		Description:        optionalPgText(req.Description),
		TemplateKey:        pgtype.Text{String: req.TemplateKey, Valid: true},
		TemplateVersion:    pgtype.Text{String: version, Valid: true},
		Status:             "posted",
		AccountingPeriodID: periodID,
		OutletID:           pgInt8Ptr(req.OutletID),
		PostedByUserID:     pgtype.Int8{Int64: userID, Valid: true},
		IdempotencyKey:     idempParam,
	})
	if err != nil {
		return JournalDetail{}, fmt.Errorf("create engine ledger entry: %w", err)
	}

	for _, l := range lines {
		if _, err := qtx.CreateEngineLedgerLine(ctx, db.CreateEngineLedgerLineParams{
			LedgerEntryID:  entry.ID,
			WorkspaceID:    workspaceID,
			AccountID:      pgInt8Ptr(l.MoneyAccountID),
			ChartAccountID: pgtype.Int8{Int64: l.ChartAccountID, Valid: true},
			AccountClass:   l.AccountClass,
			DebitMinor:     l.DebitMinor,
			CreditMinor:    l.CreditMinor,
			Description:    optionalPgText(l.Description),
			PartyID:        pgInt8Ptr(req.PartyID),
			OutletID:       pgInt8Ptr(req.OutletID),
			DimensionTags:  []byte(`{}`),
		}); err != nil {
			return JournalDetail{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return JournalDetail{}, err
	}
	return s.GetJournalDetail(ctx, workspaceID, entry.ID)
}

func sourceLinkFor(sourceType string, sourceID int64) string {
	switch sourceType {
	case "invoice_payment", "sale":
		return fmt.Sprintf("/invoices?source=%d", sourceID)
	case "supplier_bill", "goods_receipt":
		return fmt.Sprintf("/procurement?source=%d", sourceID)
	case "loan_origination", "loan_repayment", "loan_reversal":
		return fmt.Sprintf("/loans?source=%d", sourceID)
	case "investment_event":
		return fmt.Sprintf("/investments?source=%d", sourceID)
	case "asset_event":
		return fmt.Sprintf("/assets?source=%d", sourceID)
	default:
		return fmt.Sprintf("/transactions?source=%d", sourceID)
	}
}

type ListJournalsFilter struct {
	FromDate       string
	ToDate         string
	SourceType     string
	PeriodID       int64
	OutletID       int64
	ChartAccountID int64
	CursorDate     string
	CursorID       int64
	Limit          int32
}

type JournalListResult struct {
	Items      []db.LedgerEntry `json:"items"`
	NextCursor *ActivityCursor  `json:"next_cursor,omitempty"`
}

func (s *Service) ListJournals(ctx context.Context, workspaceID int64, f ListJournalsFilter) (JournalListResult, error) {
	limit := f.Limit
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	var fromParam, toParam, cursorDateParam pgtype.Date
	if f.FromDate != "" {
		t, err := parseDateStrict(f.FromDate)
		if err != nil {
			return JournalListResult{}, err
		}
		fromParam = pgtype.Date{Time: t, Valid: true}
	}
	if f.ToDate != "" {
		t, err := parseDateStrict(f.ToDate)
		if err != nil {
			return JournalListResult{}, err
		}
		toParam = pgtype.Date{Time: t, Valid: true}
	}
	if f.CursorDate != "" && f.CursorID > 0 {
		t, err := parseDateStrict(f.CursorDate)
		if err != nil {
			return JournalListResult{}, err
		}
		cursorDateParam = pgtype.Date{Time: t, Valid: true}
	}

	var srcParam pgtype.Text
	if f.SourceType != "" {
		srcParam = pgtype.Text{String: f.SourceType, Valid: true}
	}

	rows, err := s.queries.ListJournalsCursor(ctx, db.ListJournalsCursorParams{
		WorkspaceID:    workspaceID,
		Limit:          limit + 1,
		FromDate:       fromParam,
		ToDate:         toParam,
		SourceType:     srcParam,
		PeriodID:       pgInt8Ptr(&f.PeriodID),
		OutletID:       pgInt8Ptr(&f.OutletID),
		ChartAccountID: pgInt8Ptr(&f.ChartAccountID),
		CursorDate:     cursorDateParam,
		CursorID:       pgInt8Ptr(&f.CursorID),
	})
	if err != nil {
		return JournalListResult{}, err
	}

	var nextCursor *ActivityCursor
	if int32(len(rows)) > limit {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		nextCursor = &ActivityCursor{
			Date: last.EntryDate.Time.Format("2006-01-02"),
			ID:   last.ID,
		}
	}
	return JournalListResult{Items: rows, NextCursor: nextCursor}, nil
}

func (s *Service) GetJournalDetail(ctx context.Context, workspaceID, journalID int64) (JournalDetail, error) {
	entry, err := s.queries.GetEngineLedgerEntryByID(ctx, db.GetEngineLedgerEntryByIDParams{
		ID:          journalID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return JournalDetail{}, ErrNotFound
	}
	if err != nil {
		return JournalDetail{}, err
	}
	lines, err := s.queries.ListLedgerLinesByEntry(ctx, db.ListLedgerLinesByEntryParams{
		WorkspaceID:   workspaceID,
		LedgerEntryID: journalID,
	})
	if err != nil {
		return JournalDetail{}, err
	}
	var sumD, sumC int64
	for _, l := range lines {
		sumD += l.DebitMinor
		sumC += l.CreditMinor
	}
	return JournalDetail{
		Entry:       entry,
		Lines:       lines,
		SourceLink:  sourceLinkFor(entry.SourceType, entry.SourceID),
		TotalDebit:  sumD,
		TotalCredit: sumC,
	}, nil
}

func (s *Service) ReverseLedgerEntry(ctx context.Context, workspaceID, userID, journalID int64, idempKey, reason string, allowNextOpen bool) (JournalDetail, error) {
	if strings.TrimSpace(reason) == "" {
		return JournalDetail{}, errors.New("reversal reason is required")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return JournalDetail{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if idempKey != "" {
		existing, err := qtx.GetEngineLedgerEntryByIdempotency(ctx, db.GetEngineLedgerEntryByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			tx.Rollback(ctx)
			return s.GetJournalDetail(ctx, workspaceID, existing.ID)
		}
		if !isNoRows(err) {
			return JournalDetail{}, err
		}
	}

	orig, err := qtx.GetEngineLedgerEntryForUpdate(ctx, db.GetEngineLedgerEntryForUpdateParams{
		ID:          journalID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return JournalDetail{}, ErrNotFound
	}
	if err != nil {
		return JournalDetail{}, err
	}
	if orig.IsReversed {
		return JournalDetail{}, errors.New("journal entry has already been reversed")
	}

	origLines, err := qtx.ListLedgerLinesByEntry(ctx, db.ListLedgerLinesByEntryParams{
		WorkspaceID:   workspaceID,
		LedgerEntryID: orig.ID,
	})
	if err != nil {
		return JournalDetail{}, err
	}

	period, effDate, err := s.validatePeriodForDateTx(ctx, qtx, workspaceID, time.Now().UTC(), allowNextOpen)
	if err != nil {
		return JournalDetail{}, err
	}
	var periodID pgtype.Int8
	if period != nil {
		periodID = pgtype.Int8{Int64: period.ID, Valid: true}
	}
	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	revEntry, err := qtx.CreateEngineLedgerEntry(ctx, db.CreateEngineLedgerEntryParams{
		WorkspaceID:        workspaceID,
		SourceType:         "reversal",
		SourceID:           orig.ID,
		EntryDate:          pgtype.Date{Time: effDate, Valid: true},
		Currency:           orig.Currency,
		CurrencyExponent:   orig.CurrencyExponent,
		Description:        pgtype.Text{String: fmt.Sprintf("Reversal of journal #%d: %s", orig.ID, reason), Valid: true},
		TemplateKey:        pgtype.Text{String: "reversal", Valid: true},
		TemplateVersion:    pgtype.Text{String: "v1", Valid: true},
		Status:             "posted",
		ReversalOfEntryID:  pgtype.Int8{Int64: orig.ID, Valid: true},
		AccountingPeriodID: periodID,
		OutletID:           orig.OutletID,
		PostedByUserID:     pgtype.Int8{Int64: userID, Valid: true},
		IdempotencyKey:     idempParam,
	})
	if err != nil {
		return JournalDetail{}, err
	}

	for _, l := range origLines {
		if _, err := qtx.CreateEngineLedgerLine(ctx, db.CreateEngineLedgerLineParams{
			LedgerEntryID:  revEntry.ID,
			WorkspaceID:    workspaceID,
			AccountID:      l.AccountID,
			ChartAccountID: l.ChartAccountID,
			AccountClass:   l.AccountClass,
			DebitMinor:     l.CreditMinor, // exact swap
			CreditMinor:    l.DebitMinor,  // exact swap
			Description:    l.Description,
			PartyID:        l.PartyID,
			OutletID:       l.OutletID,
			TaxCodeID:      l.TaxCodeID,
			DimensionTags:  l.DimensionTags,
		}); err != nil {
			return JournalDetail{}, err
		}
	}

	if _, err := qtx.MarkEngineLedgerEntryReversed(ctx, db.MarkEngineLedgerEntryReversedParams{
		ID:                orig.ID,
		WorkspaceID:       workspaceID,
		ReversedByEntryID: pgtype.Int8{Int64: revEntry.ID, Valid: true},
	}); err != nil {
		return JournalDetail{}, err
	}

	payload, _ := json.Marshal(map[string]any{"original_entry_id": orig.ID, "reversal_entry_id": revEntry.ID, "reason": reason})
	if _, err := tx.Exec(ctx, `INSERT INTO audit_events (workspace_id, actor_user_id, event_type, subject_type, subject_id, metadata) VALUES ($1, $2, 'journal_reversed', 'ledger_entry', $3, $4)`,
		workspaceID, userID, strconv.FormatInt(revEntry.ID, 10), payload); err != nil {
		return JournalDetail{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return JournalDetail{}, err
	}
	return s.GetJournalDetail(ctx, workspaceID, revEntry.ID)
}

// ---------------- Manual Journal Drafts & Approval ----------------

type ManualJournalLineInput struct {
	ChartAccountID int64  `json:"chart_account_id" binding:"required"`
	DebitMinor     int64  `json:"debit_minor"`
	Debit          string `json:"debit"`
	CreditMinor    int64  `json:"credit_minor"`
	Credit         string `json:"credit"`
	Description    string `json:"description"`
	OutletID       *int64 `json:"outlet_id"`
	PartyID        *int64 `json:"party_id"`
}

type CreateManualJournalDraftInput struct {
	EntryDate      string                   `json:"entry_date" binding:"required"`
	Currency       string                   `json:"currency"`
	Description    string                   `json:"description" binding:"required"`
	Reference      string                   `json:"reference"`
	EvidenceKey    string                   `json:"evidence_key"`
	Lines          []ManualJournalLineInput `json:"lines" binding:"required,min=2"`
	IdempotencyKey string                   `json:"idempotency_key"`
}

type ManualJournalDraftDetail struct {
	Draft db.ManualJournalDraft               `json:"draft"`
	Lines []db.ListManualJournalDraftLinesRow `json:"lines"`
}

func (s *Service) CreateManualJournalDraft(ctx context.Context, workspaceID, userID int64, idempKey string, in CreateManualJournalDraftInput) (ManualJournalDraftDetail, error) {
	if idempKey == "" {
		idempKey = in.IdempotencyKey
	}
	desc := strings.TrimSpace(in.Description)
	if desc == "" {
		return ManualJournalDraftDetail{}, errors.New("manual journal description is required")
	}
	entryDate, err := parseDateStrict(in.EntryDate)
	if err != nil {
		return ManualJournalDraftDetail{}, err
	}
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exp := int32(CurrencyExponent(currency))

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ManualJournalDraftDetail{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if idempKey != "" {
		existing, err := qtx.GetManualJournalDraftByIdempotency(ctx, db.GetManualJournalDraftByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			tx.Rollback(ctx)
			return s.GetManualJournalDraftDetail(ctx, workspaceID, existing.ID)
		}
		if !isNoRows(err) {
			return ManualJournalDraftDetail{}, err
		}
	}

	var sumD, sumC int64
	type resolvedLine struct {
		acc   db.ChartAccount
		d, c  int64
		desc  string
		outID *int64
		ptyID *int64
	}
	resolved := make([]resolvedLine, 0, len(in.Lines))
	for _, l := range in.Lines {
		dMinor, err := resolveNonNegativeAmountMinor(l.Debit, l.DebitMinor, currency)
		if err != nil {
			return ManualJournalDraftDetail{}, err
		}
		cMinor, err := resolveNonNegativeAmountMinor(l.Credit, l.CreditMinor, currency)
		if err != nil {
			return ManualJournalDraftDetail{}, err
		}
		if (dMinor > 0 && cMinor > 0) || (dMinor == 0 && cMinor == 0) || dMinor < 0 || cMinor < 0 {
			return ManualJournalDraftDetail{}, ErrJournalUnbalanced
		}
		acc, err := qtx.GetChartAccountByID(ctx, db.GetChartAccountByIDParams{
			ID:          l.ChartAccountID,
			WorkspaceID: workspaceID,
		})
		if isNoRows(err) {
			return ManualJournalDraftDetail{}, ErrForbiddenAccount
		}
		if err != nil {
			return ManualJournalDraftDetail{}, err
		}
		if acc.IsControl {
			return ManualJournalDraftDetail{}, ErrControlAccountPostingBlocked
		}
		sumD += dMinor
		sumC += cMinor
		resolved = append(resolved, resolvedLine{acc: acc, d: dMinor, c: cMinor, desc: l.Description, outID: l.OutletID, ptyID: l.PartyID})
	}
	if sumD <= 0 || sumD != sumC {
		return ManualJournalDraftDetail{}, ErrJournalUnbalanced
	}

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	draft, err := qtx.CreateManualJournalDraft(ctx, db.CreateManualJournalDraftParams{
		WorkspaceID:      workspaceID,
		EntryDate:        pgtype.Date{Time: entryDate, Valid: true},
		Currency:         currency,
		CurrencyExponent: exp,
		Description:      desc,
		Reference:        optionalPgText(in.Reference),
		EvidenceKey:      optionalPgText(in.EvidenceKey),
		Status:           "pending_approval",
		CreatedByUserID:  userID,
		IdempotencyKey:   idempParam,
	})
	if err != nil {
		return ManualJournalDraftDetail{}, err
	}

	for _, rl := range resolved {
		if _, err := qtx.CreateManualJournalDraftLine(ctx, db.CreateManualJournalDraftLineParams{
			DraftID:        draft.ID,
			WorkspaceID:    workspaceID,
			ChartAccountID: rl.acc.ID,
			DebitMinor:     rl.d,
			CreditMinor:    rl.c,
			Description:    optionalPgText(rl.desc),
			OutletID:       pgInt8Ptr(rl.outID),
			PartyID:        pgInt8Ptr(rl.ptyID),
		}); err != nil {
			return ManualJournalDraftDetail{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return ManualJournalDraftDetail{}, err
	}
	return s.GetManualJournalDraftDetail(ctx, workspaceID, draft.ID)
}

func (s *Service) PostManualJournalDraft(ctx context.Context, workspaceID, approverUserID, draftID int64, allowSelfApproval bool, idempKey string) (JournalDetail, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return JournalDetail{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	draft, err := qtx.GetManualJournalDraftForUpdate(ctx, db.GetManualJournalDraftForUpdateParams{
		ID:          draftID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return JournalDetail{}, ErrNotFound
	}
	if err != nil {
		return JournalDetail{}, err
	}
	if draft.Status == "posted" && draft.PostedLedgerEntryID.Valid {
		tx.Rollback(ctx)
		return s.GetJournalDetail(ctx, workspaceID, draft.PostedLedgerEntryID.Int64)
	}
	if draft.Status != "draft" && draft.Status != "pending_approval" && draft.Status != "approved" {
		return JournalDetail{}, errors.New("manual journal draft is not in a postable state")
	}
	if !allowSelfApproval && draft.CreatedByUserID == approverUserID {
		return JournalDetail{}, ErrManualJournalApprovalSelf
	}

	lines, err := qtx.ListManualJournalDraftLines(ctx, db.ListManualJournalDraftLinesParams{
		WorkspaceID: workspaceID,
		DraftID:     draft.ID,
	})
	if err != nil {
		return JournalDetail{}, err
	}

	var sumD, sumC int64
	for _, l := range lines {
		if l.IsControl {
			return JournalDetail{}, ErrControlAccountPostingBlocked
		}
		sumD += l.DebitMinor
		sumC += l.CreditMinor
	}
	if sumD <= 0 || sumD != sumC {
		return JournalDetail{}, ErrJournalUnbalanced
	}

	period, effDate, err := s.validatePeriodForDateTx(ctx, qtx, workspaceID, draft.EntryDate.Time, false)
	if err != nil {
		return JournalDetail{}, err
	}
	var periodID pgtype.Int8
	if period != nil {
		periodID = pgtype.Int8{Int64: period.ID, Valid: true}
	}
	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	entry, err := qtx.CreateEngineLedgerEntry(ctx, db.CreateEngineLedgerEntryParams{
		WorkspaceID:        workspaceID,
		SourceType:         "manual_journal",
		SourceID:           draft.ID,
		EntryDate:          pgtype.Date{Time: effDate, Valid: true},
		Currency:           draft.Currency,
		CurrencyExponent:   draft.CurrencyExponent,
		Description:        pgtype.Text{String: draft.Description, Valid: true},
		TemplateKey:        pgtype.Text{String: "manual_journal", Valid: true},
		TemplateVersion:    pgtype.Text{String: "v1", Valid: true},
		Status:             "posted",
		AccountingPeriodID: periodID,
		PostedByUserID:     pgtype.Int8{Int64: approverUserID, Valid: true},
		IdempotencyKey:     idempParam,
	})
	if err != nil {
		return JournalDetail{}, err
	}

	for _, l := range lines {
		acc, err := qtx.GetChartAccountByID(ctx, db.GetChartAccountByIDParams{ID: l.ChartAccountID, WorkspaceID: workspaceID})
		if err != nil {
			return JournalDetail{}, err
		}
		if _, err := qtx.CreateEngineLedgerLine(ctx, db.CreateEngineLedgerLineParams{
			LedgerEntryID:  entry.ID,
			WorkspaceID:    workspaceID,
			ChartAccountID: pgtype.Int8{Int64: l.ChartAccountID, Valid: true},
			AccountClass:   acc.AccountClass,
			DebitMinor:     l.DebitMinor,
			CreditMinor:    l.CreditMinor,
			Description:    l.Description,
			PartyID:        l.PartyID,
			OutletID:       l.OutletID,
			DimensionTags:  []byte(`{}`),
		}); err != nil {
			return JournalDetail{}, err
		}
	}

	if _, err := qtx.MarkManualJournalPosted(ctx, db.MarkManualJournalPostedParams{
		ID:                  draft.ID,
		WorkspaceID:         workspaceID,
		ApprovedByUserID:    pgtype.Int8{Int64: approverUserID, Valid: true},
		PostedLedgerEntryID: pgtype.Int8{Int64: entry.ID, Valid: true},
	}); err != nil {
		return JournalDetail{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return JournalDetail{}, err
	}
	return s.GetJournalDetail(ctx, workspaceID, entry.ID)
}

func (s *Service) ListManualJournalDrafts(ctx context.Context, workspaceID int64) ([]db.ManualJournalDraft, error) {
	return s.queries.ListManualJournalDrafts(ctx, db.ListManualJournalDraftsParams{
		WorkspaceID: workspaceID,
		Limit:       50,
	})
}

func (s *Service) GetManualJournalDraftDetail(ctx context.Context, workspaceID, draftID int64) (ManualJournalDraftDetail, error) {
	draft, err := s.queries.GetManualJournalDraftByID(ctx, db.GetManualJournalDraftByIDParams{
		ID:          draftID,
		WorkspaceID: workspaceID,
	})
	if isNoRows(err) {
		return ManualJournalDraftDetail{}, ErrNotFound
	}
	if err != nil {
		return ManualJournalDraftDetail{}, err
	}
	lines, err := s.queries.ListManualJournalDraftLines(ctx, db.ListManualJournalDraftLinesParams{
		WorkspaceID: workspaceID,
		DraftID:     draftID,
	})
	if err != nil {
		return ManualJournalDraftDetail{}, err
	}
	return ManualJournalDraftDetail{Draft: draft, Lines: lines}, nil
}
