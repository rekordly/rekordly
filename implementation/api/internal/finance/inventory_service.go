package finance

import (
	"context"
	"errors"
	"fmt"
	"strconv"
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
	ID                int64  `json:"id"`
	LocationID        int64  `json:"location_id"`
	LocationName      string `json:"location_name"`
	ProductID         int64  `json:"product_id"`
	ProductName       string `json:"product_name"`
	ProductKind       string `json:"product_kind"`
	QuantityOnHand    string `json:"quantity_on_hand"`
	ReservedQuantity  string `json:"reserved_quantity"`
	AvailableQuantity string `json:"available_quantity"`
	InTransitQuantity string `json:"in_transit_quantity"`
	ValueOnHandMinor  string `json:"value_on_hand_minor"`
	AverageCostMinor  string `json:"average_cost_minor"`
	CostingMethod     string `json:"costing_method"`
	Version           int32  `json:"version"`
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
	avail := row.QuantityOnHand.Sub(row.ReservedQuantity)
	if avail.IsNegative() {
		avail = decimal.Zero
	}
	return InventoryBalanceView{
		ID:                row.ID,
		LocationID:        row.LocationID,
		LocationName:      row.LocationName,
		ProductID:         row.ProductID,
		ProductName:       row.ProductName,
		ProductKind:       row.ProductKind,
		QuantityOnHand:    row.QuantityOnHand.StringFixed(4),
		ReservedQuantity:  row.ReservedQuantity.StringFixed(4),
		AvailableQuantity: avail.StringFixed(4),
		InTransitQuantity: row.InTransitQuantity.StringFixed(4),
		ValueOnHandMinor:  fmt.Sprintf("%d", row.ValueOnHandMinor),
		AverageCostMinor:  average.StringFixed(4),
		CostingMethod:     row.CostingMethod,
		Version:           row.Version,
	}
}

func (s *Service) ListInventoryBalances(ctx context.Context, workspaceID int64) ([]InventoryBalanceView, error) {
	rows, err := s.queries.ListInventoryBalances(ctx, db.ListInventoryBalancesParams{
		WorkspaceID: workspaceID,
		Limit:       200,
	})
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
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return InventoryBalanceView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	view, err := createOpeningStockTx(ctx, q, workspaceID, userID, in, pgtype.Int8{})
	if err != nil {
		return InventoryBalanceView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return InventoryBalanceView{}, err
	}
	return view, nil
}

func createOpeningStockTx(ctx context.Context, q *db.Queries, workspaceID, userID int64, in CreateOpeningStockInput, variantID pgtype.Int8) (InventoryBalanceView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if key == "" || len(key) > 200 || in.ProductID <= 0 {
		return InventoryBalanceView{}, errors.New("product and idempotency key are required")
	}
	if existing, err := q.GetInventoryOpeningByIdempotency(ctx, db.GetInventoryOpeningByIdempotencyParams{WorkspaceID: workspaceID, IdempotencyKey: key}); err == nil {
		balance, e := q.GetInventoryBalance(ctx, db.GetInventoryBalanceParams{WorkspaceID: workspaceID, LocationID: existing.LocationID, ProductID: existing.ProductID})
		if e != nil {
			return InventoryBalanceView{}, e
		}
		avail := balance.QuantityOnHand.Sub(balance.ReservedQuantity)
		if avail.IsNegative() {
			avail = decimal.Zero
		}
		return InventoryBalanceView{
			ID:                balance.ID,
			LocationID:        balance.LocationID,
			ProductID:         balance.ProductID,
			QuantityOnHand:    balance.QuantityOnHand.StringFixed(4),
			ReservedQuantity:  balance.ReservedQuantity.StringFixed(4),
			AvailableQuantity: avail.StringFixed(4),
			InTransitQuantity: balance.InTransitQuantity.StringFixed(4),
			ValueOnHandMinor:  fmt.Sprintf("%d", balance.ValueOnHandMinor),
			CostingMethod:     balance.CostingMethod,
			Version:           balance.Version,
		}, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return InventoryBalanceView{}, err
	}
	date, err := time.Parse("2006-01-02", strings.TrimSpace(in.EffectiveOn))
	if err != nil {
		date = time.Now()
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
		reason = "Opening stock"
	}
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
	if _, err = q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{WorkspaceID: workspaceID, ProductID: product.ID, VariantID: variantID, GoodsReceiptLineID: pgtype.Int8{}, LocationID: pgtype.Int8{Int64: location.ID, Valid: true}, MovementType: "opening", SourceType: "inventory_opening", SourceID: pgtype.Int8{Int64: entry.ID, Valid: true}, QuantityDelta: qty, ValueDeltaMinor: value, OccurredOn: pgtype.Date{Time: date, Valid: true}}); err != nil {
		return InventoryBalanceView{}, err
	}
	bal, err := q.UpsertInventoryBalance(ctx, db.UpsertInventoryBalanceParams{WorkspaceID: workspaceID, LocationID: location.ID, ProductID: product.ID, VariantID: variantID, QuantityOnHand: qty, ValueOnHandMinor: value})
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
	avail := bal.QuantityOnHand.Sub(bal.ReservedQuantity)
	if avail.IsNegative() {
		avail = decimal.Zero
	}
	avgCost := "0"
	if bal.QuantityOnHand.GreaterThan(decimal.Zero) {
		avgCost = decimal.NewFromInt(bal.ValueOnHandMinor).Div(bal.QuantityOnHand).StringFixed(4)
	}
	return InventoryBalanceView{
		ID:                bal.ID,
		LocationID:        bal.LocationID,
		LocationName:      location.Name,
		ProductID:         bal.ProductID,
		ProductName:       product.Name,
		ProductKind:       product.Kind,
		QuantityOnHand:    bal.QuantityOnHand.StringFixed(4),
		ReservedQuantity:  bal.ReservedQuantity.StringFixed(4),
		AvailableQuantity: avail.StringFixed(4),
		InTransitQuantity: bal.InTransitQuantity.StringFixed(4),
		ValueOnHandMinor:  fmt.Sprintf("%d", bal.ValueOnHandMinor),
		AverageCostMinor:  avgCost,
		CostingMethod:     bal.CostingMethod,
		Version:           bal.Version,
	}, nil
}

type IssueSaleStockInput struct {
	LocationID     int64  `json:"location_id"`
	ProductID      int64  `json:"product_id" binding:"required"`
	VariantID      *int64 `json:"variant_id"`
	Quantity       string `json:"quantity" binding:"required"`
	SaleID         *int64 `json:"sale_id"`
	ReservationID  *int64 `json:"reservation_id"`
	OccurredOn     string `json:"occurred_on" binding:"required"`
	Reason         string `json:"reason"`
	IdempotencyKey string `json:"idempotency_key"`
}

type StockIssueResultView struct {
	Balance       InventoryBalanceView `json:"balance"`
	COGSMinor     int64                `json:"cogs_minor"`
	LedgerEntryID int64                `json:"ledger_entry_id"`
}

func (s *Service) IssueSaleStock(ctx context.Context, workspaceID, userID int64, in IssueSaleStockInput) (StockIssueResultView, error) {
	if in.ProductID <= 0 {
		return StockIssueResultView{}, errors.New("product is required")
	}
	qty, _, err := parseRequestQuantity(in.Quantity)
	if err != nil {
		return StockIssueResultView{}, err
	}
	if !qty.GreaterThan(decimal.Zero) {
		return StockIssueResultView{}, errors.New("quantity must be greater than zero")
	}
	occurredOn, err := time.Parse("2006-01-02", strings.TrimSpace(in.OccurredOn))
	if err != nil {
		return StockIssueResultView{}, errors.New("occurred_on must be YYYY-MM-DD")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StockIssueResultView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	product, err := q.GetProductByID(ctx, db.GetProductByIDParams{
		WorkspaceID: workspaceID,
		ID:          in.ProductID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return StockIssueResultView{}, ErrNotFound
	}
	if err != nil {
		return StockIssueResultView{}, err
	}
	if product.Kind != "stock_tracked" {
		return StockIssueResultView{}, errors.New("stock issue requires a stock-tracked product")
	}

	locationID := in.LocationID
	var fromReservation bool

	if in.ReservationID != nil && *in.ReservationID > 0 {
		res, err := q.GetStockReservationForUpdate(ctx, db.GetStockReservationForUpdateParams{
			WorkspaceID: workspaceID,
			ID:          *in.ReservationID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return StockIssueResultView{}, errors.New("reservation not found")
		}
		if err != nil {
			return StockIssueResultView{}, err
		}
		if res.Status != "active" {
			return StockIssueResultView{}, ErrReservationNotActive
		}
		locationID = res.LocationID
		fromReservation = true

		if _, err := q.UpdateStockReservationStatus(ctx, db.UpdateStockReservationStatusParams{
			WorkspaceID: workspaceID,
			ID:          res.ID,
			Status:      "fulfilled",
		}); err != nil {
			return StockIssueResultView{}, err
		}
	}

	location, err := inventoryLocationFor(ctx, q, workspaceID, locationID)
	if err != nil {
		return StockIssueResultView{}, err
	}

	bal, err := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
		WorkspaceID: workspaceID,
		LocationID:  location.ID,
		ProductID:   product.ID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return StockIssueResultView{}, ErrInsufficientStock
	}
	if err != nil {
		return StockIssueResultView{}, err
	}

	if !fromReservation {
		available := bal.QuantityOnHand.Sub(bal.ReservedQuantity)
		if available.LessThan(qty) {
			return StockIssueResultView{}, ErrInsufficientStock
		}
	} else {
		if bal.QuantityOnHand.LessThan(qty) {
			return StockIssueResultView{}, ErrInsufficientStock
		}
	}

	// Weighted-average COGS calculation:
	// cogs_minor = round( (value_on_hand_minor / quantity_on_hand) * qty )
	unitCostDec := decimal.NewFromInt(bal.ValueOnHandMinor).Div(bal.QuantityOnHand)
	cogsDec := unitCostDec.Mul(qty).Round(0)
	cogsMinor := cogsDec.IntPart()

	newQty := bal.QuantityOnHand.Sub(qty)
	var newValueMinor int64
	if newQty.IsZero() {
		newValueMinor = 0
		cogsMinor = bal.ValueOnHandMinor
	} else {
		newValueMinor = bal.ValueOnHandMinor - cogsMinor
		if newValueMinor < 0 {
			newValueMinor = 0
		}
	}

	newReserved := bal.ReservedQuantity
	if fromReservation {
		newReserved = newReserved.Sub(qty)
		if newReserved.IsNegative() {
			newReserved = decimal.Zero
		}
	}

	updatedBal, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
		WorkspaceID:       workspaceID,
		LocationID:        location.ID,
		ProductID:         product.ID,
		QuantityOnHand:    newQty,
		ReservedQuantity:  newReserved,
		InTransitQuantity: bal.InTransitQuantity,
		ValueOnHandMinor:  newValueMinor,
	})
	if err != nil {
		return StockIssueResultView{}, fmt.Errorf("update balance for sale: %w", err)
	}

	var sourceID pgtype.Int8
	if in.SaleID != nil && *in.SaleID > 0 {
		sourceID = pgtype.Int8{Int64: *in.SaleID, Valid: true}
	}

	// Movement: quantity_delta and value_delta_minor represent change (negative for reduction)
	if _, err := q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{
		WorkspaceID:        workspaceID,
		ProductID:          product.ID,
		GoodsReceiptLineID: pgtype.Int8{},
		LocationID:         pgtype.Int8{Int64: location.ID, Valid: true},
		MovementType:       "sale",
		SourceType:         "sale",
		SourceID:           sourceID,
		QuantityDelta:      qty.Neg(),
		ValueDeltaMinor:    -cogsMinor,
		OccurredOn:         pgtype.Date{Time: occurredOn, Valid: true},
	}); err != nil {
		return StockIssueResultView{}, fmt.Errorf("create sale inventory movement: %w", err)
	}

	currency := "NGN"
	if costSettings, err := q.GetCostingSettings(ctx, workspaceID); err == nil {
		currency = costSettings.Currency
	}

	// Double-entry GL posting: Debit COGS (expense), Credit Inventory Asset (asset)
	ledger, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      workspaceID,
		SourceType:       "cogs_sale",
		SourceID:         updatedBal.ID,
		EntryDate:        pgtype.Date{Time: occurredOn, Valid: true},
		Currency:         currency,
		CurrencyExponent: int32(CurrencyExponent(currency)),
		Description:      optionalPgText(fmt.Sprintf("COGS recognition for sale of %s", product.Name)),
	})
	if err != nil {
		return StockIssueResultView{}, fmt.Errorf("create COGS ledger entry: %w", err)
	}

	if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
		LedgerEntryID: ledger.ID,
		WorkspaceID:   workspaceID,
		AccountClass:  "expense",
		DebitMinor:    cogsMinor,
		Description:   optionalPgText("Cost of Goods Sold"),
	}); err != nil {
		return StockIssueResultView{}, fmt.Errorf("create COGS debit line: %w", err)
	}

	if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
		LedgerEntryID: ledger.ID,
		WorkspaceID:   workspaceID,
		AccountClass:  "asset",
		CreditMinor:   cogsMinor,
		Description:   optionalPgText("Inventory Asset reduction"),
	}); err != nil {
		return StockIssueResultView{}, fmt.Errorf("create Inventory credit line: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return StockIssueResultView{}, fmt.Errorf("commit stock issue: %w", err)
	}

	availFinal := updatedBal.QuantityOnHand.Sub(updatedBal.ReservedQuantity)
	if availFinal.IsNegative() {
		availFinal = decimal.Zero
	}

	avgCostFinal := decimal.Zero
	if updatedBal.QuantityOnHand.GreaterThan(decimal.Zero) {
		avgCostFinal = decimal.NewFromInt(updatedBal.ValueOnHandMinor).Div(updatedBal.QuantityOnHand)
	}

	return StockIssueResultView{
		Balance: InventoryBalanceView{
			ID:                updatedBal.ID,
			LocationID:        updatedBal.LocationID,
			LocationName:      location.Name,
			ProductID:         updatedBal.ProductID,
			ProductName:       product.Name,
			ProductKind:       product.Kind,
			QuantityOnHand:    updatedBal.QuantityOnHand.StringFixed(4),
			ReservedQuantity:  updatedBal.ReservedQuantity.StringFixed(4),
			AvailableQuantity: availFinal.StringFixed(4),
			InTransitQuantity: updatedBal.InTransitQuantity.StringFixed(4),
			ValueOnHandMinor:  fmt.Sprintf("%d", updatedBal.ValueOnHandMinor),
			AverageCostMinor:  avgCostFinal.StringFixed(4),
			CostingMethod:     updatedBal.CostingMethod,
			Version:           updatedBal.Version,
		},
		COGSMinor:     cogsMinor,
		LedgerEntryID: ledger.ID,
	}, nil
}

type InventoryOverview struct {
	Products        []ProductSummary       `json:"products"`
	Balances        []InventoryBalanceView `json:"balances"`
	Outlets         []OutletView           `json:"outlets"`
	TotalValueMinor int64                  `json:"total_value_minor"`
	InStockCount    int                    `json:"in_stock_count"`
	OutOfStockCount int                    `json:"out_of_stock_count"`
	OutletSummaries []OutletStockSummary   `json:"outlet_summaries"`
}

type OutletStockSummary struct {
	OutletID        int64 `json:"outlet_id"`
	ProductsInStock int   `json:"products_in_stock"`
	StockValueMinor int64 `json:"stock_value_minor"`
}

func (s *Service) GetInventoryOverview(ctx context.Context, workspaceID int64) (InventoryOverview, error) {
	products, err := s.ListProducts(ctx, workspaceID, ListProductsFilter{Kind: "stock_tracked", Limit: 200})
	if err != nil {
		return InventoryOverview{}, err
	}
	balances, err := s.ListInventoryBalances(ctx, workspaceID)
	if err != nil {
		return InventoryOverview{}, err
	}
	outlets, err := s.ListOutlets(ctx, workspaceID, true)
	if err != nil {
		return InventoryOverview{}, err
	}

	var totalValue int64
	inStockMap := make(map[int64]bool)
	outletVal := make(map[int64]int64)
	outletProds := make(map[int64]map[int64]bool)

	for _, b := range balances {
		val, _ := strconv.ParseInt(b.ValueOnHandMinor, 10, 64)
		totalValue += val
		outletVal[b.LocationID] += val

		qty, _ := decimal.NewFromString(b.QuantityOnHand)
		if qty.GreaterThan(decimal.Zero) {
			inStockMap[b.ProductID] = true
			if outletProds[b.LocationID] == nil {
				outletProds[b.LocationID] = make(map[int64]bool)
			}
			outletProds[b.LocationID][b.ProductID] = true
		}
	}

	activeProds := 0
	inStockCount := 0
	for _, p := range products {
		if p.Status != "archived" {
			activeProds++
			if inStockMap[p.ID] {
				inStockCount++
			}
		}
	}
	outOfStockCount := activeProds - inStockCount

	outletSummaries := make([]OutletStockSummary, 0, len(outlets))
	for _, o := range outlets {
		outletSummaries = append(outletSummaries, OutletStockSummary{
			OutletID:        o.ID,
			ProductsInStock: len(outletProds[o.ID]),
			StockValueMinor: outletVal[o.ID],
		})
	}

	return InventoryOverview{
		Products:        products,
		Balances:        balances,
		Outlets:         outlets,
		TotalValueMinor: totalValue,
		InStockCount:    inStockCount,
		OutOfStockCount: outOfStockCount,
		OutletSummaries: outletSummaries,
	}, nil
}
