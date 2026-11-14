package finance

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
)

var (
	ErrAdjustmentNotFound = errors.New("stock adjustment not found")
)

type CreateAdjustmentLineInput struct {
	ProductID     int64   `json:"product_id" binding:"required"`
	VariantID     *int64  `json:"variant_id"`
	QuantityDelta string  `json:"quantity_delta" binding:"required"`
	UnitCost      *string `json:"unit_cost"`
}

type CreateStockAdjustmentInput struct {
	LocationID     int64                       `json:"location_id" binding:"required"`
	ReasonCode     string                      `json:"reason_code" binding:"required"`
	Notes          string                      `json:"notes"`
	OccurredOn     string                      `json:"occurred_on"`
	IdempotencyKey string                      `json:"idempotency_key"`
	Lines          []CreateAdjustmentLineInput `json:"lines" binding:"required"`
}

type AdjustmentLineView struct {
	ID             int64   `json:"id"`
	ProductID      int64   `json:"product_id"`
	ProductName    string  `json:"product_name"`
	VariantID      *int64  `json:"variant_id,omitempty"`
	VariantName    *string `json:"variant_name,omitempty"`
	QuantityDelta  string  `json:"quantity_delta"`
	UnitCostMinor  int64   `json:"unit_cost_minor"`
	TotalCostMinor int64   `json:"total_cost_minor"`
}

type StockAdjustmentView struct {
	ID               int64                `json:"id"`
	AdjustmentNumber string               `json:"adjustment_number"`
	LocationID       int64                `json:"location_id"`
	LocationName     string               `json:"location_name"`
	ReasonCode       string               `json:"reason_code"`
	Notes            *string              `json:"notes,omitempty"`
	Lines            []AdjustmentLineView `json:"lines,omitempty"`
	CreatedAt        time.Time            `json:"created_at"`
	UpdatedAt        time.Time            `json:"updated_at"`
}

type ListStockAdjustmentsFilter struct {
	LocationID int64  `form:"location_id"`
	ReasonCode string `form:"reason_code"`
}

func (s *Service) CreateStockAdjustment(ctx context.Context, workspaceID, userID int64, in CreateStockAdjustmentInput) (StockAdjustmentView, error) {
	if in.LocationID <= 0 {
		return StockAdjustmentView{}, errors.New("location is required")
	}
	if len(in.Lines) == 0 {
		return StockAdjustmentView{}, errors.New("at least one adjustment line is required")
	}

	reason := strings.ToLower(strings.TrimSpace(in.ReasonCode))
	validReasons := map[string]bool{
		"damage": true, "spoilage": true, "shrinkage": true,
		"internal_use": true, "correction": true, "other": true,
		"restock": true, "found": true, "lost": true, "expired": true,
	}
	if !validReasons[reason] {
		return StockAdjustmentView{}, fmt.Errorf("invalid reason code: %s", in.ReasonCode)
	}

	key := strings.TrimSpace(in.IdempotencyKey)
	if key != "" {
		if existing, err := s.queries.GetStockAdjustmentByIdempotency(ctx, db.GetStockAdjustmentByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: optionalPgText(key),
		}); err == nil {
			return s.GetStockAdjustment(ctx, workspaceID, existing.ID)
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return StockAdjustmentView{}, err
		}
	}

	occurredOn, err := time.Parse("2006-01-02", strings.TrimSpace(in.OccurredOn))
	if err != nil {
		occurredOn = time.Now()
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StockAdjustmentView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	loc, err := q.GetInventoryLocation(ctx, db.GetInventoryLocationParams{WorkspaceID: workspaceID, ID: in.LocationID})
	if err != nil {
		return StockAdjustmentView{}, fmt.Errorf("location: %w", err)
	}

	adjNumber := fmt.Sprintf("ADJ-%d-%04d", time.Now().Unix(), rand.Intn(10000))

	adj, err := q.CreateStockAdjustment(ctx, db.CreateStockAdjustmentParams{
		WorkspaceID:      workspaceID,
		AdjustmentNumber: adjNumber,
		LocationID:       loc.ID,
		ReasonCode:       reason,
		Notes:            optionalPgText(in.Notes),
		IdempotencyKey:   optionalPgText(key),
		CreatedByUserID:  userID,
	})
	if err != nil {
		return StockAdjustmentView{}, err
	}

	currency := "NGN"
	if costSettings, err := q.GetCostingSettings(ctx, workspaceID); err == nil {
		currency = costSettings.Currency
	}

	lineViews := make([]AdjustmentLineView, 0, len(in.Lines))

	for _, l := range in.Lines {
		delta, err := parseSignedQuantity(l.QuantityDelta)
		if err != nil || delta.IsZero() {
			return StockAdjustmentView{}, errors.New("quantity delta cannot be zero")
		}

		prod, err := q.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: l.ProductID})
		if err != nil {
			return StockAdjustmentView{}, fmt.Errorf("product %d: %w", l.ProductID, err)
		}

		bal, err := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
			WorkspaceID: workspaceID,
			LocationID:  loc.ID,
			ProductID:   prod.ID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			if delta.IsNegative() {
				return StockAdjustmentView{}, fmt.Errorf("insufficient stock to write off for %s", prod.Name)
			}
			bal, err = q.UpsertInventoryBalance(ctx, db.UpsertInventoryBalanceParams{
				WorkspaceID:      workspaceID,
				LocationID:       loc.ID,
				ProductID:        prod.ID,
				QuantityOnHand:   decimal.Zero,
				ValueOnHandMinor: 0,
			})
			if err != nil {
				return StockAdjustmentView{}, err
			}
		} else if err != nil {
			return StockAdjustmentView{}, err
		}

		newQty := bal.QuantityOnHand.Add(delta)
		if newQty.IsNegative() {
			return StockAdjustmentView{}, fmt.Errorf("adjustment would result in negative stock for %s", prod.Name)
		}

		var unitCostMinor int64
		if l.UnitCost != nil && strings.TrimSpace(*l.UnitCost) != "" {
			uc, err := ParseMajorToMinor(*l.UnitCost, CurrencyExponent(currency))
			if err != nil {
				return StockAdjustmentView{}, err
			}
			unitCostMinor = uc
		} else if bal.QuantityOnHand.GreaterThan(decimal.Zero) {
			unitCostMinor = bal.ValueOnHandMinor / bal.QuantityOnHand.IntPart()
			if unitCostMinor <= 0 {
				unitCostMinor = bal.ValueOnHandMinor
			}
		}

		totalCostMinor := delta.Abs().Mul(decimal.NewFromInt(unitCostMinor)).Round(0).IntPart()

		var newValMinor int64
		if delta.IsNegative() {
			newValMinor = bal.ValueOnHandMinor - totalCostMinor
			if newValMinor < 0 || newQty.IsZero() {
				newValMinor = 0
			}
		} else {
			newValMinor = bal.ValueOnHandMinor + totalCostMinor
		}

		if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
			WorkspaceID:       workspaceID,
			LocationID:        loc.ID,
			ProductID:         prod.ID,
			QuantityOnHand:    newQty,
			ReservedQuantity:  bal.ReservedQuantity,
			InTransitQuantity: bal.InTransitQuantity,
			ValueOnHandMinor:  newValMinor,
		}); err != nil {
			return StockAdjustmentView{}, err
		}

		// Movement
		var mvValDelta int64
		if delta.IsNegative() {
			mvValDelta = -totalCostMinor
		} else {
			mvValDelta = totalCostMinor
		}

		if _, err := q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{
			WorkspaceID:        workspaceID,
			ProductID:          prod.ID,
			GoodsReceiptLineID: pgtype.Int8{},
			LocationID:         pgtype.Int8{Int64: loc.ID, Valid: true},
			MovementType:       "adjustment",
			SourceType:         "inventory_adjustment",
			SourceID:           pgtype.Int8{Int64: adj.ID, Valid: true},
			QuantityDelta:      delta,
			ValueDeltaMinor:    mvValDelta,
			OccurredOn:         pgtype.Date{Time: occurredOn, Valid: true},
		}); err != nil {
			return StockAdjustmentView{}, err
		}

		var vID pgtype.Int8
		if l.VariantID != nil && *l.VariantID > 0 {
			vID = pgtype.Int8{Int64: *l.VariantID, Valid: true}
		}

		line, err := q.CreateStockAdjustmentLine(ctx, db.CreateStockAdjustmentLineParams{
			WorkspaceID:    workspaceID,
			AdjustmentID:   adj.ID,
			ProductID:      prod.ID,
			VariantID:      vID,
			QuantityDelta:  delta,
			UnitCostMinor:  unitCostMinor,
			TotalCostMinor: totalCostMinor,
		})
		if err != nil {
			return StockAdjustmentView{}, err
		}

		lineViews = append(lineViews, AdjustmentLineView{
			ID:             line.ID,
			ProductID:      prod.ID,
			ProductName:    prod.Name,
			VariantID:      nullableInt64(line.VariantID),
			QuantityDelta:  line.QuantityDelta.StringFixed(4),
			UnitCostMinor:  unitCostMinor,
			TotalCostMinor: totalCostMinor,
		})

		// GL Posting
		if totalCostMinor > 0 {
			ledger, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
				WorkspaceID:      workspaceID,
				SourceType:       "inventory_adjustment",
				SourceID:         line.ID,
				EntryDate:        pgtype.Date{Time: occurredOn, Valid: true},
				Currency:         currency,
				CurrencyExponent: int32(CurrencyExponent(currency)),
				Description:      optionalPgText(fmt.Sprintf("Stock adjustment (%s) for %s", reason, prod.Name)),
			})
			if err != nil {
				return StockAdjustmentView{}, err
			}

			if delta.IsNegative() {
				// Loss / damage / shrinkage: Debit Expense, Credit Asset
				if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
					LedgerEntryID: ledger.ID,
					WorkspaceID:   workspaceID,
					AccountClass:  "expense",
					DebitMinor:    totalCostMinor,
					Description:   optionalPgText(fmt.Sprintf("Inventory Adjustment Expense: %s", reason)),
				}); err != nil {
					return StockAdjustmentView{}, err
				}
				if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
					LedgerEntryID: ledger.ID,
					WorkspaceID:   workspaceID,
					AccountClass:  "asset",
					CreditMinor:   totalCostMinor,
					Description:   optionalPgText("Inventory Asset Reduction"),
				}); err != nil {
					return StockAdjustmentView{}, err
				}
			} else {
				// Gain / found stock: Debit Asset, Credit Gain
				if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
					LedgerEntryID: ledger.ID,
					WorkspaceID:   workspaceID,
					AccountClass:  "asset",
					DebitMinor:    totalCostMinor,
					Description:   optionalPgText("Inventory Asset Increase"),
				}); err != nil {
					return StockAdjustmentView{}, err
				}
				if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
					LedgerEntryID: ledger.ID,
					WorkspaceID:   workspaceID,
					AccountClass:  "expense",
					CreditMinor:   totalCostMinor,
					Description:   optionalPgText("Inventory Adjustment Gain"),
				}); err != nil {
					return StockAdjustmentView{}, err
				}
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return StockAdjustmentView{}, err
	}

	return StockAdjustmentView{
		ID:               adj.ID,
		AdjustmentNumber: adj.AdjustmentNumber,
		LocationID:       loc.ID,
		LocationName:     loc.Name,
		ReasonCode:       adj.ReasonCode,
		Notes:            nullableText(adj.Notes),
		Lines:            lineViews,
		CreatedAt:        adj.CreatedAt.Time,
		UpdatedAt:        adj.UpdatedAt.Time,
	}, nil
}

func (s *Service) GetStockAdjustment(ctx context.Context, workspaceID, adjustmentID int64) (StockAdjustmentView, error) {
	adj, err := s.queries.GetStockAdjustment(ctx, db.GetStockAdjustmentParams{
		WorkspaceID: workspaceID,
		ID:          adjustmentID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return StockAdjustmentView{}, ErrAdjustmentNotFound
	}
	if err != nil {
		return StockAdjustmentView{}, err
	}

	lines, err := s.queries.ListStockAdjustmentLines(ctx, db.ListStockAdjustmentLinesParams{
		WorkspaceID:  workspaceID,
		AdjustmentID: adjustmentID,
	})
	if err != nil {
		return StockAdjustmentView{}, err
	}

	lineViews := make([]AdjustmentLineView, 0, len(lines))
	for _, l := range lines {
		lineViews = append(lineViews, AdjustmentLineView{
			ID:             l.ID,
			ProductID:      l.ProductID,
			ProductName:    l.ProductName,
			VariantID:      nullableInt64(l.VariantID),
			VariantName:    nullableText(l.VariantName),
			QuantityDelta:  l.QuantityDelta.StringFixed(4),
			UnitCostMinor:  l.UnitCostMinor,
			TotalCostMinor: l.TotalCostMinor,
		})
	}

	return StockAdjustmentView{
		ID:               adj.ID,
		AdjustmentNumber: adj.AdjustmentNumber,
		LocationID:       adj.LocationID,
		LocationName:     adj.LocationName,
		ReasonCode:       adj.ReasonCode,
		Notes:            nullableText(adj.Notes),
		Lines:            lineViews,
		CreatedAt:        adj.CreatedAt.Time,
		UpdatedAt:        adj.UpdatedAt.Time,
	}, nil
}

func (s *Service) ListStockAdjustments(ctx context.Context, workspaceID int64, filter ListStockAdjustmentsFilter) ([]StockAdjustmentView, error) {
	var locID pgtype.Int8
	if filter.LocationID > 0 {
		locID = pgtype.Int8{Int64: filter.LocationID, Valid: true}
	}
	var reasonParam pgtype.Text
	if strings.TrimSpace(filter.ReasonCode) != "" {
		reasonParam = pgtype.Text{String: strings.TrimSpace(filter.ReasonCode), Valid: true}
	}

	rows, err := s.queries.ListStockAdjustments(ctx, db.ListStockAdjustmentsParams{
		WorkspaceID: workspaceID,
		Limit:       200,
		LocationID:  locID,
		ReasonCode:  reasonParam,
	})
	if err != nil {
		return nil, err
	}

	out := make([]StockAdjustmentView, 0, len(rows))
	for _, r := range rows {
		out = append(out, StockAdjustmentView{
			ID:               r.ID,
			AdjustmentNumber: r.AdjustmentNumber,
			LocationID:       r.LocationID,
			LocationName:     r.LocationName,
			ReasonCode:       r.ReasonCode,
			Notes:            nullableText(r.Notes),
			CreatedAt:        r.CreatedAt.Time,
			UpdatedAt:        r.UpdatedAt.Time,
		})
	}
	return out, nil
}

func parseSignedQuantity(input string) (decimal.Decimal, error) {
	val := strings.TrimSpace(input)
	if val == "" {
		return decimal.Zero, errors.New("quantity delta is required")
	}
	isNeg := false
	if strings.HasPrefix(val, "-") {
		isNeg = true
		val = strings.TrimPrefix(val, "-")
	} else if strings.HasPrefix(val, "+") {
		val = strings.TrimPrefix(val, "+")
	}
	qty, _, err := parseRequestQuantity(val)
	if err != nil {
		return decimal.Zero, err
	}
	if isNeg {
		qty = qty.Neg()
	}
	return qty, nil
}
