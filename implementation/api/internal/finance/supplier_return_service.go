package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
)

type SupplierReturnLineInput struct {
	GoodsReceiptLineID int64  `json:"goods_receipt_line_id"`
	Quantity           string `json:"quantity"`
}
type CreateSupplierReturnInput struct {
	GoodsReceiptID int64                     `json:"goods_receipt_id"`
	EffectiveOn    string                    `json:"effective_on"`
	Reason         string                    `json:"reason"`
	Lines          []SupplierReturnLineInput `json:"lines"`
	IdempotencyKey string                    `json:"idempotency_key"`
}
type SupplierReturnView struct {
	ID             int64  `json:"id"`
	SupplierID     int64  `json:"supplier_id"`
	GoodsReceiptID int64  `json:"goods_receipt_id"`
	Status         string `json:"status"`
	TotalMinor     string `json:"total_minor"`
}
type SupplierReturnLineOption struct {
	ID                int64  `json:"id"`
	ProductName       string `json:"product_name"`
	RemainingQuantity string `json:"remaining_quantity"`
	UnitCostMinor     string `json:"unit_cost_minor"`
}
type CreateSupplierCreditInput struct {
	SupplierReturnID int64  `json:"supplier_return_id"`
	SupplierBillID   int64  `json:"supplier_bill_id"`
	Amount           string `json:"amount"`
	Reason           string `json:"reason"`
	IdempotencyKey   string `json:"idempotency_key"`
}
type SupplierCreditView struct {
	ID               int64  `json:"id"`
	SupplierID       int64  `json:"supplier_id"`
	SupplierReturnID *int64 `json:"supplier_return_id,omitempty"`
	SupplierBillID   *int64 `json:"supplier_bill_id,omitempty"`
	AmountMinor      string `json:"amount_minor"`
	OutstandingMinor string `json:"outstanding_minor"`
	Status           string `json:"status"`
}
type CreateSupplierRefundInput struct {
	SupplierCreditID  int64  `json:"supplier_credit_id"`
	SupplierAdvanceID int64  `json:"supplier_advance_id"`
	MoneyAccountID    int64  `json:"money_account_id"`
	Amount            string `json:"amount"`
	RefundDate        string `json:"refund_date"`
	Reason            string `json:"reason"`
	IdempotencyKey    string `json:"idempotency_key"`
}

func supplierReturnView(v db.SupplierReturn) SupplierReturnView {
	return SupplierReturnView{ID: v.ID, SupplierID: v.SupplierID, GoodsReceiptID: v.GoodsReceiptID, Status: v.Status, TotalMinor: fmt.Sprint(v.TotalMinor)}
}
func supplierCreditView(v db.SupplierCredit) SupplierCreditView {
	var ret, bill *int64
	if v.SupplierReturnID.Valid {
		x := v.SupplierReturnID.Int64
		ret = &x
	}
	if v.SupplierBillID.Valid {
		x := v.SupplierBillID.Int64
		bill = &x
	}
	return SupplierCreditView{ID: v.ID, SupplierID: v.SupplierID, SupplierReturnID: ret, SupplierBillID: bill, AmountMinor: fmt.Sprint(v.AmountMinor), OutstandingMinor: fmt.Sprint(v.OutstandingMinor), Status: v.Status}
}

func (s *Service) ListSupplierReturns(ctx context.Context, ws int64) ([]SupplierReturnView, error) {
	rows, err := s.queries.ListSupplierReturns(ctx, db.ListSupplierReturnsParams{WorkspaceID: ws, Limit: 100})
	if err != nil {
		return nil, err
	}
	out := make([]SupplierReturnView, 0, len(rows))
	for _, row := range rows {
		out = append(out, supplierReturnView(row))
	}
	return out, nil
}

func (s *Service) ReturnOptions(ctx context.Context, ws, receiptID int64) ([]SupplierReturnLineOption, error) {
	rows, err := s.queries.ListReturnableReceiptLines(ctx, db.ListReturnableReceiptLinesParams{WorkspaceID: ws, GoodsReceiptID: receiptID})
	if err != nil {
		return nil, err
	}
	out := make([]SupplierReturnLineOption, 0, len(rows))
	for _, row := range rows {
		if row.RemainingQuantity.GreaterThan(decimal.Zero) {
			out = append(out, SupplierReturnLineOption{ID: row.ID, ProductName: row.ProductName, RemainingQuantity: row.RemainingQuantity.StringFixed(4), UnitCostMinor: fmt.Sprint(row.UnitCostMinor)})
		}
	}
	return out, nil
}

func (s *Service) CreateSupplierReturn(ctx context.Context, ws, user int64, in CreateSupplierReturnInput) (SupplierReturnView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	reason := strings.TrimSpace(in.Reason)
	if in.GoodsReceiptID <= 0 || key == "" || reason == "" || len(in.Lines) == 0 {
		return SupplierReturnView{}, errors.New("receipt, lines, reason and idempotency key are required")
	}
	if old, err := s.queries.GetSupplierReturnByIdempotency(ctx, db.GetSupplierReturnByIdempotencyParams{WorkspaceID: ws, IdempotencyKey: key}); err == nil {
		return supplierReturnView(old), nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return SupplierReturnView{}, err
	}
	date, err := time.Parse("2006-01-02", strings.TrimSpace(in.EffectiveOn))
	if err != nil {
		return SupplierReturnView{}, errors.New("effective date must be YYYY-MM-DD")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SupplierReturnView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	receipt, err := q.GetReceiptForReturn(ctx, db.GetReceiptForReturnParams{WorkspaceID: ws, ID: in.GoodsReceiptID})
	if errors.Is(err, pgx.ErrNoRows) {
		return SupplierReturnView{}, ErrNotFound
	}
	if err != nil || !receipt.SupplierID.Valid || !receipt.LocationID.Valid {
		return SupplierReturnView{}, errors.New("receipt is not returnable")
	}
	type preparedLine struct {
		line  db.GetReceiptLineForReturnRow
		qty   decimal.Decimal
		value int64
	}
	prepared := make([]preparedLine, 0, len(in.Lines))
	total := int64(0)
	seen := map[int64]bool{}
	for _, raw := range in.Lines {
		if raw.GoodsReceiptLineID <= 0 || seen[raw.GoodsReceiptLineID] {
			return SupplierReturnView{}, errors.New("duplicate or invalid receipt line")
		}
		seen[raw.GoodsReceiptLineID] = true
		line, e := q.GetReceiptLineForReturn(ctx, db.GetReceiptLineForReturnParams{WorkspaceID: ws, ID: raw.GoodsReceiptLineID, GoodsReceiptID: in.GoodsReceiptID})
		if errors.Is(e, pgx.ErrNoRows) {
			return SupplierReturnView{}, ErrNotFound
		}
		if e != nil {
			return SupplierReturnView{}, e
		}
		if line.Kind != "stock_tracked" || !line.ProductID.Valid || !line.LocationID.Valid {
			return SupplierReturnView{}, errors.New("only stock-tracked receipt lines can be returned")
		}
		qty, _, e := parseRequestQuantity(raw.Quantity)
		if e != nil {
			return SupplierReturnView{}, e
		}
		returned, e := q.GetReturnedQuantityForReceiptLine(ctx, db.GetReturnedQuantityForReceiptLineParams{WorkspaceID: ws, GoodsReceiptLineID: line.ID})
		if e != nil {
			return SupplierReturnView{}, e
		}
		if returned.Add(qty).GreaterThan(line.AcceptedQuantity) {
			return SupplierReturnView{}, errors.New("return quantity exceeds eligible received quantity")
		}
		balance, e := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{WorkspaceID: ws, LocationID: line.LocationID.Int64, ProductID: line.ProductID.Int64})
		if errors.Is(e, pgx.ErrNoRows) {
			return SupplierReturnView{}, errors.New("no available stock for return")
		}
		if e != nil {
			return SupplierReturnView{}, e
		}
		if balance.QuantityOnHand.LessThan(qty) {
			return SupplierReturnView{}, errors.New("return quantity exceeds stock on hand")
		}
		value, e := requestLineTotal(line.UnitCostMinor, qty)
		if e != nil || value <= 0 {
			return SupplierReturnView{}, errors.New("invalid return value")
		}
		total, e = CheckedAdd(total, value)
		if e != nil {
			return SupplierReturnView{}, e
		}
		prepared = append(prepared, preparedLine{line: line, qty: qty, value: value})
	}
	ret, err := q.CreateSupplierReturn(ctx, db.CreateSupplierReturnParams{WorkspaceID: ws, SupplierID: receipt.SupplierID.Int64, GoodsReceiptID: in.GoodsReceiptID, EffectiveOn: pgtype.Date{Time: date, Valid: true}, Reason: reason, TotalMinor: total, IdempotencyKey: key, CreatedByUserID: user})
	if err != nil {
		return SupplierReturnView{}, err
	}
	for _, item := range prepared {
		if _, err = q.CreateSupplierReturnLine(ctx, db.CreateSupplierReturnLineParams{WorkspaceID: ws, SupplierReturnID: ret.ID, GoodsReceiptLineID: item.line.ID, ProductID: item.line.ProductID.Int64, LocationID: item.line.LocationID.Int64, Quantity: item.qty, ValueMinor: item.value}); err != nil {
			return SupplierReturnView{}, err
		}
		if _, err = q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{WorkspaceID: ws, ProductID: item.line.ProductID.Int64, GoodsReceiptLineID: pgtype.Int8{Int64: item.line.ID, Valid: true}, LocationID: pgtype.Int8{Int64: item.line.LocationID.Int64, Valid: true}, MovementType: "return", SourceType: "supplier_return", SourceID: pgtype.Int8{Int64: ret.ID, Valid: true}, QuantityDelta: item.qty.Neg(), ValueDeltaMinor: -item.value, OccurredOn: pgtype.Date{Time: date, Valid: true}}); err != nil {
			return SupplierReturnView{}, err
		}
		if _, err = q.ApplyInventoryBalanceDelta(ctx, db.ApplyInventoryBalanceDeltaParams{WorkspaceID: ws, LocationID: item.line.LocationID.Int64, ProductID: item.line.ProductID.Int64, QuantityOnHand: item.qty.Neg(), ValueOnHandMinor: -item.value}); err != nil {
			return SupplierReturnView{}, errors.New("stock changed before return could be posted")
		}
	}
	entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: ws, SourceType: "supplier_return", SourceID: ret.ID, EntryDate: pgtype.Date{Time: date, Valid: true}, Currency: receipt.Currency, CurrencyExponent: receipt.CurrencyExponent, Description: optionalPgText("Supplier return")})
	if err != nil {
		return SupplierReturnView{}, err
	}
	if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "asset", DebitMinor: total, Description: optionalPgText("Supplier return credit pending")}); err != nil {
		return SupplierReturnView{}, err
	}
	if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "asset", CreditMinor: total, Description: optionalPgText("Inventory returned to supplier")}); err != nil {
		return SupplierReturnView{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return SupplierReturnView{}, err
	}
	return supplierReturnView(ret), nil
}

func (s *Service) CreateSupplierCredit(ctx context.Context, ws, user int64, in CreateSupplierCreditInput) (SupplierCreditView, error) {
	key, reason := strings.TrimSpace(in.IdempotencyKey), strings.TrimSpace(in.Reason)
	if key == "" || reason == "" || (in.SupplierBillID <= 0 && in.SupplierReturnID <= 0) || (in.SupplierBillID > 0 && in.SupplierReturnID > 0) {
		return SupplierCreditView{}, errors.New("an approved bill or supplier return, reason and idempotency key are required")
	}
	if old, err := s.queries.GetSupplierCreditByIdempotency(ctx, db.GetSupplierCreditByIdempotencyParams{WorkspaceID: ws, IdempotencyKey: key}); err == nil {
		return supplierCreditView(old), nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return SupplierCreditView{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SupplierCreditView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	var supplierID int64
	var currency string
	var exponent int32
	var sourceDate pgtype.Date
	var bill db.SupplierBill
	var returnSource db.GetSupplierReturnSourceRow
	if in.SupplierBillID > 0 {
		bill, err = q.GetSupplierBillForUpdate(ctx, db.GetSupplierBillForUpdateParams{WorkspaceID: ws, ID: in.SupplierBillID})
		if errors.Is(err, pgx.ErrNoRows) {
			return SupplierCreditView{}, ErrNotFound
		}
		if err != nil {
			return SupplierCreditView{}, err
		}
		if bill.Status != "approved" && bill.Status != "partially_paid" {
			return SupplierCreditView{}, errors.New("only an approved bill can receive a supplier credit")
		}
		supplierID, currency, exponent, sourceDate = bill.SupplierID, bill.Currency, bill.CurrencyExponent, bill.BillDate
	} else {
		returnSource, err = q.GetSupplierReturnSource(ctx, db.GetSupplierReturnSourceParams{WorkspaceID: ws, ID: in.SupplierReturnID})
		if errors.Is(err, pgx.ErrNoRows) {
			return SupplierCreditView{}, ErrNotFound
		}
		if err != nil {
			return SupplierCreditView{}, err
		}
		credited, e := q.GetSupplierCreditsForReturnTotal(ctx, db.GetSupplierCreditsForReturnTotalParams{WorkspaceID: ws, SupplierReturnID: pgtype.Int8{Int64: in.SupplierReturnID, Valid: true}})
		if e != nil {
			return SupplierCreditView{}, e
		}
		supplierID, currency, exponent, sourceDate = returnSource.SupplierID, returnSource.Currency, returnSource.CurrencyExponent, returnSource.EffectiveOn
		amount, e := ParseMajorToMinor(in.Amount, int(exponent))
		if e != nil || amount <= 0 || amount > returnSource.TotalMinor-credited {
			return SupplierCreditView{}, errors.New("credit exceeds supplier return balance")
		}
	}
	amount, err := ParseMajorToMinor(in.Amount, int(exponent))
	if err != nil || amount <= 0 {
		return SupplierCreditView{}, errors.New("credit amount must be positive")
	}
	if in.SupplierBillID > 0 && amount > bill.OutstandingMinor {
		return SupplierCreditView{}, errors.New("credit exceeds bill outstanding balance")
	}
	credit, err := q.CreateSupplierCredit(ctx, db.CreateSupplierCreditParams{WorkspaceID: ws, SupplierID: supplierID, SupplierReturnID: pgtype.Int8{Int64: in.SupplierReturnID, Valid: in.SupplierReturnID > 0}, SupplierBillID: pgtype.Int8{Int64: in.SupplierBillID, Valid: in.SupplierBillID > 0}, Currency: currency, CurrencyExponent: exponent, AmountMinor: amount, Reason: reason, IdempotencyKey: key, CreatedByUserID: user})
	if err != nil {
		return SupplierCreditView{}, err
	}
	if in.SupplierBillID > 0 {
		if _, err = q.ApplySupplierCreditToBill(ctx, db.ApplySupplierCreditToBillParams{WorkspaceID: ws, ID: bill.ID, OutstandingMinor: amount}); err != nil {
			return SupplierCreditView{}, err
		}
	}
	entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: ws, SourceType: "supplier_credit", SourceID: credit.ID, EntryDate: sourceDate, Currency: currency, CurrencyExponent: exponent, Description: optionalPgText("Supplier credit note")})
	if err != nil {
		return SupplierCreditView{}, err
	}
	debitClass, creditDescription := "liability", "Supplier credit balance"
	if in.SupplierReturnID > 0 {
		debitClass, creditDescription = "asset", "Reduce return clearing balance"
	}
	if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: debitClass, DebitMinor: amount, Description: optionalPgText("Reduce Accounts Payable")}); err != nil {
		return SupplierCreditView{}, err
	}
	if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "asset", CreditMinor: amount, Description: optionalPgText(creditDescription)}); err != nil {
		return SupplierCreditView{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return SupplierCreditView{}, err
	}
	return supplierCreditView(credit), nil
}

func (s *Service) CreateSupplierRefund(ctx context.Context, ws, user int64, in CreateSupplierRefundInput) (SupplierCreditView, error) {
	key, reason := strings.TrimSpace(in.IdempotencyKey), strings.TrimSpace(in.Reason)
	if (in.SupplierCreditID <= 0 && in.SupplierAdvanceID <= 0) || (in.SupplierCreditID > 0 && in.SupplierAdvanceID > 0) || in.MoneyAccountID <= 0 || key == "" || reason == "" {
		return SupplierCreditView{}, errors.New("credit or advance, money account, reason and idempotency key are required")
	}
	if _, err := s.queries.GetSupplierRefundByIdempotency(ctx, db.GetSupplierRefundByIdempotencyParams{WorkspaceID: ws, IdempotencyKey: key}); err == nil {
		if in.SupplierCreditID > 0 {
			credit, e := s.queries.GetSupplierCreditForUpdate(ctx, db.GetSupplierCreditForUpdateParams{WorkspaceID: ws, ID: in.SupplierCreditID})
			if e != nil {
				return SupplierCreditView{}, e
			}
			return supplierCreditView(credit), nil
		}
		return SupplierCreditView{}, errors.New("refund already recorded; replay with the original source")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return SupplierCreditView{}, err
	}
	date, err := time.Parse("2006-01-02", strings.TrimSpace(in.RefundDate))
	if err != nil {
		return SupplierCreditView{}, errors.New("refund date must be YYYY-MM-DD")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SupplierCreditView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	var supplierID int64
	var currency string
	var exponent int32
	var outstanding int64
	var credit db.SupplierCredit
	var advance db.SupplierAdvance
	if in.SupplierCreditID > 0 {
		credit, err = q.GetSupplierCreditForUpdate(ctx, db.GetSupplierCreditForUpdateParams{WorkspaceID: ws, ID: in.SupplierCreditID})
		if errors.Is(err, pgx.ErrNoRows) {
			return SupplierCreditView{}, ErrNotFound
		}
		if err != nil {
			return SupplierCreditView{}, err
		}
		supplierID, currency, exponent, outstanding = credit.SupplierID, credit.Currency, credit.CurrencyExponent, credit.OutstandingMinor
	} else {
		advance, err = q.GetSupplierAdvanceForUpdate(ctx, db.GetSupplierAdvanceForUpdateParams{WorkspaceID: ws, ID: in.SupplierAdvanceID})
		if errors.Is(err, pgx.ErrNoRows) {
			return SupplierCreditView{}, ErrNotFound
		}
		if err != nil {
			return SupplierCreditView{}, err
		}
		supplierID, currency, exponent, outstanding = advance.SupplierID, advance.Currency, advance.CurrencyExponent, advance.AvailableMinor
	}
	amount, err := ParseMajorToMinor(in.Amount, int(exponent))
	if err != nil || amount <= 0 || amount > outstanding {
		return SupplierCreditView{}, errors.New("refund exceeds available supplier balance")
	}
	if _, err = q.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{WorkspaceID: ws, ID: in.MoneyAccountID}); err != nil {
		return SupplierCreditView{}, ErrForbiddenAccount
	}
	var updatedCredit db.SupplierCredit
	if in.SupplierCreditID > 0 {
		updatedCredit, err = q.ApplySupplierCreditBalance(ctx, db.ApplySupplierCreditBalanceParams{WorkspaceID: ws, ID: credit.ID, OutstandingMinor: amount})
		if err != nil {
			return SupplierCreditView{}, errors.New("supplier credit changed before refund")
		}
	} else {
		advance, err = q.RefundSupplierAdvance(ctx, db.RefundSupplierAdvanceParams{WorkspaceID: ws, ID: advance.ID, AvailableMinor: amount})
		if err != nil {
			return SupplierCreditView{}, errors.New("supplier advance changed before refund")
		}
	}
	refund, err := q.CreateSupplierRefund(ctx, db.CreateSupplierRefundParams{WorkspaceID: ws, SupplierID: supplierID, SupplierCreditID: pgtype.Int8{Int64: in.SupplierCreditID, Valid: in.SupplierCreditID > 0}, SupplierAdvanceID: pgtype.Int8{Int64: in.SupplierAdvanceID, Valid: in.SupplierAdvanceID > 0}, AmountMinor: amount, Currency: currency, CurrencyExponent: exponent, RefundDate: pgtype.Date{Time: date, Valid: true}, IdempotencyKey: key, Reason: reason, CreatedByUserID: user})
	if err != nil {
		return SupplierCreditView{}, err
	}
	entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: ws, SourceType: "supplier_refund", SourceID: refund.ID, EntryDate: pgtype.Date{Time: date, Valid: true}, Currency: currency, CurrencyExponent: exponent, Description: optionalPgText("Supplier cash refund")})
	if err != nil {
		return SupplierCreditView{}, err
	}
	if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountID: pgtype.Int8{Int64: in.MoneyAccountID, Valid: true}, AccountClass: "asset", DebitMinor: amount, Description: optionalPgText("Supplier refund received")}); err != nil {
		return SupplierCreditView{}, err
	}
	if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "asset", CreditMinor: amount, Description: optionalPgText("Clear supplier balance")}); err != nil {
		return SupplierCreditView{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return SupplierCreditView{}, err
	}
	if in.SupplierCreditID > 0 {
		return supplierCreditView(updatedCredit), nil
	}
	return SupplierCreditView{SupplierID: advance.SupplierID, AmountMinor: fmt.Sprint(amount), OutstandingMinor: fmt.Sprint(advance.AvailableMinor), Status: advance.Status}, nil
}
