package finance

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"strings"
	"time"
)

type CreateSupplierBillInput struct {
	GoodsReceiptID        int64  `json:"goods_receipt_id"`
	SupplierID            int64  `json:"supplier_id"`
	SupplierInvoiceNumber string `json:"supplier_invoice_number"`
	BillDate              string `json:"bill_date"`
	DueDate               string `json:"due_date"`
	Amount                string `json:"amount"`
	Currency              string `json:"currency"`
	BillType              string `json:"bill_type"`
	ExpenseAccountClass   string `json:"expense_account_class"`
	Description           string `json:"description"`
	IdempotencyKey        string `json:"idempotency_key"`
}
type SupplierBillCommandInput struct {
	ExpectedVersion int32  `json:"expected_version"`
	IdempotencyKey  string `json:"idempotency_key"`
}
type SupplierBillView struct {
	ID                 int64   `json:"id"`
	GoodsReceiptID     int64   `json:"goods_receipt_id"`
	Status             string  `json:"status"`
	Version            int32   `json:"version"`
	TotalMinor         string  `json:"total_minor"`
	OutstandingMinor   string  `json:"outstanding_minor"`
	GoodsReceiptLinked bool    `json:"goods_receipt_linked"`
	BillType           string  `json:"bill_type"`
	DueDate            *string `json:"due_date,omitempty"`
	Overdue            bool    `json:"overdue"`
}
type SupplierBillMatch struct {
	BillID          int64  `json:"bill_id"`
	ReceiptID       int64  `json:"receipt_id"`
	OrderedMinor    string `json:"ordered_minor"`
	ReceivedMinor   string `json:"received_minor"`
	BilledMinor     string `json:"billed_minor"`
	Result          string `json:"result"`
	RequiresReview  bool   `json:"requires_review"`
	OpenToBillMinor string `json:"open_to_bill_minor"`
	VarianceMinor   string `json:"variance_minor"`
}

func billView(b db.SupplierBill) SupplierBillView {
	var receiptID int64
	linked := b.GoodsReceiptID.Valid
	if linked {
		receiptID = b.GoodsReceiptID.Int64
	}
	var due *string
	if b.DueDate.Valid {
		value := b.DueDate.Time.Format("2006-01-02")
		due = &value
	}
	return SupplierBillView{ID: b.ID, GoodsReceiptID: receiptID, GoodsReceiptLinked: linked, BillType: b.BillType, DueDate: due, Overdue: b.DueDate.Valid && b.DueDate.Time.Before(time.Now().UTC()) && (b.Status == "approved" || b.Status == "partially_paid"), Status: b.Status, Version: b.Version, TotalMinor: fmt.Sprintf("%d", b.TotalMinor), OutstandingMinor: fmt.Sprintf("%d", b.OutstandingMinor)}
}
func (s *Service) CreateSupplierBill(ctx context.Context, ws, user int64, in CreateSupplierBillInput) (SupplierBillView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	invoice := strings.TrimSpace(in.SupplierInvoiceNumber)
	date, e := time.Parse("2006-01-02", strings.TrimSpace(in.BillDate))
	if key == "" || invoice == "" || e != nil {
		return SupplierBillView{}, errors.New("supplier invoice number, bill date and idempotency key are required")
	}
	if old, e := s.queries.GetSupplierBillByIdempotency(ctx, db.GetSupplierBillByIdempotencyParams{WorkspaceID: ws, IdempotencyKey: key}); e == nil {
		return billView(old), nil
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return SupplierBillView{}, e
	}
	var due pgtype.Date
	if strings.TrimSpace(in.DueDate) != "" {
		v, x := time.Parse("2006-01-02", in.DueDate)
		if x != nil {
			return SupplierBillView{}, errors.New("due date must be YYYY-MM-DD")
		}
		due = pgtype.Date{Time: v, Valid: true}
	}
	if in.GoodsReceiptID > 0 {
		source, sourceErr := s.queries.GetReceiptBillSource(ctx, db.GetReceiptBillSourceParams{WorkspaceID: ws, ID: in.GoodsReceiptID})
		if errors.Is(sourceErr, pgx.ErrNoRows) {
			return SupplierBillView{}, ErrNotFound
		}
		if sourceErr != nil || !source.SupplierID.Valid {
			return SupplierBillView{}, errors.New("receipt must have a supplier before billing")
		}
		b, sourceErr := s.queries.CreateSupplierBill(ctx, db.CreateSupplierBillParams{WorkspaceID: ws, GoodsReceiptID: pgtype.Int8{Int64: in.GoodsReceiptID, Valid: true}, SupplierID: source.SupplierID.Int64, SupplierInvoiceNumber: invoice, BillDate: pgtype.Date{Time: date, Valid: true}, DueDate: due, Currency: source.Currency, CurrencyExponent: source.CurrencyExponent, TotalMinor: source.TotalMinor, IdempotencyKey: key, CreatedByUserID: user})
		if sourceErr != nil {
			return SupplierBillView{}, sourceErr
		}
		return billView(b), nil
	}
	if in.SupplierID <= 0 {
		return SupplierBillView{}, errors.New("direct bill requires a supplier")
	}
	party, partyErr := s.GetCounterparty(ctx, ws, in.SupplierID)
	if partyErr != nil || (party.PartyType != "supplier" && party.PartyType != "both") {
		return SupplierBillView{}, ErrForbiddenParty
	}
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if len(currency) != 3 {
		return SupplierBillView{}, ErrInvalidCurrency
	}
	amount, amountErr := ParseMajorToMinor(in.Amount, CurrencyExponent(currency))
	if amountErr != nil {
		return SupplierBillView{}, amountErr
	}
	billType := strings.TrimSpace(in.BillType)
	if billType == "" {
		billType = "direct_expense"
	}
	if billType != "direct_expense" && billType != "direct_service" {
		return SupplierBillView{}, errors.New("invalid direct bill type")
	}
	accountClass := strings.TrimSpace(in.ExpenseAccountClass)
	if accountClass == "" {
		accountClass = "expense"
	}
	if accountClass != "expense" && accountClass != "asset" {
		return SupplierBillView{}, errors.New("invalid expense account class")
	}
	b, e := s.queries.CreateDirectSupplierBill(ctx, db.CreateDirectSupplierBillParams{WorkspaceID: ws, SupplierID: in.SupplierID, SupplierInvoiceNumber: invoice, BillDate: pgtype.Date{Time: date, Valid: true}, DueDate: due, Currency: currency, CurrencyExponent: int32(CurrencyExponent(currency)), TotalMinor: amount, BillType: billType, ExpenseAccountClass: accountClass, Description: optionalPgText(in.Description), IdempotencyKey: key, CreatedByUserID: user})
	if e != nil {
		return SupplierBillView{}, e
	}
	return billView(b), nil
}
func (s *Service) ApproveSupplierBill(ctx context.Context, ws, user, id int64, in SupplierBillCommandInput) (SupplierBillView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if id < 1 || in.ExpectedVersion < 1 || key == "" {
		return SupplierBillView{}, errors.New("bill, expected version and idempotency key are required")
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return SupplierBillView{}, e
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	b, e := q.GetSupplierBillForUpdate(ctx, db.GetSupplierBillForUpdateParams{WorkspaceID: ws, ID: id})
	if errors.Is(e, pgx.ErrNoRows) {
		return SupplierBillView{}, ErrNotFound
	}
	if e != nil {
		return SupplierBillView{}, e
	}
	if old, e := q.GetSupplierBillCommand(ctx, db.GetSupplierBillCommandParams{WorkspaceID: ws, IdempotencyKey: key}); e == nil {
		if old.SupplierBillID != id || old.ExpectedVersion != in.ExpectedVersion {
			return SupplierBillView{}, ErrDuplicateIdempotent
		}
		return billView(b), nil
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return SupplierBillView{}, e
	}
	if b.Version != in.ExpectedVersion || b.Status != "draft" {
		return SupplierBillView{}, ErrPurchaseRequestVersion
	}
	updated, e := q.ApproveSupplierBill(ctx, db.ApproveSupplierBillParams{WorkspaceID: ws, ID: id, Version: b.Version, ApprovedByUserID: pgtype.Int8{Int64: user, Valid: true}})
	if e != nil {
		return SupplierBillView{}, e
	}
	entry, e := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: ws, SourceType: "supplier_bill", SourceID: id, EntryDate: b.BillDate, Currency: b.Currency, CurrencyExponent: b.CurrencyExponent, Description: optionalPgText("Supplier bill approval")})
	if e != nil {
		return SupplierBillView{}, e
	}
	debitClass, debitDescription := "liability", "Clear GRNI"
	if !b.GoodsReceiptID.Valid {
		debitClass, debitDescription = b.ExpenseAccountClass, "Direct supplier bill expense"
	}
	if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: debitClass, DebitMinor: b.TotalMinor, Description: optionalPgText(debitDescription)}); e != nil {
		return SupplierBillView{}, e
	}
	if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "liability", CreditMinor: b.TotalMinor, Description: optionalPgText("Accounts Payable")}); e != nil {
		return SupplierBillView{}, e
	}
	if e = q.CreateSupplierBillCommand(ctx, db.CreateSupplierBillCommandParams{WorkspaceID: ws, SupplierBillID: id, Command: "approve", ExpectedVersion: b.Version, IdempotencyKey: key, ActorUserID: user}); e != nil {
		return SupplierBillView{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return SupplierBillView{}, e
	}
	return billView(updated), nil
}
func (s *Service) ListSupplierBills(ctx context.Context, ws int64) ([]SupplierBillView, error) {
	rows, e := s.queries.ListSupplierBills(ctx, db.ListSupplierBillsParams{WorkspaceID: ws, Limit: 50})
	if e != nil {
		return nil, e
	}
	out := make([]SupplierBillView, 0, len(rows))
	for _, b := range rows {
		out = append(out, billView(b))
	}
	return out, nil
}

// SupplierBillMatch is deliberately server derived. Today a bill is receipt-backed,
// so a non-exact amount is held for review instead of being silently posted.
func (s *Service) SupplierBillMatch(ctx context.Context, ws, id int64) (SupplierBillMatch, error) {
	b, e := s.queries.GetSupplierBill(ctx, db.GetSupplierBillParams{WorkspaceID: ws, ID: id})
	if errors.Is(e, pgx.ErrNoRows) {
		return SupplierBillMatch{}, ErrNotFound
	}
	if e != nil {
		return SupplierBillMatch{}, e
	}
	if !b.GoodsReceiptID.Valid {
		return SupplierBillMatch{BillID: b.ID, BilledMinor: fmt.Sprintf("%d", b.TotalMinor), Result: "direct_bill", RequiresReview: false}, nil
	}
	totals, e := s.queries.GetThreeWayMatchTotals(ctx, db.GetThreeWayMatchTotalsParams{WorkspaceID: ws, ID: b.GoodsReceiptID.Int64})
	if e != nil {
		return SupplierBillMatch{}, e
	}
	result, review := "exact", false
	if totals.BilledMinor > totals.ReceivedMinor {
		result, review = "overbilled", true
	} else if totals.BilledMinor != totals.ReceivedMinor {
		result, review = "price_or_quantity_variance", true
	} else if totals.ReceivedMinor != totals.OrderedMinor {
		result, review = "receipt_quantity_variance", true
	}
	openToBill := totals.ReceivedMinor - totals.BilledMinor
	if openToBill < 0 {
		openToBill = 0
	}
	variance := totals.BilledMinor - totals.ReceivedMinor
	return SupplierBillMatch{BillID: b.ID, ReceiptID: b.GoodsReceiptID.Int64, OrderedMinor: fmt.Sprintf("%d", totals.OrderedMinor), ReceivedMinor: fmt.Sprintf("%d", totals.ReceivedMinor), BilledMinor: fmt.Sprintf("%d", totals.BilledMinor), OpenToBillMinor: fmt.Sprintf("%d", openToBill), VarianceMinor: fmt.Sprintf("%d", variance), Result: result, RequiresReview: review}, nil
}
