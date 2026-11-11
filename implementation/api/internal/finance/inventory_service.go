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

type CreateOpeningStockInput struct {
	ProductID      int64  `json:"product_id" binding:"required"`
	LocationID     int64  `json:"location_id"`
	Quantity       string `json:"quantity" binding:"required"`
	UnitCost       string `json:"unit_cost" binding:"required"`
	Currency       string `json:"currency" binding:"required"`
	EffectiveOn    string `json:"effective_on" binding:"required"`
	Reason         string `json:"reason" binding:"required"`
	IdempotencyKey string `json:"idempotency_key"`
}

type InventoryBalanceView struct {
	ID               int64  `json:"id"`
	LocationID       int64  `json:"location_id"`
	LocationName     string `json:"location_name"`
	ProductID        int64  `json:"product_id"`
	ProductName      string `json:"product_name"`
	ProductKind      string `json:"product_kind"`
	QuantityOnHand   string `json:"quantity_on_hand"`
	ValueOnHandMinor string `json:"value_on_hand_minor"`
	AverageCostMinor string `json:"average_cost_minor"`
	CostingMethod    string `json:"costing_method"`
	Version          int32  `json:"version"`
}

func inventoryLocationFor(ctx context.Context, q *db.Queries, workspaceID, locationID int64) (db.InventoryLocation, error) {
	if locationID > 0 {
		location, err := q.GetInventoryLocation(ctx, db.GetInventoryLocationParams{WorkspaceID: workspaceID, ID: locationID})
		if errors.Is(err, pgx.ErrNoRows) {
			return db.InventoryLocation{}, ErrNotFound
		}
		return location, err
	}
	return q.GetOrCreateDefaultInventoryLocation(ctx, workspaceID)
}

func inventoryBalanceView(row db.ListInventoryBalancesRow) InventoryBalanceView {
	average := decimal.Zero
	if row.QuantityOnHand.GreaterThan(decimal.Zero) {
		average = decimal.NewFromInt(row.ValueOnHandMinor).Div(row.QuantityOnHand)
	}
	return InventoryBalanceView{ID: row.ID, LocationID: row.LocationID, LocationName: row.LocationName, ProductID: row.ProductID, ProductName: row.ProductName, ProductKind: row.ProductKind, QuantityOnHand: row.QuantityOnHand.StringFixed(4), ValueOnHandMinor: fmt.Sprintf("%d", row.ValueOnHandMinor), AverageCostMinor: average.StringFixed(4), CostingMethod: row.CostingMethod, Version: row.Version}
}

func (s *Service) ListInventoryBalances(ctx context.Context, workspaceID int64) ([]InventoryBalanceView, error) {
	rows, err := s.queries.ListInventoryBalances(ctx, db.ListInventoryBalancesParams{WorkspaceID: workspaceID, Limit: 200})
	if err != nil {
		return nil, err
	}
	out := make([]InventoryBalanceView, 0, len(rows))
	for _, row := range rows {
		out = append(out, inventoryBalanceView(row))
	}
	return out, nil
}

func (s *Service) CreateOpeningStock(ctx context.Context, workspaceID, userID int64, in CreateOpeningStockInput) (InventoryBalanceView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if key == "" || len(key) > 200 || in.ProductID <= 0 {
		return InventoryBalanceView{}, errors.New("product and idempotency key are required")
	}
	if existing, err := s.queries.GetInventoryOpeningByIdempotency(ctx, db.GetInventoryOpeningByIdempotencyParams{WorkspaceID: workspaceID, IdempotencyKey: key}); err == nil {
		balance, e := s.queries.GetInventoryBalance(ctx, db.GetInventoryBalanceParams{WorkspaceID: workspaceID, LocationID: existing.LocationID, ProductID: existing.ProductID})
		if e != nil {
			return InventoryBalanceView{}, e
		}
		return InventoryBalanceView{ID: balance.ID, LocationID: balance.LocationID, ProductID: balance.ProductID, QuantityOnHand: balance.QuantityOnHand.StringFixed(4), ValueOnHandMinor: fmt.Sprintf("%d", balance.ValueOnHandMinor), CostingMethod: balance.CostingMethod, Version: balance.Version}, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return InventoryBalanceView{}, err
	}
	date, err := time.Parse("2006-01-02", strings.TrimSpace(in.EffectiveOn))
	if err != nil {
		return InventoryBalanceView{}, errors.New("effective date must be YYYY-MM-DD")
	}
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if len(currency) != 3 {
		return InventoryBalanceView{}, ErrInvalidCurrency
	}
	qty, _, err := parseRequestQuantity(in.Quantity)
	if err != nil {
		return InventoryBalanceView{}, err
	}
	unitCost, err := ParseMajorToMinor(in.UnitCost, CurrencyExponent(currency))
	if err != nil {
		return InventoryBalanceView{}, err
	}
	if unitCost <= 0 {
		return InventoryBalanceView{}, errors.New("unit cost must be greater than zero")
	}
	value, err := requestLineTotal(unitCost, qty)
	if err != nil || value <= 0 {
		return InventoryBalanceView{}, errors.New("opening stock value must be greater than zero")
	}
	reason := strings.TrimSpace(in.Reason)
	if reason == "" || len(reason) > 500 {
		return InventoryBalanceView{}, errors.New("a reason is required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return InventoryBalanceView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	product, err := q.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: in.ProductID})
	if errors.Is(err, pgx.ErrNoRows) {
		return InventoryBalanceView{}, ErrNotFound
	}
	if err != nil {
		return InventoryBalanceView{}, err
	}
	if product.Kind != "stock_tracked" {
		return InventoryBalanceView{}, errors.New("opening stock requires a stock-tracked product")
	}
	location, err := inventoryLocationFor(ctx, q, workspaceID, in.LocationID)
	if err != nil {
		return InventoryBalanceView{}, err
	}
	if _, err = q.CreateInventoryCostingSettings(ctx, db.CreateInventoryCostingSettingsParams{WorkspaceID: workspaceID, Currency: currency}); err != nil {
		return InventoryBalanceView{}, err
	}
	entry, err := q.CreateInventoryOpeningEntry(ctx, db.CreateInventoryOpeningEntryParams{WorkspaceID: workspaceID, LocationID: location.ID, ProductID: product.ID, Quantity: qty, UnitCostMinor: unitCost, ValueMinor: value, EffectiveOn: pgtype.Date{Time: date, Valid: true}, Reason: reason, IdempotencyKey: key, CreatedByUserID: userID})
	if err != nil {
		return InventoryBalanceView{}, err
	}
	if _, err = q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{WorkspaceID: workspaceID, ProductID: product.ID, GoodsReceiptLineID: pgtype.Int8{}, LocationID: pgtype.Int8{Int64: location.ID, Valid: true}, MovementType: "opening", SourceType: "inventory_opening", SourceID: pgtype.Int8{Int64: entry.ID, Valid: true}, QuantityDelta: qty, ValueDeltaMinor: value, OccurredOn: pgtype.Date{Time: date, Valid: true}}); err != nil {
		return InventoryBalanceView{}, err
	}
	bal, err := q.UpsertInventoryBalance(ctx, db.UpsertInventoryBalanceParams{WorkspaceID: workspaceID, LocationID: location.ID, ProductID: product.ID, QuantityOnHand: qty, ValueOnHandMinor: value})
	if err != nil {
		return InventoryBalanceView{}, err
	}
	ledger, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: workspaceID, SourceType: "inventory_opening", SourceID: entry.ID, EntryDate: pgtype.Date{Time: date, Valid: true}, Currency: currency, CurrencyExponent: int32(CurrencyExponent(currency)), Description: optionalPgText("Opening inventory balance")})
	if err != nil {
		return InventoryBalanceView{}, err
	}
	if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: ledger.ID, WorkspaceID: workspaceID, AccountClass: "asset", DebitMinor: value, Description: optionalPgText("Opening inventory")}); err != nil {
		return InventoryBalanceView{}, err
	}
	if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: ledger.ID, WorkspaceID: workspaceID, AccountClass: "equity", CreditMinor: value, Description: optionalPgText("Opening balance equity")}); err != nil {
		return InventoryBalanceView{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return InventoryBalanceView{}, err
	}
	return InventoryBalanceView{ID: bal.ID, LocationID: bal.LocationID, LocationName: location.Name, ProductID: bal.ProductID, ProductName: product.Name, ProductKind: product.Kind, QuantityOnHand: bal.QuantityOnHand.StringFixed(4), ValueOnHandMinor: fmt.Sprintf("%d", bal.ValueOnHandMinor), AverageCostMinor: decimal.NewFromInt(bal.ValueOnHandMinor).Div(bal.QuantityOnHand).StringFixed(4), CostingMethod: bal.CostingMethod, Version: bal.Version}, nil
}
