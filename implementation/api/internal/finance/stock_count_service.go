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
	ErrCountNotFound     = errors.New("stock count not found")
	ErrCountInvalidState = errors.New("stock count is not in valid state for this action")
)

type StartStockCountInput struct {
	LocationID     int64  `json:"location_id" binding:"required"`
	Scope          string `json:"scope"`
	Notes          string `json:"notes"`
	IdempotencyKey string `json:"idempotency_key"`
}

type RecordCountLineInput struct {
	LineID          int64  `json:"line_id" binding:"required"`
	CountedQuantity string `json:"counted_quantity" binding:"required"`
}

type RecordCountLinesInput struct {
	Lines []RecordCountLineInput `json:"lines" binding:"required"`
}

type StockCountLineView struct {
	ID               int64   `json:"id"`
	ProductID        int64   `json:"product_id"`
	ProductName      string  `json:"product_name"`
	VariantID        *int64  `json:"variant_id,omitempty"`
	VariantName      *string `json:"variant_name,omitempty"`
	ExpectedQuantity string  `json:"expected_quantity"`
	CountedQuantity  *string `json:"counted_quantity,omitempty"`
	VarianceQuantity string  `json:"variance_quantity"`
	UnitCostMinor    int64   `json:"unit_cost_minor"`
}

type StockCountView struct {
	ID           int64                `json:"id"`
	CountNumber  string               `json:"count_number"`
	LocationID   int64                `json:"location_id"`
	LocationName string               `json:"location_name"`
	Scope        string               `json:"scope"`
	Status       string               `json:"status"`
	CountedAt    *string              `json:"counted_at,omitempty"`
	Notes        *string              `json:"notes,omitempty"`
	Lines        []StockCountLineView `json:"lines,omitempty"`
	CreatedAt    time.Time            `json:"created_at"`
	UpdatedAt    time.Time            `json:"updated_at"`
}

type ListStockCountsFilter struct {
	LocationID int64  `form:"location_id"`
	Status     string `form:"status"`
}

func (s *Service) StartStockCount(ctx context.Context, workspaceID, userID int64, in StartStockCountInput) (StockCountView, error) {
	if in.LocationID <= 0 {
		return StockCountView{}, errors.New("location is required")
	}

	key := strings.TrimSpace(in.IdempotencyKey)
	if key != "" {
		if existing, err := s.queries.GetStockCountByIdempotency(ctx, db.GetStockCountByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: optionalPgText(key),
		}); err == nil {
			return s.GetStockCount(ctx, workspaceID, existing.ID)
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return StockCountView{}, err
		}
	}

	scope := strings.TrimSpace(in.Scope)
	if scope == "" {
		scope = "full"
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StockCountView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	loc, err := q.GetInventoryLocation(ctx, db.GetInventoryLocationParams{WorkspaceID: workspaceID, ID: in.LocationID})
	if err != nil {
		return StockCountView{}, fmt.Errorf("location: %w", err)
	}

	cntNumber := fmt.Sprintf("CNT-%d-%04d", time.Now().Unix(), rand.Intn(10000))

	cnt, err := q.CreateStockCount(ctx, db.CreateStockCountParams{
		WorkspaceID:     workspaceID,
		CountNumber:     cntNumber,
		LocationID:      loc.ID,
		Scope:           scope,
		Status:          "in_progress",
		Notes:           optionalPgText(in.Notes),
		IdempotencyKey:  optionalPgText(key),
		CreatedByUserID: userID,
	})
	if err != nil {
		return StockCountView{}, err
	}

	// Snapshot all balances in this location
	balances, err := q.ListInventoryBalances(ctx, db.ListInventoryBalancesParams{
		WorkspaceID: workspaceID,
		Limit:       500,
		LocationID:  pgtype.Int8{Int64: loc.ID, Valid: true},
	})
	if err != nil {
		return StockCountView{}, err
	}

	lineViews := make([]StockCountLineView, 0, len(balances))
	for _, b := range balances {
		unitCost := int64(0)
		if b.QuantityOnHand.GreaterThan(decimal.Zero) {
			unitCost = b.ValueOnHandMinor / b.QuantityOnHand.IntPart()
			if unitCost <= 0 {
				unitCost = b.ValueOnHandMinor
			}
		}

		line, err := q.CreateStockCountLine(ctx, db.CreateStockCountLineParams{
			WorkspaceID:      workspaceID,
			CountID:          cnt.ID,
			ProductID:        b.ProductID,
			VariantID:        pgtype.Int8{Int64: b.VariantID, Valid: true},
			ExpectedQuantity: b.QuantityOnHand,
			CountedQuantity:  pgtype.Numeric{Valid: false},
			VarianceQuantity: decimal.Zero,
			UnitCostMinor:    unitCost,
		})
		if err != nil {
			return StockCountView{}, err
		}

		lineViews = append(lineViews, StockCountLineView{
			ID:               line.ID,
			ProductID:        b.ProductID,
			ProductName:      b.ProductName,
			VariantID:        nullableInt64(line.VariantID),
			ExpectedQuantity: b.QuantityOnHand.StringFixed(4),
			VarianceQuantity: "0.0000",
			UnitCostMinor:    unitCost,
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return StockCountView{}, err
	}

	return StockCountView{
		ID:           cnt.ID,
		CountNumber:  cnt.CountNumber,
		LocationID:   loc.ID,
		LocationName: loc.Name,
		Scope:        cnt.Scope,
		Status:       cnt.Status,
		Notes:        nullableText(cnt.Notes),
		Lines:        lineViews,
		CreatedAt:    cnt.CreatedAt.Time,
		UpdatedAt:    cnt.UpdatedAt.Time,
	}, nil
}

func (s *Service) RecordStockCountLines(ctx context.Context, workspaceID, userID, countID int64, in RecordCountLinesInput) (StockCountView, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StockCountView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	cnt, err := q.GetStockCountForUpdate(ctx, db.GetStockCountForUpdateParams{
		WorkspaceID: workspaceID,
		ID:          countID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return StockCountView{}, ErrCountNotFound
	}
	if err != nil {
		return StockCountView{}, err
	}
	if cnt.Status != "in_progress" {
		return StockCountView{}, ErrCountInvalidState
	}

	lines, err := q.ListStockCountLines(ctx, db.ListStockCountLinesParams{
		WorkspaceID: workspaceID,
		CountID:     countID,
	})
	if err != nil {
		return StockCountView{}, err
	}

	linesByID := make(map[int64]db.ListStockCountLinesRow)
	for _, l := range lines {
		linesByID[l.ID] = l
	}

	for _, item := range in.Lines {
		orig, ok := linesByID[item.LineID]
		if !ok {
			return StockCountView{}, fmt.Errorf("line %d not found in count", item.LineID)
		}
		counted, _, err := parseRequestQuantity(item.CountedQuantity)
		if err != nil || counted.IsNegative() {
			return StockCountView{}, errors.New("counted quantity must be a non-negative number")
		}

		variance := counted.Sub(orig.ExpectedQuantity)

		if _, err := q.UpdateStockCountLineCount(ctx, db.UpdateStockCountLineCountParams{
			WorkspaceID:      workspaceID,
			CountID:          countID,
			ID:               item.LineID,
			CountedQuantity:  decimalToPgNumeric(counted),
			VarianceQuantity: variance,
			UnitCostMinor:    orig.UnitCostMinor,
		}); err != nil {
			return StockCountView{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return StockCountView{}, err
	}

	return s.GetStockCount(ctx, workspaceID, countID)
}

func (s *Service) ApproveAndPostStockCount(ctx context.Context, workspaceID, userID, countID int64, occurredOnStr string) (StockCountView, error) {
	occurredOn, err := time.Parse("2006-01-02", strings.TrimSpace(occurredOnStr))
	if err != nil {
		occurredOn = time.Now()
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StockCountView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	cnt, err := q.GetStockCountForUpdate(ctx, db.GetStockCountForUpdateParams{
		WorkspaceID: workspaceID,
		ID:          countID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return StockCountView{}, ErrCountNotFound
	}
	if err != nil {
		return StockCountView{}, err
	}
	if cnt.Status != "in_progress" {
		return StockCountView{}, ErrCountInvalidState
	}

	lines, err := q.ListStockCountLines(ctx, db.ListStockCountLinesParams{
		WorkspaceID: workspaceID,
		CountID:     countID,
	})
	if err != nil {
		return StockCountView{}, err
	}

	currency := "NGN"
	if costSettings, err := q.GetCostingSettings(ctx, workspaceID); err == nil {
		currency = costSettings.Currency
	}

	for _, line := range lines {
		if line.VarianceQuantity.IsZero() {
			continue
		}

		bal, err := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
			WorkspaceID: workspaceID,
			LocationID:  cnt.LocationID,
			ProductID:   line.ProductID,
			VariantID:   line.VariantID,
		})
		if err != nil {
			return StockCountView{}, err
		}

		// Variance adjustment
		newQty := bal.QuantityOnHand.Add(line.VarianceQuantity)
		if newQty.IsNegative() {
			newQty = decimal.Zero
		}

		var costPerUnitDec decimal.Decimal
		if bal.QuantityOnHand.GreaterThan(decimal.Zero) {
			costPerUnitDec = decimal.NewFromInt(bal.ValueOnHandMinor).Div(bal.QuantityOnHand)
		} else {
			costPerUnitDec = decimal.NewFromInt(line.UnitCostMinor)
		}

		valDeltaMinor := line.VarianceQuantity.Mul(costPerUnitDec).Round(0).IntPart()
		newValMinor := bal.ValueOnHandMinor + valDeltaMinor
		if newValMinor < 0 {
			newValMinor = 0
		}
		if newQty.IsZero() {
			newValMinor = 0
		}

		if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
			WorkspaceID:       workspaceID,
			LocationID:        cnt.LocationID,
			ProductID:         line.ProductID,
			VariantID:         line.VariantID,
			QuantityOnHand:    newQty,
			ReservedQuantity:  bal.ReservedQuantity,
			InTransitQuantity: bal.InTransitQuantity,
			ValueOnHandMinor:  newValMinor,
		}); err != nil {
			return StockCountView{}, err
		}

		// Create inventory movement
		if _, err := q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{
			WorkspaceID:        workspaceID,
			ProductID:          line.ProductID,
			VariantID:          line.VariantID,
			GoodsReceiptLineID: pgtype.Int8{},
			LocationID:         pgtype.Int8{Int64: cnt.LocationID, Valid: true},
			MovementType:       "adjustment",
			SourceType:         "stock_count",
			SourceID:           pgtype.Int8{Int64: line.ID, Valid: true},
			QuantityDelta:      line.VarianceQuantity,
			ValueDeltaMinor:    valDeltaMinor,
			OccurredOn:         pgtype.Date{Time: occurredOn, Valid: true},
		}); err != nil {
			return StockCountView{}, err
		}

		// Double entry GL posting for variance
		if valDeltaMinor != 0 {
			absVal := valDeltaMinor
			if absVal < 0 {
				absVal = -absVal
			}
			ledger, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
				WorkspaceID:      workspaceID,
				SourceType:       "stock_count_variance",
				SourceID:         line.ID,
				EntryDate:        pgtype.Date{Time: occurredOn, Valid: true},
				Currency:         currency,
				CurrencyExponent: int32(CurrencyExponent(currency)),
				Description:      optionalPgText(fmt.Sprintf("Stock count variance for %s", line.ProductName)),
			})
			if err != nil {
				return StockCountView{}, err
			}

			if line.VarianceQuantity.IsNegative() {
				// Loss / shrinkage: Debit Expense, Credit Asset
				if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
					LedgerEntryID: ledger.ID,
					WorkspaceID:   workspaceID,
					AccountClass:  "expense",
					DebitMinor:    absVal,
					Description:   optionalPgText("Inventory Shrinkage"),
				}); err != nil {
					return StockCountView{}, err
				}
				if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
					LedgerEntryID: ledger.ID,
					WorkspaceID:   workspaceID,
					AccountClass:  "asset",
					CreditMinor:   absVal,
					Description:   optionalPgText("Inventory Asset Reduction"),
				}); err != nil {
					return StockCountView{}, err
				}
			} else {
				// Gain: Debit Asset, Credit Expense / Gain
				if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
					LedgerEntryID: ledger.ID,
					WorkspaceID:   workspaceID,
					AccountClass:  "asset",
					DebitMinor:    absVal,
					Description:   optionalPgText("Inventory Asset Increase"),
				}); err != nil {
					return StockCountView{}, err
				}
				if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
					LedgerEntryID: ledger.ID,
					WorkspaceID:   workspaceID,
					AccountClass:  "expense",
					CreditMinor:   absVal,
					Description:   optionalPgText("Inventory Over-count Gain"),
				}); err != nil {
					return StockCountView{}, err
				}
			}
		}
	}

	now := time.Now()
	if _, err := q.UpdateStockCountStatus(ctx, db.UpdateStockCountStatusParams{
		WorkspaceID: workspaceID,
		ID:          countID,
		Status:      "completed",
		CountedAt:   pgtype.Timestamptz{Time: now, Valid: true},
	}); err != nil {
		return StockCountView{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return StockCountView{}, err
	}

	return s.GetStockCount(ctx, workspaceID, countID)
}

func (s *Service) GetStockCount(ctx context.Context, workspaceID, countID int64) (StockCountView, error) {
	cnt, err := s.queries.GetStockCount(ctx, db.GetStockCountParams{
		WorkspaceID: workspaceID,
		ID:          countID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return StockCountView{}, ErrCountNotFound
	}
	if err != nil {
		return StockCountView{}, err
	}

	lines, err := s.queries.ListStockCountLines(ctx, db.ListStockCountLinesParams{
		WorkspaceID: workspaceID,
		CountID:     countID,
	})
	if err != nil {
		return StockCountView{}, err
	}

	lineViews := make([]StockCountLineView, 0, len(lines))
	for _, l := range lines {
		counted := pgNumericToString(l.CountedQuantity)
		lineViews = append(lineViews, StockCountLineView{
			ID:               l.ID,
			ProductID:        l.ProductID,
			ProductName:      l.ProductName,
			VariantID:        nullableInt64(l.VariantID),
			VariantName:      nullableText(l.VariantName),
			ExpectedQuantity: l.ExpectedQuantity.StringFixed(4),
			CountedQuantity:  counted,
			VarianceQuantity: l.VarianceQuantity.StringFixed(4),
			UnitCostMinor:    l.UnitCostMinor,
		})
	}

	return StockCountView{
		ID:           cnt.ID,
		CountNumber:  cnt.CountNumber,
		LocationID:   cnt.LocationID,
		LocationName: cnt.LocationName,
		Scope:        cnt.Scope,
		Status:       cnt.Status,
		CountedAt:    nullableTimeString(cnt.CountedAt),
		Notes:        nullableText(cnt.Notes),
		Lines:        lineViews,
		CreatedAt:    cnt.CreatedAt.Time,
		UpdatedAt:    cnt.UpdatedAt.Time,
	}, nil
}

func (s *Service) ListStockCounts(ctx context.Context, workspaceID int64, filter ListStockCountsFilter) ([]StockCountView, error) {
	var locID pgtype.Int8
	if filter.LocationID > 0 {
		locID = pgtype.Int8{Int64: filter.LocationID, Valid: true}
	}
	var statusParam pgtype.Text
	if strings.TrimSpace(filter.Status) != "" {
		statusParam = pgtype.Text{String: strings.TrimSpace(filter.Status), Valid: true}
	}

	rows, err := s.queries.ListStockCounts(ctx, db.ListStockCountsParams{
		WorkspaceID: workspaceID,
		Limit:       200,
		LocationID:  locID,
		Status:      statusParam,
	})
	if err != nil {
		return nil, err
	}

	out := make([]StockCountView, 0, len(rows))
	for _, r := range rows {
		out = append(out, StockCountView{
			ID:           r.ID,
			CountNumber:  r.CountNumber,
			LocationID:   r.LocationID,
			LocationName: r.LocationName,
			Scope:        r.Scope,
			Status:       r.Status,
			CountedAt:    nullableTimeString(r.CountedAt),
			Notes:        nullableText(r.Notes),
			CreatedAt:    r.CreatedAt.Time,
			UpdatedAt:    r.UpdatedAt.Time,
		})
	}
	return out, nil
}

func decimalToPgNumeric(d decimal.Decimal) pgtype.Numeric {
	var num pgtype.Numeric
	_ = num.Scan(d.StringFixed(4))
	return num
}

func pgNumericToString(num pgtype.Numeric) *string {
	if !num.Valid {
		return nil
	}
	val, err := num.Value()
	if err != nil || val == nil {
		return nil
	}
	d, err := decimal.NewFromString(fmt.Sprintf("%v", val))
	if err != nil {
		return nil
	}
	s := d.StringFixed(4)
	return &s
}
