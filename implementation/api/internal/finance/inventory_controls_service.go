package finance

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
	"strings"
	"time"
)

type InventoryAdjustmentLineInput struct {
	ProductID     int64  `json:"product_id"`
	QuantityDelta string `json:"quantity_delta"`
	UnitCost      string `json:"unit_cost"`
}
type CreateInventoryAdjustmentInput struct {
	LocationID     int64                          `json:"location_id"`
	ReasonCode     string                         `json:"reason_code"`
	Notes          string                         `json:"notes"`
	EffectiveOn    string                         `json:"effective_on"`
	Lines          []InventoryAdjustmentLineInput `json:"lines"`
	IdempotencyKey string                         `json:"idempotency_key"`
}
type InventoryAdjustmentView struct {
	ID         int64  `json:"id"`
	Number     string `json:"adjustment_number"`
	LocationID int64  `json:"location_id"`
	ReasonCode string `json:"reason_code"`
	TotalMinor string `json:"total_minor"`
}
type InventoryTransferLineInput struct {
	ProductID int64  `json:"product_id"`
	Quantity  string `json:"quantity"`
}
type CreateInventoryTransferInput struct {
	SourceLocationID      int64                        `json:"source_location_id"`
	DestinationLocationID int64                        `json:"destination_location_id"`
	Notes                 string                       `json:"notes"`
	EffectiveOn           string                       `json:"effective_on"`
	Lines                 []InventoryTransferLineInput `json:"lines"`
	IdempotencyKey        string                       `json:"idempotency_key"`
}
type InventoryTransferView struct {
	ID                    int64  `json:"id"`
	Number                string `json:"transfer_number"`
	SourceLocationID      int64  `json:"source_location_id"`
	DestinationLocationID int64  `json:"destination_location_id"`
	Status                string `json:"status"`
}
type StockCountLineInput struct {
	ProductID       int64  `json:"product_id"`
	CountedQuantity string `json:"counted_quantity"`
	UnitCost        string `json:"unit_cost"`
}
type CreateStockCountInput struct {
	LocationID     int64                 `json:"location_id"`
	CountedAt      string                `json:"counted_at"`
	Notes          string                `json:"notes"`
	Lines          []StockCountLineInput `json:"lines"`
	IdempotencyKey string                `json:"idempotency_key"`
}
type InventoryStockCountView struct {
	ID                 int64  `json:"id"`
	Number             string `json:"count_number"`
	LocationID         int64  `json:"location_id"`
	Status             string `json:"status"`
	TotalVarianceMinor string `json:"total_variance_minor"`
}

func nextInventoryDocumentNumber(ctx context.Context, tx pgx.Tx, workspaceID int64, table, prefix string) (string, error) {
	var n int64
	if err := tx.QueryRow(ctx, "SELECT count(*)+1 FROM "+table+" WHERE workspace_id=$1", workspaceID).Scan(&n); err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%06d", prefix, n), nil
}

func (s *Service) CreateInventoryAdjustment(ctx context.Context, workspaceID, userID int64, in CreateInventoryAdjustmentInput) (InventoryAdjustmentView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if key == "" || len(in.Lines) == 0 || len(in.Lines) > 100 {
		return InventoryAdjustmentView{}, errors.New("adjustment lines and idempotency key are required")
	}
	date, err := time.Parse("2006-01-02", strings.TrimSpace(in.EffectiveOn))
	if err != nil {
		return InventoryAdjustmentView{}, errors.New("effective date must be YYYY-MM-DD")
	}
	reason := strings.TrimSpace(in.ReasonCode)
	if reason == "" {
		reason = "correction"
	}
	validReason := map[string]bool{"damage": true, "spoilage": true, "shrinkage": true, "internal_use": true, "correction": true, "other": true}
	if !validReason[reason] {
		return InventoryAdjustmentView{}, errors.New("invalid adjustment reason")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return InventoryAdjustmentView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	location, err := inventoryLocationFor(ctx, q, workspaceID, in.LocationID)
	if err != nil {
		return InventoryAdjustmentView{}, err
	}
	var existingID int64
	var existingNum string
	if e := tx.QueryRow(ctx, "SELECT id,adjustment_number FROM inventory_adjustments WHERE workspace_id=$1 AND idempotency_key=$2", workspaceID, key).Scan(&existingID, &existingNum); e == nil {
		return InventoryAdjustmentView{ID: existingID, Number: existingNum, LocationID: location.ID, ReasonCode: reason}, nil
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return InventoryAdjustmentView{}, e
	}
	number, err := nextInventoryDocumentNumber(ctx, tx, workspaceID, "inventory_adjustments", "ADJ")
	if err != nil {
		return InventoryAdjustmentView{}, err
	}
	var adjustmentID int64
	if err = tx.QueryRow(ctx, "INSERT INTO inventory_adjustments(workspace_id,adjustment_number,location_id,reason_code,notes,idempotency_key,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", workspaceID, number, location.ID, reason, optionalText(in.Notes), key, userID).Scan(&adjustmentID); err != nil {
		return InventoryAdjustmentView{}, err
	}
	currency := "NGN"
	var base string
	_ = tx.QueryRow(ctx, "SELECT base_currency FROM workspaces WHERE id=$1", workspaceID).Scan(&base)
	if len(base) == 3 {
		currency = base
	}
	exponent := CurrencyExponent(currency)
	total := int64(0)
	increaseTotal, decreaseTotal := int64(0), int64(0)
	for _, line := range in.Lines {
		if line.ProductID <= 0 {
			return InventoryAdjustmentView{}, errors.New("invalid product")
		}
		product, e := q.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: line.ProductID})
		if e != nil {
			return InventoryAdjustmentView{}, ErrNotFound
		}
		if product.Kind != "stock_tracked" {
			return InventoryAdjustmentView{}, errors.New("adjustments require stock-tracked products")
		}
		rawQuantity := strings.TrimSpace(line.QuantityDelta)
		negative := strings.HasPrefix(rawQuantity, "-")
		rawQuantity = strings.TrimPrefix(strings.TrimPrefix(rawQuantity, "+"), "-")
		qty, _, e := parseRequestQuantity(rawQuantity)
		if e != nil {
			return InventoryAdjustmentView{}, e
		}
		if negative {
			qty = qty.Neg()
		}
		cost, e := ParseMajorToMinor(line.UnitCost, exponent)
		if e != nil || cost < 0 {
			return InventoryAdjustmentView{}, errors.New("invalid unit cost")
		}
		value, e := requestLineTotal(cost, qty.Abs())
		if e != nil {
			return InventoryAdjustmentView{}, e
		}
		if value > 0 {
			total, e = CheckedAdd(total, value)
			if e != nil {
				return InventoryAdjustmentView{}, e
			}
			if qty.IsNegative() {
				decreaseTotal, e = CheckedAdd(decreaseTotal, value)
			} else {
				increaseTotal, e = CheckedAdd(increaseTotal, value)
			}
			if e != nil {
				return InventoryAdjustmentView{}, e
			}
		}
		var onHand decimal.Decimal
		var valueOnHand int64
		e = tx.QueryRow(ctx, "SELECT quantity_on_hand,value_on_hand_minor FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3 FOR UPDATE", workspaceID, location.ID, line.ProductID).Scan(&onHand, &valueOnHand)
		if errors.Is(e, pgx.ErrNoRows) {
			onHand = decimal.Zero
			valueOnHand = 0
		} else if e != nil {
			return InventoryAdjustmentView{}, e
		}
		if onHand.Add(qty).LessThan(decimal.Zero) || valueOnHand+(func() int64 {
			if qty.IsNegative() {
				return -value
			}
			return value
		})() < 0 {
			return InventoryAdjustmentView{}, errors.New("adjustment exceeds stock on hand")
		}
		if _, e = tx.Exec(ctx, "INSERT INTO inventory_adjustment_lines(workspace_id,adjustment_id,product_id,quantity_delta,unit_cost_minor,total_cost_minor) VALUES($1,$2,$3,$4,$5,$6)", workspaceID, adjustmentID, line.ProductID, qty, cost, value); e != nil {
			return InventoryAdjustmentView{}, e
		}
		if _, e = q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{WorkspaceID: workspaceID, ProductID: line.ProductID, LocationID: pgtype.Int8{Int64: location.ID, Valid: true}, MovementType: "adjustment", SourceType: "inventory_adjustment", SourceID: pgtype.Int8{Int64: adjustmentID, Valid: true}, QuantityDelta: qty, ValueDeltaMinor: func() int64 {
			if qty.IsNegative() {
				return -value
			}
			return value
		}(), OccurredOn: pgtype.Date{Time: date, Valid: true}}); e != nil {
			return InventoryAdjustmentView{}, e
		}
		if _, e = q.ApplyInventoryBalanceDelta(ctx, db.ApplyInventoryBalanceDeltaParams{WorkspaceID: workspaceID, LocationID: location.ID, ProductID: line.ProductID, QuantityOnHand: qty, ValueOnHandMinor: func() int64 {
			if qty.IsNegative() {
				return -value
			}
			return value
		}()}); e != nil {
			if qty.GreaterThan(decimal.Zero) {
				if _, e = q.UpsertInventoryBalance(ctx, db.UpsertInventoryBalanceParams{WorkspaceID: workspaceID, LocationID: location.ID, ProductID: line.ProductID, QuantityOnHand: qty, ValueOnHandMinor: value}); e != nil {
					return InventoryAdjustmentView{}, e
				}
			} else {
				return InventoryAdjustmentView{}, errors.New("stock changed before adjustment")
			}
		}
	}
	entry, e := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: workspaceID, SourceType: "inventory_adjustment", SourceID: adjustmentID, EntryDate: pgtype.Date{Time: date, Valid: true}, Currency: currency, CurrencyExponent: int32(exponent), Description: optionalPgText("Inventory adjustment")})
	if e != nil {
		return InventoryAdjustmentView{}, e
	}
	if increaseTotal > 0 {
		if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "asset", DebitMinor: increaseTotal, Description: optionalPgText("Inventory adjustment increase")}); e != nil {
			return InventoryAdjustmentView{}, e
		}
		if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "expense", CreditMinor: increaseTotal, Description: optionalPgText("Inventory adjustment offset")}); e != nil {
			return InventoryAdjustmentView{}, e
		}
	}
	if decreaseTotal > 0 {
		if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "expense", DebitMinor: decreaseTotal, Description: optionalPgText("Inventory adjustment loss")}); e != nil {
			return InventoryAdjustmentView{}, e
		}
		if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "asset", CreditMinor: decreaseTotal, Description: optionalPgText("Inventory adjustment reduction")}); e != nil {
			return InventoryAdjustmentView{}, e
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return InventoryAdjustmentView{}, err
	}
	return InventoryAdjustmentView{ID: adjustmentID, Number: number, LocationID: location.ID, ReasonCode: reason, TotalMinor: fmt.Sprint(total)}, nil
}

func (s *Service) CreateInventoryTransfer(ctx context.Context, workspaceID, userID int64, in CreateInventoryTransferInput) (InventoryTransferView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if key == "" || len(in.Lines) == 0 || in.SourceLocationID <= 0 || in.DestinationLocationID <= 0 || in.SourceLocationID == in.DestinationLocationID {
		return InventoryTransferView{}, errors.New("source, destination, lines and idempotency key are required")
	}
	date, err := time.Parse("2006-01-02", strings.TrimSpace(in.EffectiveOn))
	if err != nil {
		return InventoryTransferView{}, errors.New("effective date must be YYYY-MM-DD")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return InventoryTransferView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	var id int64
	var number string
	if e := tx.QueryRow(ctx, "SELECT id,transfer_number FROM inventory_transfers WHERE workspace_id=$1 AND idempotency_key=$2", workspaceID, key).Scan(&id, &number); e == nil {
		return InventoryTransferView{ID: id, Number: number, SourceLocationID: in.SourceLocationID, DestinationLocationID: in.DestinationLocationID, Status: "received"}, nil
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return InventoryTransferView{}, e
	}
	number, err = nextInventoryDocumentNumber(ctx, tx, workspaceID, "inventory_transfers", "TRF")
	if err != nil {
		return InventoryTransferView{}, err
	}
	if err = tx.QueryRow(ctx, "INSERT INTO inventory_transfers(workspace_id,transfer_number,source_location_id,destination_location_id,status,notes,idempotency_key,created_by_user_id) VALUES($1,$2,$3,$4,'received',$5,$6,$7) RETURNING id", workspaceID, number, in.SourceLocationID, in.DestinationLocationID, optionalText(in.Notes), key, userID).Scan(&id); err != nil {
		return InventoryTransferView{}, err
	}
	for _, line := range in.Lines {
		qty, _, e := parseRequestQuantity(line.Quantity)
		if e != nil || line.ProductID <= 0 {
			return InventoryTransferView{}, errors.New("invalid transfer line")
		}
		var onHand decimal.Decimal
		var val int64
		e = tx.QueryRow(ctx, "SELECT quantity_on_hand,value_on_hand_minor FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3 FOR UPDATE", workspaceID, in.SourceLocationID, line.ProductID).Scan(&onHand, &val)
		if e != nil || onHand.LessThan(qty) {
			return InventoryTransferView{}, errors.New("transfer exceeds source stock")
		}
		unit := int64(0)
		if onHand.GreaterThan(decimal.Zero) {
			unit = decimal.NewFromInt(val).Div(onHand).IntPart()
		}
		value, e := requestLineTotal(unit, qty)
		if e != nil {
			return InventoryTransferView{}, e
		}
		if _, e = tx.Exec(ctx, "INSERT INTO inventory_transfer_lines(workspace_id,transfer_id,product_id,quantity,unit_cost_minor) VALUES($1,$2,$3,$4,$5)", workspaceID, id, line.ProductID, qty, unit); e != nil {
			return InventoryTransferView{}, e
		}
		if _, e = q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{WorkspaceID: workspaceID, ProductID: line.ProductID, LocationID: pgtype.Int8{Int64: in.SourceLocationID, Valid: true}, MovementType: "transfer_out", SourceType: "inventory_transfer", SourceID: pgtype.Int8{Int64: id, Valid: true}, QuantityDelta: qty.Neg(), ValueDeltaMinor: -value, OccurredOn: pgtype.Date{Time: date, Valid: true}}); e != nil {
			return InventoryTransferView{}, e
		}
		if _, e = q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{WorkspaceID: workspaceID, ProductID: line.ProductID, LocationID: pgtype.Int8{Int64: in.DestinationLocationID, Valid: true}, MovementType: "transfer_in", SourceType: "inventory_transfer", SourceID: pgtype.Int8{Int64: id, Valid: true}, QuantityDelta: qty, ValueDeltaMinor: value, OccurredOn: pgtype.Date{Time: date, Valid: true}}); e != nil {
			return InventoryTransferView{}, e
		}
		if _, e = q.ApplyInventoryBalanceDelta(ctx, db.ApplyInventoryBalanceDeltaParams{WorkspaceID: workspaceID, LocationID: in.SourceLocationID, ProductID: line.ProductID, QuantityOnHand: qty.Neg(), ValueOnHandMinor: -value}); e != nil {
			return InventoryTransferView{}, errors.New("source stock changed before transfer")
		}
		if _, e = q.ApplyInventoryBalanceDelta(ctx, db.ApplyInventoryBalanceDeltaParams{WorkspaceID: workspaceID, LocationID: in.DestinationLocationID, ProductID: line.ProductID, QuantityOnHand: qty, ValueOnHandMinor: value}); e != nil {
			if _, e = q.UpsertInventoryBalance(ctx, db.UpsertInventoryBalanceParams{WorkspaceID: workspaceID, LocationID: in.DestinationLocationID, ProductID: line.ProductID, QuantityOnHand: qty, ValueOnHandMinor: value}); e != nil {
				return InventoryTransferView{}, e
			}
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return InventoryTransferView{}, err
	}
	return InventoryTransferView{ID: id, Number: number, SourceLocationID: in.SourceLocationID, DestinationLocationID: in.DestinationLocationID, Status: "received"}, nil
}

func (s *Service) CreateStockCount(ctx context.Context, workspaceID, userID int64, in CreateStockCountInput) (InventoryStockCountView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if key == "" || in.LocationID <= 0 || len(in.Lines) == 0 {
		return InventoryStockCountView{}, errors.New("location, count lines and idempotency key are required")
	}
	countedAt := time.Now().UTC()
	if strings.TrimSpace(in.CountedAt) != "" {
		parsed, e := time.Parse("2006-01-02", strings.TrimSpace(in.CountedAt))
		if e != nil {
			return InventoryStockCountView{}, errors.New("count date must be YYYY-MM-DD")
		}
		countedAt = parsed
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return InventoryStockCountView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	var countID int64
	var number string
	var existingLocation int64
	var existingStatus string
	if e := tx.QueryRow(ctx, "SELECT id,count_number,location_id,status FROM stock_counts WHERE workspace_id=$1 AND idempotency_key=$2", workspaceID, key).Scan(&countID, &number, &existingLocation, &existingStatus); e == nil {
		return InventoryStockCountView{ID: countID, Number: number, LocationID: existingLocation, Status: existingStatus}, nil
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return InventoryStockCountView{}, e
	}
	if _, err = q.GetInventoryLocation(ctx, db.GetInventoryLocationParams{WorkspaceID: workspaceID, ID: in.LocationID}); err != nil {
		return InventoryStockCountView{}, ErrNotFound
	}
	number, err = nextInventoryDocumentNumber(ctx, tx, workspaceID, "stock_counts", "CNT")
	if err != nil {
		return InventoryStockCountView{}, err
	}
	if err = tx.QueryRow(ctx, "INSERT INTO stock_counts(workspace_id,count_number,location_id,status,counted_at,notes,idempotency_key,created_by_user_id) VALUES($1,$2,$3,'completed',$4,$5,$6,$7) RETURNING id", workspaceID, number, in.LocationID, countedAt, optionalText(in.Notes), key, userID).Scan(&countID); err != nil {
		return InventoryStockCountView{}, err
	}
	currency := "NGN"
	var base string
	_ = tx.QueryRow(ctx, "SELECT base_currency FROM workspaces WHERE id=$1", workspaceID).Scan(&base)
	if len(base) == 3 {
		currency = base
	}
	exponent := CurrencyExponent(currency)
	increaseTotal, decreaseTotal := int64(0), int64(0)
	for _, line := range in.Lines {
		if line.ProductID <= 0 {
			return InventoryStockCountView{}, errors.New("invalid product")
		}
		qty, _, e := parseRequestQuantity(line.CountedQuantity)
		if e != nil {
			return InventoryStockCountView{}, e
		}
		product, e := q.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: line.ProductID})
		if e != nil || product.Kind != "stock_tracked" {
			return InventoryStockCountView{}, errors.New("stock counts require stock-tracked products")
		}
		var expected decimal.Decimal
		var onValue int64
		e = tx.QueryRow(ctx, "SELECT quantity_on_hand,value_on_hand_minor FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3 FOR UPDATE", workspaceID, in.LocationID, line.ProductID).Scan(&expected, &onValue)
		if errors.Is(e, pgx.ErrNoRows) {
			expected = decimal.Zero
			onValue = 0
		} else if e != nil {
			return InventoryStockCountView{}, e
		}
		delta := qty.Sub(expected)
		unit := int64(0)
		if strings.TrimSpace(line.UnitCost) != "" {
			unit, e = ParseMajorToMinor(line.UnitCost, exponent)
			if e != nil {
				return InventoryStockCountView{}, e
			}
		} else if expected.GreaterThan(decimal.Zero) {
			unit = decimal.NewFromInt(onValue).Div(expected).IntPart()
		}
		value, e := requestLineTotal(unit, delta.Abs())
		if e != nil {
			return InventoryStockCountView{}, e
		}
		if delta.IsNegative() {
			decreaseTotal, e = CheckedAdd(decreaseTotal, value)
		} else {
			increaseTotal, e = CheckedAdd(increaseTotal, value)
		}
		if e != nil {
			return InventoryStockCountView{}, e
		}
		if _, e = tx.Exec(ctx, "INSERT INTO stock_count_lines(workspace_id,count_id,product_id,expected_quantity,counted_quantity,variance_quantity,unit_cost_minor) VALUES($1,$2,$3,$4,$5,$6,$7)", workspaceID, countID, line.ProductID, expected, qty, delta, unit); e != nil {
			return InventoryStockCountView{}, e
		}
		if delta.IsZero() {
			continue
		}
		signedValue := value
		if delta.IsNegative() {
			signedValue = -value
		}
		if _, e = q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{WorkspaceID: workspaceID, ProductID: line.ProductID, LocationID: pgtype.Int8{Int64: in.LocationID, Valid: true}, MovementType: "stock_count", SourceType: "stock_count", SourceID: pgtype.Int8{Int64: countID, Valid: true}, QuantityDelta: delta, ValueDeltaMinor: signedValue, OccurredOn: pgtype.Date{Time: countedAt, Valid: true}}); e != nil {
			return InventoryStockCountView{}, e
		}
		if _, e = q.ApplyInventoryBalanceDelta(ctx, db.ApplyInventoryBalanceDeltaParams{WorkspaceID: workspaceID, LocationID: in.LocationID, ProductID: line.ProductID, QuantityOnHand: delta, ValueOnHandMinor: signedValue}); e != nil {
			if delta.GreaterThan(decimal.Zero) {
				if _, e = q.UpsertInventoryBalance(ctx, db.UpsertInventoryBalanceParams{WorkspaceID: workspaceID, LocationID: in.LocationID, ProductID: line.ProductID, QuantityOnHand: delta, ValueOnHandMinor: value}); e != nil {
					return InventoryStockCountView{}, e
				}
			} else {
				return InventoryStockCountView{}, errors.New("stock changed before count")
			}
		}
	}
	entry, e := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: workspaceID, SourceType: "stock_count_variance", SourceID: countID, EntryDate: pgtype.Date{Time: countedAt, Valid: true}, Currency: currency, CurrencyExponent: int32(exponent), Description: optionalPgText("Stock count variance")})
	if e != nil {
		return InventoryStockCountView{}, e
	}
	if increaseTotal > 0 {
		if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "asset", DebitMinor: increaseTotal, Description: optionalPgText("Stock count increase")}); e != nil {
			return InventoryStockCountView{}, e
		}
		if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "expense", CreditMinor: increaseTotal, Description: optionalPgText("Stock count offset")}); e != nil {
			return InventoryStockCountView{}, e
		}
	}
	if decreaseTotal > 0 {
		if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "expense", DebitMinor: decreaseTotal, Description: optionalPgText("Stock count loss")}); e != nil {
			return InventoryStockCountView{}, e
		}
		if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: workspaceID, AccountClass: "asset", CreditMinor: decreaseTotal, Description: optionalPgText("Stock count reduction")}); e != nil {
			return InventoryStockCountView{}, e
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return InventoryStockCountView{}, err
	}
	return InventoryStockCountView{ID: countID, Number: number, LocationID: in.LocationID, Status: "completed", TotalVarianceMinor: fmt.Sprint(increaseTotal + decreaseTotal)}, nil
}

func optionalText(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}
