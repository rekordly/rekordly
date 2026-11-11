package finance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
)

// Goods receipts are the first procurement posting: they record what was
// accepted, create stock movements for stock-tracked products, and accrue GRNI.
// A supplier bill is intentionally a later, separate Accounts Payable event.
type CreateGoodsReceiptInput struct {
	PurchaseOrderID  int64                   `json:"purchase_order_id" binding:"required"`
	LocationID       int64                   `json:"location_id"`
	ReceiptReference string                  `json:"receipt_reference"`
	ReceivedOn       string                  `json:"received_on" binding:"required"`
	Lines            []GoodsReceiptLineInput `json:"lines" binding:"required"`
	IdempotencyKey   string                  `json:"idempotency_key"`
}
type GoodsReceiptLineInput struct {
	PurchaseOrderLineID int64  `json:"purchase_order_line_id"`
	AcceptedQuantity    string `json:"accepted_quantity"`
}
type GoodsReceiptView struct {
	ID                  int64  `json:"id"`
	PurchaseOrderID     int64  `json:"purchase_order_id"`
	PurchaseOrderStatus string `json:"purchase_order_status"`
	ReceivedOn          string `json:"received_on"`
	TotalMinor          string `json:"total_minor"`
}
type GoodsReceiptLineView struct {
	ID                  int64  `json:"id"`
	PurchaseOrderLineID int64  `json:"purchase_order_line_id"`
	ProductID           *int64 `json:"product_id,omitempty"`
	Description         string `json:"description"`
	AcceptedQuantity    string `json:"accepted_quantity"`
	UnitCostMinor       string `json:"unit_cost_minor"`
	LineTotalMinor      string `json:"line_total_minor"`
}
type GoodsReceiptDetailView struct {
	GoodsReceiptView
	ReceiptReference *string                `json:"receipt_reference,omitempty"`
	Lines            []GoodsReceiptLineView `json:"lines"`
}
type ReceiptOptionLine struct {
	PurchaseOrderLineID int64  `json:"purchase_order_line_id"`
	Description         string `json:"description"`
	RemainingQuantity   string `json:"remaining_quantity"`
}
type GoodsReceiptListItem struct {
	ID               int64   `json:"id"`
	PurchaseOrderID  int64   `json:"purchase_order_id"`
	ReceivedOn       string  `json:"received_on"`
	ReceiptReference *string `json:"receipt_reference,omitempty"`
}

func (s *Service) ListGoodsReceipts(ctx context.Context, ws int64) ([]GoodsReceiptListItem, error) {
	rows, e := s.queries.ListGoodsReceipts(ctx, db.ListGoodsReceiptsParams{WorkspaceID: ws, Limit: 50})
	if e != nil {
		return nil, e
	}
	out := make([]GoodsReceiptListItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, GoodsReceiptListItem{ID: r.ID, PurchaseOrderID: r.PurchaseOrderID, ReceivedOn: r.ReceivedOn.Time.Format("2006-01-02"), ReceiptReference: nullableText(r.ReceiptReference)})
	}
	return out, nil
}

func (s *Service) ReceiptOptions(ctx context.Context, ws, purchaseOrderID int64) ([]ReceiptOptionLine, error) {
	po, err := s.queries.GetPurchaseOrderByID(ctx, db.GetPurchaseOrderByIDParams{WorkspaceID: ws, ID: purchaseOrderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if po.Status != "issued" && po.Status != "acknowledged" && po.Status != "partially_received" {
		return nil, errors.New("purchase order is not open for receiving")
	}
	lines, err := s.queries.ListReceiptPurchaseOrderLines(ctx, db.ListReceiptPurchaseOrderLinesParams{WorkspaceID: ws, PurchaseOrderID: purchaseOrderID})
	if err != nil {
		return nil, err
	}
	received, err := s.queries.ListReceivedQuantityByPurchaseOrderLine(ctx, db.ListReceivedQuantityByPurchaseOrderLineParams{WorkspaceID: ws, PurchaseOrderID: purchaseOrderID})
	if err != nil {
		return nil, err
	}
	prior := map[int64]decimal.Decimal{}
	for _, row := range received {
		prior[row.PurchaseOrderLineID] = row.ReceivedQuantity
	}
	out := make([]ReceiptOptionLine, 0, len(lines))
	for _, line := range lines {
		if remaining := line.Quantity.Sub(prior[line.ID]); remaining.GreaterThan(decimal.Zero) {
			out = append(out, ReceiptOptionLine{PurchaseOrderLineID: line.ID, Description: line.Description, RemainingQuantity: remaining.StringFixed(4)})
		}
	}
	return out, nil
}

func (s *Service) GetGoodsReceipt(ctx context.Context, ws, id int64) (GoodsReceiptDetailView, error) {
	row, err := s.queries.GetGoodsReceiptDetail(ctx, db.GetGoodsReceiptDetailParams{WorkspaceID: ws, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return GoodsReceiptDetailView{}, ErrNotFound
	}
	if err != nil {
		return GoodsReceiptDetailView{}, err
	}
	var lines []GoodsReceiptLineView
	if payload, ok := row.Lines.([]byte); ok && len(payload) > 0 {
		if err := json.Unmarshal(payload, &lines); err != nil {
			return GoodsReceiptDetailView{}, err
		}
	}
	return GoodsReceiptDetailView{GoodsReceiptView: GoodsReceiptView{ID: row.ID, PurchaseOrderID: row.PurchaseOrderID, ReceivedOn: row.ReceivedOn.Time.Format("2006-01-02")}, ReceiptReference: nullableText(row.ReceiptReference), Lines: lines}, nil
}

func (s *Service) CreateGoodsReceipt(ctx context.Context, ws, user int64, in CreateGoodsReceiptInput) (GoodsReceiptView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if in.PurchaseOrderID <= 0 || key == "" || len(key) > 200 || len(in.Lines) == 0 || len(in.Lines) > 100 {
		return GoodsReceiptView{}, errors.New("purchase order, receipt lines and idempotency key are required")
	}
	date, err := time.Parse("2006-01-02", strings.TrimSpace(in.ReceivedOn))
	if err != nil {
		return GoodsReceiptView{}, errors.New("received date must be YYYY-MM-DD")
	}
	if existing, e := s.queries.GetGoodsReceiptByIdempotency(ctx, db.GetGoodsReceiptByIdempotencyParams{WorkspaceID: ws, IdempotencyKey: key}); e == nil {
		if existing.PurchaseOrderID != in.PurchaseOrderID {
			return GoodsReceiptView{}, ErrDuplicateIdempotent
		}
		return GoodsReceiptView{ID: existing.ID, PurchaseOrderID: existing.PurchaseOrderID, ReceivedOn: existing.ReceivedOn.Time.Format("2006-01-02")}, nil
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return GoodsReceiptView{}, e
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return GoodsReceiptView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	po, err := q.GetPurchaseOrderForUpdate(ctx, db.GetPurchaseOrderForUpdateParams{WorkspaceID: ws, ID: in.PurchaseOrderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return GoodsReceiptView{}, ErrNotFound
	}
	if err != nil {
		return GoodsReceiptView{}, err
	}
	if po.Status != "issued" && po.Status != "acknowledged" && po.Status != "partially_received" {
		return GoodsReceiptView{}, errors.New("purchase order must be issued before receiving")
	}
	location, err := inventoryLocationFor(ctx, q, ws, in.LocationID)
	if err != nil {
		return GoodsReceiptView{}, err
	}
	if _, err = q.CreateInventoryCostingSettings(ctx, db.CreateInventoryCostingSettingsParams{WorkspaceID: ws, Currency: po.Currency}); err != nil {
		return GoodsReceiptView{}, err
	}
	lines, err := q.GetReceiptPurchaseOrderLinesForUpdate(ctx, db.GetReceiptPurchaseOrderLinesForUpdateParams{WorkspaceID: ws, PurchaseOrderID: po.ID})
	if err != nil {
		return GoodsReceiptView{}, fmt.Errorf("load purchase order receipt lines: %w", err)
	}
	if len(lines) == 0 {
		return GoodsReceiptView{}, errors.New("purchase order has no receivable lines")
	}
	received, err := q.ListReceivedQuantityByPurchaseOrderLine(ctx, db.ListReceivedQuantityByPurchaseOrderLineParams{WorkspaceID: ws, PurchaseOrderID: po.ID})
	if err != nil {
		return GoodsReceiptView{}, err
	}
	previous := map[int64]decimal.Decimal{}
	for _, row := range received {
		previous[row.PurchaseOrderLineID] = row.ReceivedQuantity
	}
	byID := map[int64]db.GetReceiptPurchaseOrderLinesForUpdateRow{}
	for _, line := range lines {
		byID[line.ID] = line
	}
	seen := map[int64]bool{}
	stockTotal, expenseTotal := int64(0), int64(0)
	prepared := make([]struct {
		line  db.GetReceiptPurchaseOrderLinesForUpdateRow
		qty   decimal.Decimal
		total int64
	}, 0, len(in.Lines))
	for _, input := range in.Lines {
		line, ok := byID[input.PurchaseOrderLineID]
		if !ok || seen[line.ID] {
			return GoodsReceiptView{}, errors.New("receipt line does not belong to this purchase order")
		}
		seen[line.ID] = true
		qty, _, e := parseRequestQuantity(input.AcceptedQuantity)
		if e != nil {
			return GoodsReceiptView{}, e
		}
		if previous[line.ID].Add(qty).GreaterThan(line.Quantity) {
			return GoodsReceiptView{}, errors.New("receipt quantity exceeds the open purchase order quantity")
		}
		total, e := requestLineTotal(line.ExpectedUnitCostMinor, qty)
		if e != nil {
			return GoodsReceiptView{}, e
		}
		if line.ProductKind == "stock_tracked" {
			stockTotal, e = CheckedAdd(stockTotal, total)
		} else {
			expenseTotal, e = CheckedAdd(expenseTotal, total)
		}
		if e != nil {
			return GoodsReceiptView{}, e
		}
		prepared = append(prepared, struct {
			line  db.GetReceiptPurchaseOrderLinesForUpdateRow
			qty   decimal.Decimal
			total int64
		}{line, qty, total})
	}
	receipt, err := q.CreateGoodsReceipt(ctx, db.CreateGoodsReceiptParams{WorkspaceID: ws, PurchaseOrderID: po.ID, ReceiptReference: optionalPgText(in.ReceiptReference), ReceivedOn: pgtype.Date{Time: date, Valid: true}, IdempotencyKey: key, CreatedByUserID: user, LocationID: pgtype.Int8{Int64: location.ID, Valid: true}})
	if err != nil {
		return GoodsReceiptView{}, err
	}
	for _, item := range prepared {
		rl, e := q.CreateGoodsReceiptLine(ctx, db.CreateGoodsReceiptLineParams{WorkspaceID: ws, GoodsReceiptID: receipt.ID, PurchaseOrderLineID: item.line.ID, ProductID: item.line.ProductID, AcceptedQuantity: item.qty, UnitCostMinor: item.line.ExpectedUnitCostMinor, LineTotalMinor: item.total})
		if e != nil {
			return GoodsReceiptView{}, e
		}
		if item.line.ProductKind == "stock_tracked" {
			if !item.line.ProductID.Valid {
				return GoodsReceiptView{}, errors.New("stock-tracked receipt line requires product")
			}
			if e = q.CreateInventoryReceiptMovement(ctx, db.CreateInventoryReceiptMovementParams{WorkspaceID: ws, ProductID: item.line.ProductID.Int64, GoodsReceiptLineID: pgtype.Int8{Int64: rl.ID, Valid: true}, LocationID: pgtype.Int8{Int64: location.ID, Valid: true}, SourceID: pgtype.Int8{Int64: receipt.ID, Valid: true}, QuantityDelta: item.qty, ValueDeltaMinor: item.total, OccurredOn: pgtype.Date{Time: date, Valid: true}}); e != nil {
				return GoodsReceiptView{}, e
			}
			if _, e = q.UpsertInventoryBalance(ctx, db.UpsertInventoryBalanceParams{WorkspaceID: ws, LocationID: location.ID, ProductID: item.line.ProductID.Int64, QuantityOnHand: item.qty, ValueOnHandMinor: item.total}); e != nil {
				return GoodsReceiptView{}, e
			}
		}
	}
	allComplete := true
	quantities := previous
	for _, item := range prepared {
		quantities[item.line.ID] = quantities[item.line.ID].Add(item.qty)
	}
	for _, line := range lines {
		if quantities[line.ID].LessThan(line.Quantity) {
			allComplete = false
			break
		}
	}
	status := "partially_received"
	if allComplete {
		status = "fully_received"
	}
	updated, err := q.UpdatePurchaseOrderReceiptStatus(ctx, db.UpdatePurchaseOrderReceiptStatusParams{WorkspaceID: ws, ID: po.ID, Status: status})
	if err != nil {
		return GoodsReceiptView{}, err
	}
	total, err := CheckedAdd(stockTotal, expenseTotal)
	if err != nil {
		return GoodsReceiptView{}, err
	}
	if err = s.postReceiptGRNI(ctx, q, ws, receipt, po, date, stockTotal, expenseTotal, total); err != nil {
		return GoodsReceiptView{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return GoodsReceiptView{}, err
	}
	return GoodsReceiptView{ID: receipt.ID, PurchaseOrderID: po.ID, PurchaseOrderStatus: updated.Status, ReceivedOn: date.Format("2006-01-02"), TotalMinor: fmt.Sprintf("%d", total)}, nil
}

func (s *Service) postReceiptGRNI(ctx context.Context, q *db.Queries, ws int64, receipt db.GoodsReceipt, po db.PurchaseOrder, date time.Time, stock, expense, total int64) error {
	entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: ws, SourceType: "goods_receipt", SourceID: receipt.ID, EntryDate: pgtype.Date{Time: date, Valid: true}, Currency: po.Currency, CurrencyExponent: po.CurrencyExponent, Description: optionalPgText("Goods receipt / GRNI")})
	if err != nil {
		return err
	}
	if stock > 0 {
		if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "asset", DebitMinor: stock, Description: optionalPgText("Inventory received")}); err != nil {
			return err
		}
	}
	if expense > 0 {
		if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "expense", DebitMinor: expense, Description: optionalPgText("Non-stock or service received")}); err != nil {
			return err
		}
	}
	if total <= 0 {
		return ErrLedgerUnbalanced
	}
	_, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "liability", CreditMinor: total, Description: optionalPgText("Goods received not invoiced")})
	return err
}
