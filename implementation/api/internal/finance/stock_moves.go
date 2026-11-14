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

// StockLineInput is one product line on a sale or purchase.
// For a sale UnitPrice is the selling price; for a purchase it is what was paid per unit.
type StockLineInput struct {
	ProductID   *int64 `json:"product_id"`
	VariantID   *int64 `json:"variant_id"`
	Description string `json:"description"`
	Quantity    string `json:"quantity"`
	UnitPrice   string `json:"unit_price"`
}

type preparedStockLine struct {
	product     *db.Product
	variantID   pgtype.Int8
	description string
	quantity    decimal.Decimal
	unitMinor   int64
	amountMinor int64
}

func (l preparedStockLine) productParam() pgtype.Int8 {
	if l.product == nil {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: l.product.ID, Valid: true}
}

func (l preparedStockLine) movesStock() bool {
	return l.product != nil && l.product.Kind == "stock_tracked"
}

// InsufficientStockError says plainly which product is short, and where.
type InsufficientStockError struct {
	Product   string
	Location  string
	Available decimal.Decimal
	Unit      string
}

func (e *InsufficientStockError) Error() string {
	if e.Available.LessThanOrEqual(decimal.Zero) {
		return fmt.Sprintf("%s is out of stock in %s. Add stock to it first, or remove it from this record.", e.Product, e.Location)
	}
	return fmt.Sprintf("Only %s %s of %s left in %s. Add stock first, or lower the quantity.", e.Available.String(), e.Unit, e.Product, e.Location)
}

func (e *InsufficientStockError) Unwrap() error { return ErrInsufficientStock }

const maxStockLines = 200

// prepareStockLines checks each line, links products from this workspace and works out the amounts.
func prepareStockLines(ctx context.Context, q *db.Queries, workspaceID int64, lines []StockLineInput, exponent int) ([]preparedStockLine, int64, error) {
	if len(lines) > maxStockLines {
		return nil, 0, fmt.Errorf("a record can have at most %d items", maxStockLines)
	}
	out := make([]preparedStockLine, 0, len(lines))
	var total int64
	for index, line := range lines {
		prepared := preparedStockLine{description: strings.TrimSpace(line.Description)}
		if line.ProductID != nil && *line.ProductID > 0 {
			product, err := q.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: *line.ProductID})
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, 0, fmt.Errorf("item %d: product not found", index+1)
			}
			if err != nil {
				return nil, 0, err
			}
			prepared.product = &product
			if prepared.description == "" {
				prepared.description = product.Name
			}
		}
		if line.VariantID != nil && *line.VariantID > 0 {
			if prepared.product == nil {
				return nil, 0, fmt.Errorf("item %d: choose the product for this variant", index+1)
			}
			variant, err := q.GetVariantByID(ctx, db.GetVariantByIDParams{WorkspaceID: workspaceID, ID: *line.VariantID})
			if err != nil || variant.ProductID != prepared.product.ID {
				return nil, 0, fmt.Errorf("item %d: this variant does not belong to %s", index+1, prepared.product.Name)
			}
			prepared.variantID = pgtype.Int8{Int64: variant.ID, Valid: true}
		}
		if prepared.description == "" {
			return nil, 0, fmt.Errorf("item %d: describe the item", index+1)
		}
		qty, _, err := parseRequestQuantity(line.Quantity)
		if err != nil || !qty.GreaterThan(decimal.Zero) {
			return nil, 0, fmt.Errorf("item %d: quantity must be a number above zero", index+1)
		}
		prepared.quantity = qty
		unit, err := ParseMajorToMinor(strings.TrimSpace(line.UnitPrice), exponent)
		if err != nil || unit < 0 {
			return nil, 0, fmt.Errorf("item %d: price must be a number, like 15000", index+1)
		}
		prepared.unitMinor = unit
		amount, err := requestLineTotal(unit, qty)
		if err != nil {
			return nil, 0, fmt.Errorf("item %d: %w", index+1, err)
		}
		prepared.amountMinor = amount
		total += amount
		out = append(out, prepared)
	}
	return out, total, nil
}

// issueStockTx takes stock out for a sale or invoice, at its average cost, and records the
// cost of goods sold. It refuses to take more than is available.
func issueStockTx(ctx context.Context, q *db.Queries, workspaceID int64, product db.Product, location db.InventoryLocation, qty decimal.Decimal, date time.Time, sourceType string, sourceID int64, currency string) error {
	bal, err := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{WorkspaceID: workspaceID, LocationID: location.ID, ProductID: product.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		return &InsufficientStockError{Product: product.Name, Location: location.Name, Available: decimal.Zero, Unit: product.UnitName}
	}
	if err != nil {
		return err
	}
	available := bal.QuantityOnHand.Sub(bal.ReservedQuantity)
	if available.LessThan(qty) {
		return &InsufficientStockError{Product: product.Name, Location: location.Name, Available: available, Unit: product.UnitName}
	}
	var cost int64
	newQty := bal.QuantityOnHand.Sub(qty)
	if newQty.IsZero() {
		cost = bal.ValueOnHandMinor
	} else if bal.QuantityOnHand.GreaterThan(decimal.Zero) {
		cost = decimal.NewFromInt(bal.ValueOnHandMinor).Div(bal.QuantityOnHand).Mul(qty).Round(0).IntPart()
		if cost > bal.ValueOnHandMinor {
			cost = bal.ValueOnHandMinor
		}
	}
	if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
		WorkspaceID: workspaceID, LocationID: location.ID, ProductID: product.ID,
		QuantityOnHand: newQty, ReservedQuantity: bal.ReservedQuantity, InTransitQuantity: bal.InTransitQuantity,
		ValueOnHandMinor: bal.ValueOnHandMinor - cost,
	}); err != nil {
		return fmt.Errorf("update stock for %s: %w", product.Name, err)
	}
	movement, err := q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{
		WorkspaceID: workspaceID, ProductID: product.ID, LocationID: pgtype.Int8{Int64: location.ID, Valid: true},
		MovementType: "sale", SourceType: sourceType, SourceID: pgtype.Int8{Int64: sourceID, Valid: true},
		QuantityDelta: qty.Neg(), ValueDeltaMinor: -cost, OccurredOn: pgtype.Date{Time: date, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("record stock movement for %s: %w", product.Name, err)
	}
	if cost > 0 {
		return postStockLedger(ctx, q, workspaceID, "cogs_sale", movement.ID, date, currency,
			fmt.Sprintf("Cost of %s sold", product.Name), "expense", "asset", cost)
	}
	return nil
}

// receiveStockTx adds bought stock at what was paid, which also moves the average cost.
// The purchase payment is posted as an expense elsewhere, so the stock part is moved
// from expense to the inventory asset here.
func receiveStockTx(ctx context.Context, q *db.Queries, workspaceID int64, product db.Product, location db.InventoryLocation, qty decimal.Decimal, value int64, date time.Time, sourceType string, sourceID int64, currency string) error {
	if _, err := q.CreateInventoryCostingSettings(ctx, db.CreateInventoryCostingSettingsParams{WorkspaceID: workspaceID, Currency: currency}); err != nil {
		return err
	}
	if _, err := q.UpsertInventoryBalance(ctx, db.UpsertInventoryBalanceParams{WorkspaceID: workspaceID, LocationID: location.ID, ProductID: product.ID, QuantityOnHand: qty, ValueOnHandMinor: value}); err != nil {
		return fmt.Errorf("update stock for %s: %w", product.Name, err)
	}
	movement, err := q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{
		WorkspaceID: workspaceID, ProductID: product.ID, LocationID: pgtype.Int8{Int64: location.ID, Valid: true},
		MovementType: "purchase", SourceType: sourceType, SourceID: pgtype.Int8{Int64: sourceID, Valid: true},
		QuantityDelta: qty, ValueDeltaMinor: value, OccurredOn: pgtype.Date{Time: date, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("record stock movement for %s: %w", product.Name, err)
	}
	if value > 0 {
		return postStockLedger(ctx, q, workspaceID, "purchase", movement.ID, date, currency,
			fmt.Sprintf("%s bought into stock", product.Name), "asset", "expense", value)
	}
	return nil
}

// returnIssuedStockTx puts back stock that a record took out, e.g. when an invoice is voided.
func returnIssuedStockTx(ctx context.Context, q *db.Queries, workspaceID int64, sourceType string, sourceID int64, date time.Time, currency string) error {
	movements, err := q.ListMovementsBySource(ctx, db.ListMovementsBySourceParams{WorkspaceID: workspaceID, SourceType: sourceType, SourceID: pgtype.Int8{Int64: sourceID, Valid: true}})
	if err != nil {
		return err
	}
	for _, m := range movements {
		if m.MovementType != "sale" || !m.QuantityDelta.IsNegative() || !m.LocationID.Valid {
			continue
		}
		qty := m.QuantityDelta.Neg()
		value := -m.ValueDeltaMinor
		if _, err := q.UpsertInventoryBalance(ctx, db.UpsertInventoryBalanceParams{WorkspaceID: workspaceID, LocationID: m.LocationID.Int64, ProductID: m.ProductID, QuantityOnHand: qty, ValueOnHandMinor: value}); err != nil {
			return err
		}
		returned, err := q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{
			WorkspaceID: workspaceID, ProductID: m.ProductID, LocationID: m.LocationID,
			MovementType: "return", SourceType: sourceType, SourceID: m.SourceID,
			QuantityDelta: qty, ValueDeltaMinor: value, OccurredOn: pgtype.Date{Time: date, Valid: true},
		})
		if err != nil {
			return err
		}
		if value > 0 {
			if err := postStockLedger(ctx, q, workspaceID, "reversal", returned.ID, date, currency, "Stock returned from a voided record", "asset", "expense", value); err != nil {
				return err
			}
		}
	}
	return nil
}

func postStockLedger(ctx context.Context, q *db.Queries, workspaceID int64, sourceType string, sourceID int64, date time.Time, currency, description, debitClass, creditClass string, amount int64) error {
	entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID: workspaceID, SourceType: sourceType, SourceID: sourceID,
		EntryDate: pgtype.Date{Time: date, Valid: true}, Currency: currency,
		CurrencyExponent: int32(CurrencyExponent(currency)), Description: optionalPgText(description),
	})
	if err != nil {
		return fmt.Errorf("post stock ledger: %w", err)
	}
	if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: debitClass, DebitMinor: amount, Description: optionalPgText(description)}); err != nil {
		return err
	}
	_, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: creditClass, CreditMinor: amount, Description: optionalPgText(description)})
	return err
}

// ---------------- product stock history ----------------

type ProductStockMovement struct {
	ID              int64     `json:"id"`
	Kind            string    `json:"kind"`
	SourceType      string    `json:"source_type"`
	SourceID        *int64    `json:"source_id,omitempty"`
	Summary         string    `json:"summary"`
	Party           string    `json:"party,omitempty"`
	Reference       string    `json:"reference,omitempty"`
	LocationID      *int64    `json:"location_id,omitempty"`
	LocationName    string    `json:"location_name"`
	QuantityDelta   string    `json:"quantity_delta"`
	ValueDeltaMinor string    `json:"value_delta_minor"`
	OccurredOn      string    `json:"occurred_on"`
	CreatedAt       time.Time `json:"created_at"`
}

var adjustmentReasonWords = map[string]string{
	"restock": "Stock added", "found": "Found stock", "correction": "Correction",
	"damage": "Damaged", "spoilage": "Spoiled", "shrinkage": "Shrinkage", "lost": "Lost",
	"expired": "Expired", "internal_use": "Used in the business", "other": "Other",
}

func movementSummary(row db.ListProductMovementsRow) string {
	switch row.SourceType {
	case "sale":
		return "Sold"
	case "invoice":
		if row.MovementType == "return" {
			return "Returned (invoice voided)"
		}
		return "Invoiced"
	case "purchase":
		return "Bought"
	case "goods_receipt":
		return "Received from supplier"
	case "inventory_opening":
		return "Opening stock"
	case "inventory_transfer":
		if row.QuantityDelta.IsNegative() {
			return "Moved out"
		}
		return "Moved in"
	case "stock_count":
		return "Stock count correction"
	case "supplier_return":
		return "Returned to supplier"
	case "inventory_adjustment":
		if word, ok := adjustmentReasonWords[row.SourceParty]; ok {
			return word
		}
		return "Adjusted"
	}
	return "Stock change"
}

func (s *Service) ListProductStockMovements(ctx context.Context, workspaceID, productID int64, beforeID int64, limit int32) ([]ProductStockMovement, error) {
	if _, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: productID}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProductNotFound
		}
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.queries.ListProductMovements(ctx, db.ListProductMovementsParams{
		WorkspaceID: workspaceID, ProductID: productID, Limit: limit,
		BeforeID: pgtype.Int8{Int64: beforeID, Valid: beforeID > 0},
	})
	if err != nil {
		return nil, err
	}
	out := make([]ProductStockMovement, 0, len(rows))
	for _, row := range rows {
		item := ProductStockMovement{
			ID: row.ID, Kind: row.MovementType, SourceType: row.SourceType, Summary: movementSummary(row),
			Reference: row.SourceReference, LocationName: row.LocationName,
			QuantityDelta: row.QuantityDelta.String(), ValueDeltaMinor: fmt.Sprintf("%d", row.ValueDeltaMinor),
			CreatedAt: row.CreatedAt.Time,
		}
		// Adjustment numbers mean nothing to people; the reason is already in the summary.
		if row.SourceType == "inventory_adjustment" {
			item.Reference = ""
		} else {
			item.Party = row.SourceParty
		}
		if row.SourceID.Valid {
			id := row.SourceID.Int64
			item.SourceID = &id
		}
		if row.LocationID.Valid {
			id := row.LocationID.Int64
			item.LocationID = &id
		}
		if row.OccurredOn.Valid {
			item.OccurredOn = row.OccurredOn.Time.Format("2006-01-02")
		}
		out = append(out, item)
	}
	return out, nil
}
