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
	ErrTransferNotFound     = errors.New("stock transfer not found")
	ErrTransferInvalidState = errors.New("stock transfer is not in valid state for this action")
	ErrSameLocationTransfer = errors.New("source and destination locations cannot be the same")
)

type CreateTransferLineInput struct {
	ProductID         int64  `json:"product_id" binding:"required"`
	VariantID         *int64 `json:"variant_id"`
	QuantityRequested string `json:"quantity_requested" binding:"required"`
}

type CreateTransferInput struct {
	SourceLocationID      int64                     `json:"source_location_id" binding:"required"`
	DestinationLocationID int64                     `json:"destination_location_id" binding:"required"`
	Notes                 string                    `json:"notes"`
	IdempotencyKey        string                    `json:"idempotency_key"`
	Lines                 []CreateTransferLineInput `json:"lines" binding:"required"`
}

type TransferLineView struct {
	ID                 int64   `json:"id"`
	ProductID          int64   `json:"product_id"`
	ProductName        string  `json:"product_name"`
	VariantID          *int64  `json:"variant_id,omitempty"`
	VariantName        *string `json:"variant_name,omitempty"`
	QuantityRequested  string  `json:"quantity_requested"`
	QuantityDispatched string  `json:"quantity_dispatched"`
	QuantityReceived   string  `json:"quantity_received"`
	UnitCostMinor      int64   `json:"unit_cost_minor"`
}

type TransferView struct {
	ID                      int64              `json:"id"`
	TransferNumber          string             `json:"transfer_number"`
	SourceLocationID        int64              `json:"source_location_id"`
	SourceLocationName      string             `json:"source_location_name"`
	DestinationLocationID   int64              `json:"destination_location_id"`
	DestinationLocationName string             `json:"destination_location_name"`
	Status                  string             `json:"status"`
	DispatchedAt            *string            `json:"dispatched_at,omitempty"`
	ReceivedAt              *string            `json:"received_at,omitempty"`
	Notes                   *string            `json:"notes,omitempty"`
	Lines                   []TransferLineView `json:"lines,omitempty"`
	CreatedAt               time.Time          `json:"created_at"`
	UpdatedAt               time.Time          `json:"updated_at"`
}

type ListStockTransfersFilter struct {
	LocationID int64  `form:"location_id"`
	Status     string `form:"status"`
}

type ReceiveTransferLineInput struct {
	LineID           int64  `json:"line_id" binding:"required"`
	QuantityReceived string `json:"quantity_received" binding:"required"`
}

type ReceiveTransferInput struct {
	OccurredOn string                     `json:"occurred_on" binding:"required"`
	Lines      []ReceiveTransferLineInput `json:"lines" binding:"required"`
}

func (s *Service) CreateStockTransfer(ctx context.Context, workspaceID, userID int64, in CreateTransferInput) (TransferView, error) {
	if in.SourceLocationID <= 0 || in.DestinationLocationID <= 0 {
		return TransferView{}, errors.New("source and destination locations are required")
	}
	if in.SourceLocationID == in.DestinationLocationID {
		return TransferView{}, ErrSameLocationTransfer
	}
	if len(in.Lines) == 0 {
		return TransferView{}, errors.New("at least one transfer line is required")
	}

	key := strings.TrimSpace(in.IdempotencyKey)
	if key != "" {
		if existing, err := s.queries.GetStockTransferByIdempotency(ctx, db.GetStockTransferByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: optionalPgText(key),
		}); err == nil {
			return s.GetStockTransfer(ctx, workspaceID, existing.ID)
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return TransferView{}, err
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return TransferView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	srcLoc, err := q.GetInventoryLocation(ctx, db.GetInventoryLocationParams{WorkspaceID: workspaceID, ID: in.SourceLocationID})
	if err != nil {
		return TransferView{}, fmt.Errorf("source location: %w", err)
	}
	dstLoc, err := q.GetInventoryLocation(ctx, db.GetInventoryLocationParams{WorkspaceID: workspaceID, ID: in.DestinationLocationID})
	if err != nil {
		return TransferView{}, fmt.Errorf("destination location: %w", err)
	}

	trfNumber := fmt.Sprintf("TRF-%d-%04d", time.Now().Unix(), rand.Intn(10000))

	trf, err := q.CreateStockTransfer(ctx, db.CreateStockTransferParams{
		WorkspaceID:           workspaceID,
		TransferNumber:        trfNumber,
		SourceLocationID:      srcLoc.ID,
		DestinationLocationID: dstLoc.ID,
		Status:                "draft",
		Notes:                 optionalPgText(in.Notes),
		IdempotencyKey:        optionalPgText(key),
		CreatedByUserID:       userID,
	})
	if err != nil {
		return TransferView{}, err
	}

	lineViews := make([]TransferLineView, 0, len(in.Lines))
	for _, l := range in.Lines {
		qty, _, err := parseRequestQuantity(l.QuantityRequested)
		if err != nil || !qty.GreaterThan(decimal.Zero) {
			return TransferView{}, errors.New("requested quantity must be greater than zero")
		}
		prod, err := q.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: l.ProductID})
		if err != nil {
			return TransferView{}, fmt.Errorf("product %d: %w", l.ProductID, err)
		}

		var vID pgtype.Int8
		if l.VariantID != nil && *l.VariantID > 0 {
			vID = pgtype.Int8{Int64: *l.VariantID, Valid: true}
		}
		vID, err = stockVariant(ctx, q, workspaceID, prod, vID)
		if err != nil {
			return TransferView{}, err
		}

		line, err := q.CreateStockTransferLine(ctx, db.CreateStockTransferLineParams{
			WorkspaceID:        workspaceID,
			TransferID:         trf.ID,
			ProductID:          prod.ID,
			VariantID:          vID,
			QuantityRequested:  qty,
			QuantityDispatched: decimal.Zero,
			QuantityReceived:   decimal.Zero,
			UnitCostMinor:      0,
		})
		if err != nil {
			return TransferView{}, fmt.Errorf("create transfer line: %w", err)
		}

		lineViews = append(lineViews, TransferLineView{
			ID:                 line.ID,
			ProductID:          prod.ID,
			ProductName:        prod.Name,
			VariantID:          nullableInt64(line.VariantID),
			QuantityRequested:  line.QuantityRequested.StringFixed(4),
			QuantityDispatched: "0.0000",
			QuantityReceived:   "0.0000",
			UnitCostMinor:      0,
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return TransferView{}, err
	}

	return TransferView{
		ID:                      trf.ID,
		TransferNumber:          trf.TransferNumber,
		SourceLocationID:        srcLoc.ID,
		SourceLocationName:      srcLoc.Name,
		DestinationLocationID:   dstLoc.ID,
		DestinationLocationName: dstLoc.Name,
		Status:                  trf.Status,
		Notes:                   nullableText(trf.Notes),
		Lines:                   lineViews,
		CreatedAt:               trf.CreatedAt.Time,
		UpdatedAt:               trf.UpdatedAt.Time,
	}, nil
}

func (s *Service) DispatchStockTransfer(ctx context.Context, workspaceID, userID, transferID int64, occurredOnStr string) (TransferView, error) {
	occurredOn, err := time.Parse("2006-01-02", strings.TrimSpace(occurredOnStr))
	if err != nil {
		occurredOn = time.Now()
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return TransferView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	trf, err := q.GetStockTransferForUpdate(ctx, db.GetStockTransferForUpdateParams{
		WorkspaceID: workspaceID,
		ID:          transferID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return TransferView{}, ErrTransferNotFound
	}
	if err != nil {
		return TransferView{}, err
	}
	if trf.Status != "draft" {
		return TransferView{}, ErrTransferInvalidState
	}

	lines, err := q.ListStockTransferLines(ctx, db.ListStockTransferLinesParams{
		WorkspaceID: workspaceID,
		TransferID:  transferID,
	})
	if err != nil {
		return TransferView{}, err
	}

	for _, line := range lines {
		// Lock source balance
		srcBal, err := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
			WorkspaceID: workspaceID,
			LocationID:  trf.SourceLocationID,
			ProductID:   line.ProductID,
			VariantID:   line.VariantID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return TransferView{}, ErrInsufficientStock
		}
		if err != nil {
			return TransferView{}, err
		}

		available := srcBal.QuantityOnHand.Sub(srcBal.ReservedQuantity)
		if available.LessThan(line.QuantityRequested) {
			return TransferView{}, fmt.Errorf("insufficient stock for product %s (available %s, requested %s)", line.ProductName, available.StringFixed(4), line.QuantityRequested.StringFixed(4))
		}

		// Calculate unit cost from source
		unitCostDec := decimal.NewFromInt(srcBal.ValueOnHandMinor).Div(srcBal.QuantityOnHand)
		lineCostMinor := unitCostDec.Mul(line.QuantityRequested).Round(0).IntPart()

		// Deduct source on hand
		newSrcQty := srcBal.QuantityOnHand.Sub(line.QuantityRequested)
		var newSrcValue int64
		if newSrcQty.IsZero() {
			newSrcValue = 0
		} else {
			newSrcValue = srcBal.ValueOnHandMinor - lineCostMinor
			if newSrcValue < 0 {
				newSrcValue = 0
			}
		}

		if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
			WorkspaceID:       workspaceID,
			LocationID:        trf.SourceLocationID,
			ProductID:         line.ProductID,
			VariantID:         line.VariantID,
			QuantityOnHand:    newSrcQty,
			ReservedQuantity:  srcBal.ReservedQuantity,
			InTransitQuantity: srcBal.InTransitQuantity,
			ValueOnHandMinor:  newSrcValue,
		}); err != nil {
			return TransferView{}, err
		}

		// Create source movement (transfer_out)
		if _, err := q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{
			WorkspaceID:        workspaceID,
			ProductID:          line.ProductID,
			VariantID:          line.VariantID,
			GoodsReceiptLineID: pgtype.Int8{},
			LocationID:         pgtype.Int8{Int64: trf.SourceLocationID, Valid: true},
			MovementType:       "transfer_out",
			SourceType:         "inventory_transfer",
			SourceID:           pgtype.Int8{Int64: trf.ID, Valid: true},
			QuantityDelta:      line.QuantityRequested.Neg(),
			ValueDeltaMinor:    -lineCostMinor,
			OccurredOn:         pgtype.Date{Time: occurredOn, Valid: true},
		}); err != nil {
			return TransferView{}, err
		}

		// Increment destination in-transit quantity
		dstBal, err := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
			WorkspaceID: workspaceID,
			LocationID:  trf.DestinationLocationID,
			ProductID:   line.ProductID,
			VariantID:   line.VariantID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			// initialize balance for destination
			dstBal, err = q.UpsertInventoryBalance(ctx, db.UpsertInventoryBalanceParams{
				WorkspaceID:      workspaceID,
				LocationID:       trf.DestinationLocationID,
				ProductID:        line.ProductID,
				VariantID:        line.VariantID,
				QuantityOnHand:   decimal.Zero,
				ValueOnHandMinor: 0,
			})
			if err != nil {
				return TransferView{}, err
			}
		} else if err != nil {
			return TransferView{}, err
		}

		newInTransit := dstBal.InTransitQuantity.Add(line.QuantityRequested)
		if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
			WorkspaceID:       workspaceID,
			LocationID:        trf.DestinationLocationID,
			ProductID:         line.ProductID,
			VariantID:         line.VariantID,
			QuantityOnHand:    dstBal.QuantityOnHand,
			ReservedQuantity:  dstBal.ReservedQuantity,
			InTransitQuantity: newInTransit,
			ValueOnHandMinor:  dstBal.ValueOnHandMinor,
		}); err != nil {
			return TransferView{}, err
		}

		unitCost := int64(0)
		if line.QuantityRequested.GreaterThan(decimal.Zero) {
			unitCost = lineCostMinor / line.QuantityRequested.IntPart()
			if unitCost <= 0 {
				unitCost = lineCostMinor
			}
		}

		// Update transfer line
		if _, err := q.UpdateStockTransferLineQuantities(ctx, db.UpdateStockTransferLineQuantitiesParams{
			WorkspaceID:        workspaceID,
			TransferID:         trf.ID,
			ID:                 line.ID,
			QuantityDispatched: line.QuantityRequested,
			QuantityReceived:   decimal.Zero,
			UnitCostMinor:      unitCost,
		}); err != nil {
			return TransferView{}, err
		}
	}

	now := time.Now()
	if _, err := q.UpdateStockTransferStatus(ctx, db.UpdateStockTransferStatusParams{
		WorkspaceID:  workspaceID,
		ID:           transferID,
		Status:       "dispatched",
		DispatchedAt: pgtype.Timestamptz{Time: now, Valid: true},
		ReceivedAt:   pgtype.Timestamptz{},
	}); err != nil {
		return TransferView{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return TransferView{}, err
	}

	return s.GetStockTransfer(ctx, workspaceID, transferID)
}

func (s *Service) ReceiveStockTransfer(ctx context.Context, workspaceID, userID, transferID int64, in ReceiveTransferInput) (TransferView, error) {
	occurredOn, err := time.Parse("2006-01-02", strings.TrimSpace(in.OccurredOn))
	if err != nil {
		occurredOn = time.Now()
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return TransferView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	trf, err := q.GetStockTransferForUpdate(ctx, db.GetStockTransferForUpdateParams{
		WorkspaceID: workspaceID,
		ID:          transferID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return TransferView{}, ErrTransferNotFound
	}
	if err != nil {
		return TransferView{}, err
	}
	if trf.Status != "dispatched" {
		return TransferView{}, ErrTransferInvalidState
	}

	lines, err := q.ListStockTransferLines(ctx, db.ListStockTransferLinesParams{
		WorkspaceID: workspaceID,
		TransferID:  transferID,
	})
	if err != nil {
		return TransferView{}, err
	}

	recvByLineID := make(map[int64]decimal.Decimal)
	for _, l := range in.Lines {
		qty, _, err := parseRequestQuantity(l.QuantityReceived)
		if err != nil {
			return TransferView{}, err
		}
		recvByLineID[l.LineID] = qty
	}

	for _, line := range lines {
		recvQty, ok := recvByLineID[line.ID]
		if !ok {
			// default to full dispatched quantity
			recvQty = line.QuantityDispatched
		}

		if recvQty.GreaterThan(line.QuantityDispatched) {
			return TransferView{}, fmt.Errorf("received quantity cannot exceed dispatched quantity for line %d", line.ID)
		}

		dstBal, err := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
			WorkspaceID: workspaceID,
			LocationID:  trf.DestinationLocationID,
			ProductID:   line.ProductID,
			VariantID:   line.VariantID,
		})
		if err != nil {
			return TransferView{}, err
		}

		newInTransit := dstBal.InTransitQuantity.Sub(line.QuantityDispatched)
		if newInTransit.IsNegative() {
			newInTransit = decimal.Zero
		}

		lineValMinor := line.QuantityDispatched.Mul(decimal.NewFromInt(line.UnitCostMinor)).Round(0).IntPart()
		recvValMinor := recvQty.Mul(decimal.NewFromInt(line.UnitCostMinor)).Round(0).IntPart()

		newOnHand := dstBal.QuantityOnHand.Add(recvQty)
		newValOnHand := dstBal.ValueOnHandMinor + recvValMinor

		if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
			WorkspaceID:       workspaceID,
			LocationID:        trf.DestinationLocationID,
			ProductID:         line.ProductID,
			VariantID:         line.VariantID,
			QuantityOnHand:    newOnHand,
			ReservedQuantity:  dstBal.ReservedQuantity,
			InTransitQuantity: newInTransit,
			ValueOnHandMinor:  newValOnHand,
		}); err != nil {
			return TransferView{}, err
		}

		// Destination receipt movement
		if _, err := q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{
			WorkspaceID:        workspaceID,
			ProductID:          line.ProductID,
			VariantID:          line.VariantID,
			GoodsReceiptLineID: pgtype.Int8{},
			LocationID:         pgtype.Int8{Int64: trf.DestinationLocationID, Valid: true},
			MovementType:       "transfer_in",
			SourceType:         "inventory_transfer",
			SourceID:           pgtype.Int8{Int64: trf.ID, Valid: true},
			QuantityDelta:      recvQty,
			ValueDeltaMinor:    recvValMinor,
			OccurredOn:         pgtype.Date{Time: occurredOn, Valid: true},
		}); err != nil {
			return TransferView{}, err
		}

		// If variance / loss exists:
		shortageQty := line.QuantityDispatched.Sub(recvQty)
		if shortageQty.GreaterThan(decimal.Zero) {
			shortageValMinor := lineValMinor - recvValMinor
			if shortageValMinor > 0 {
				currency := "NGN"
				if costSettings, err := q.GetCostingSettings(ctx, workspaceID); err == nil {
					currency = costSettings.Currency
				}
				ledger, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
					WorkspaceID:      workspaceID,
					SourceType:       "inventory_transfer_variance",
					SourceID:         line.ID,
					EntryDate:        pgtype.Date{Time: occurredOn, Valid: true},
					Currency:         currency,
					CurrencyExponent: int32(CurrencyExponent(currency)),
					Description:      optionalPgText(fmt.Sprintf("Transfer loss/variance for %s", line.ProductName)),
				})
				if err != nil {
					return TransferView{}, err
				}
				if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
					LedgerEntryID: ledger.ID,
					WorkspaceID:   workspaceID,
					AccountClass:  "expense",
					DebitMinor:    shortageValMinor,
					Description:   optionalPgText("Inventory Transfer Loss"),
				}); err != nil {
					return TransferView{}, err
				}
				if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
					LedgerEntryID: ledger.ID,
					WorkspaceID:   workspaceID,
					AccountClass:  "asset",
					CreditMinor:   shortageValMinor,
					Description:   optionalPgText("Inventory in-transit shrinkage"),
				}); err != nil {
					return TransferView{}, err
				}
			}
		}

		// Update transfer line
		if _, err := q.UpdateStockTransferLineQuantities(ctx, db.UpdateStockTransferLineQuantitiesParams{
			WorkspaceID:        workspaceID,
			TransferID:         trf.ID,
			ID:                 line.ID,
			QuantityDispatched: line.QuantityDispatched,
			QuantityReceived:   recvQty,
			UnitCostMinor:      line.UnitCostMinor,
		}); err != nil {
			return TransferView{}, err
		}
	}

	now := time.Now()
	if _, err := q.UpdateStockTransferStatus(ctx, db.UpdateStockTransferStatusParams{
		WorkspaceID:  workspaceID,
		ID:           transferID,
		Status:       "received",
		DispatchedAt: trf.DispatchedAt,
		ReceivedAt:   pgtype.Timestamptz{Time: now, Valid: true},
	}); err != nil {
		return TransferView{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return TransferView{}, err
	}

	return s.GetStockTransfer(ctx, workspaceID, transferID)
}

func (s *Service) GetStockTransfer(ctx context.Context, workspaceID, transferID int64) (TransferView, error) {
	trf, err := s.queries.GetStockTransfer(ctx, db.GetStockTransferParams{
		WorkspaceID: workspaceID,
		ID:          transferID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return TransferView{}, ErrTransferNotFound
	}
	if err != nil {
		return TransferView{}, err
	}

	lines, err := s.queries.ListStockTransferLines(ctx, db.ListStockTransferLinesParams{
		WorkspaceID: workspaceID,
		TransferID:  transferID,
	})
	if err != nil {
		return TransferView{}, err
	}

	lineViews := make([]TransferLineView, 0, len(lines))
	for _, l := range lines {
		lineViews = append(lineViews, TransferLineView{
			ID:                 l.ID,
			ProductID:          l.ProductID,
			ProductName:        l.ProductName,
			VariantID:          nullableInt64(l.VariantID),
			VariantName:        nullableText(l.VariantName),
			QuantityRequested:  l.QuantityRequested.StringFixed(4),
			QuantityDispatched: l.QuantityDispatched.StringFixed(4),
			QuantityReceived:   l.QuantityReceived.StringFixed(4),
			UnitCostMinor:      l.UnitCostMinor,
		})
	}

	return TransferView{
		ID:                      trf.ID,
		TransferNumber:          trf.TransferNumber,
		SourceLocationID:        trf.SourceLocationID,
		SourceLocationName:      trf.SourceLocationName,
		DestinationLocationID:   trf.DestinationLocationID,
		DestinationLocationName: trf.DestinationLocationName,
		Status:                  trf.Status,
		DispatchedAt:            nullableTimeString(trf.DispatchedAt),
		ReceivedAt:              nullableTimeString(trf.ReceivedAt),
		Notes:                   nullableText(trf.Notes),
		Lines:                   lineViews,
		CreatedAt:               trf.CreatedAt.Time,
		UpdatedAt:               trf.UpdatedAt.Time,
	}, nil
}

func (s *Service) ListStockTransfers(ctx context.Context, workspaceID int64, filter ListStockTransfersFilter) ([]TransferView, error) {
	var statusParam pgtype.Text
	if strings.TrimSpace(filter.Status) != "" {
		statusParam = pgtype.Text{String: strings.TrimSpace(filter.Status), Valid: true}
	}
	var locID pgtype.Int8
	if filter.LocationID > 0 {
		locID = pgtype.Int8{Int64: filter.LocationID, Valid: true}
	}

	rows, err := s.queries.ListStockTransfers(ctx, db.ListStockTransfersParams{
		WorkspaceID: workspaceID,
		Limit:       200,
		Status:      statusParam,
		LocationID:  locID,
	})
	if err != nil {
		return nil, err
	}

	out := make([]TransferView, 0, len(rows))
	for _, r := range rows {
		out = append(out, TransferView{
			ID:                      r.ID,
			TransferNumber:          r.TransferNumber,
			SourceLocationID:        r.SourceLocationID,
			SourceLocationName:      r.SourceLocationName,
			DestinationLocationID:   r.DestinationLocationID,
			DestinationLocationName: r.DestinationLocationName,
			Status:                  r.Status,
			DispatchedAt:            nullableTimeString(r.DispatchedAt),
			ReceivedAt:              nullableTimeString(r.ReceivedAt),
			Notes:                   nullableText(r.Notes),
			CreatedAt:               r.CreatedAt.Time,
			UpdatedAt:               r.UpdatedAt.Time,
		})
	}
	return out, nil
}
