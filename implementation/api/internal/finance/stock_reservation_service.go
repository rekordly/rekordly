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

var (
	ErrInsufficientStock    = errors.New("insufficient available stock")
	ErrReservationNotActive = errors.New("stock reservation is not active")
)

type ReserveStockInput struct {
	LocationID     int64   `json:"location_id"`
	ProductID      int64   `json:"product_id" binding:"required"`
	VariantID      *int64  `json:"variant_id"`
	OrderID        *int64  `json:"order_id"`
	Quantity       string  `json:"quantity" binding:"required"`
	ExpiresAt      *string `json:"expires_at"`
	Notes          string  `json:"notes"`
	IdempotencyKey string  `json:"idempotency_key"`
}

type StockReservationView struct {
	ID           int64     `json:"id"`
	LocationID   int64     `json:"location_id"`
	LocationName string    `json:"location_name,omitempty"`
	ProductID    int64     `json:"product_id"`
	ProductName  string    `json:"product_name,omitempty"`
	VariantID    *int64    `json:"variant_id,omitempty"`
	OrderID      *int64    `json:"order_id,omitempty"`
	Quantity     string    `json:"quantity"`
	Status       string    `json:"status"`
	ExpiresAt    *string   `json:"expires_at,omitempty"`
	Notes        *string   `json:"notes,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ListStockReservationsFilter struct {
	LocationID int64  `form:"location_id"`
	ProductID  int64  `form:"product_id"`
	Status     string `form:"status"`
}

func (s *Service) ReserveStock(ctx context.Context, workspaceID, userID int64, in ReserveStockInput) (StockReservationView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if key != "" {
		if existing, err := s.queries.GetStockReservationByIdempotency(ctx, db.GetStockReservationByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: optionalPgText(key),
		}); err == nil {
			return reservationToView(existing), nil
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return StockReservationView{}, err
		}
	}

	if in.ProductID <= 0 {
		return StockReservationView{}, errors.New("product is required")
	}

	qty, _, err := parseRequestQuantity(in.Quantity)
	if err != nil {
		return StockReservationView{}, err
	}
	if !qty.GreaterThan(decimal.Zero) {
		return StockReservationView{}, errors.New("reservation quantity must be greater than zero")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StockReservationView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	product, err := q.GetProductByID(ctx, db.GetProductByIDParams{
		WorkspaceID: workspaceID,
		ID:          in.ProductID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return StockReservationView{}, ErrNotFound
	}
	if err != nil {
		return StockReservationView{}, err
	}
	if product.Kind != "stock_tracked" {
		return StockReservationView{}, errors.New("stock reservations require a stock-tracked product")
	}

	location, err := inventoryLocationFor(ctx, q, workspaceID, in.LocationID)
	if err != nil {
		return StockReservationView{}, err
	}

	bal, err := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
		WorkspaceID: workspaceID,
		LocationID:  location.ID,
		ProductID:   product.ID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return StockReservationView{}, ErrInsufficientStock
	}
	if err != nil {
		return StockReservationView{}, err
	}

	available := bal.QuantityOnHand.Sub(bal.ReservedQuantity)
	if available.LessThan(qty) {
		return StockReservationView{}, ErrInsufficientStock
	}

	newReserved := bal.ReservedQuantity.Add(qty)
	if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
		WorkspaceID:       workspaceID,
		LocationID:        location.ID,
		ProductID:         product.ID,
		QuantityOnHand:    bal.QuantityOnHand,
		ReservedQuantity:  newReserved,
		InTransitQuantity: bal.InTransitQuantity,
		ValueOnHandMinor:  bal.ValueOnHandMinor,
	}); err != nil {
		return StockReservationView{}, fmt.Errorf("update reserved quantity: %w", err)
	}

	var expiresAt pgtype.Timestamptz
	if in.ExpiresAt != nil && strings.TrimSpace(*in.ExpiresAt) != "" {
		t, err := time.Parse(time.RFC3339, strings.TrimSpace(*in.ExpiresAt))
		if err == nil {
			expiresAt = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	var variantID pgtype.Int8
	if in.VariantID != nil && *in.VariantID > 0 {
		variantID = pgtype.Int8{Int64: *in.VariantID, Valid: true}
	}

	var orderID pgtype.Int8
	if in.OrderID != nil && *in.OrderID > 0 {
		orderID = pgtype.Int8{Int64: *in.OrderID, Valid: true}
	}

	res, err := q.CreateStockReservation(ctx, db.CreateStockReservationParams{
		WorkspaceID:    workspaceID,
		LocationID:     location.ID,
		ProductID:      product.ID,
		VariantID:      variantID,
		OrderID:        orderID,
		Quantity:       qty,
		Status:         "active",
		ExpiresAt:      expiresAt,
		Notes:          optionalPgText(in.Notes),
		IdempotencyKey: optionalPgText(key),
	})
	if err != nil {
		return StockReservationView{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return StockReservationView{}, err
	}

	view := reservationToView(res)
	view.LocationName = location.Name
	view.ProductName = product.Name
	return view, nil
}

func (s *Service) ReleaseStockReservation(ctx context.Context, workspaceID, userID, reservationID int64) (StockReservationView, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StockReservationView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	res, err := q.GetStockReservationForUpdate(ctx, db.GetStockReservationForUpdateParams{
		WorkspaceID: workspaceID,
		ID:          reservationID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return StockReservationView{}, ErrNotFound
	}
	if err != nil {
		return StockReservationView{}, err
	}

	if res.Status != "active" {
		return StockReservationView{}, ErrReservationNotActive
	}

	bal, err := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
		WorkspaceID: workspaceID,
		LocationID:  res.LocationID,
		ProductID:   res.ProductID,
	})
	if err != nil {
		return StockReservationView{}, err
	}

	newReserved := bal.ReservedQuantity.Sub(res.Quantity)
	if newReserved.IsNegative() {
		newReserved = decimal.Zero
	}

	if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
		WorkspaceID:       workspaceID,
		LocationID:        res.LocationID,
		ProductID:         res.ProductID,
		QuantityOnHand:    bal.QuantityOnHand,
		ReservedQuantity:  newReserved,
		InTransitQuantity: bal.InTransitQuantity,
		ValueOnHandMinor:  bal.ValueOnHandMinor,
	}); err != nil {
		return StockReservationView{}, err
	}

	updated, err := q.UpdateStockReservationStatus(ctx, db.UpdateStockReservationStatusParams{
		WorkspaceID: workspaceID,
		ID:          res.ID,
		Status:      "released",
	})
	if err != nil {
		return StockReservationView{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return StockReservationView{}, err
	}

	return reservationToView(updated), nil
}

func (s *Service) ListStockReservations(ctx context.Context, workspaceID int64, filter ListStockReservationsFilter) ([]StockReservationView, error) {
	var locID pgtype.Int8
	if filter.LocationID > 0 {
		locID = pgtype.Int8{Int64: filter.LocationID, Valid: true}
	}
	var prodID pgtype.Int8
	if filter.ProductID > 0 {
		prodID = pgtype.Int8{Int64: filter.ProductID, Valid: true}
	}
	var statusParam pgtype.Text
	if strings.TrimSpace(filter.Status) != "" {
		statusParam = pgtype.Text{String: strings.TrimSpace(filter.Status), Valid: true}
	}

	rows, err := s.queries.ListStockReservations(ctx, db.ListStockReservationsParams{
		WorkspaceID: workspaceID,
		Limit:       200,
		LocationID:  locID,
		ProductID:   prodID,
		Status:      statusParam,
	})
	if err != nil {
		return nil, err
	}

	out := make([]StockReservationView, 0, len(rows))
	for _, r := range rows {
		out = append(out, StockReservationView{
			ID:           r.ID,
			LocationID:   r.LocationID,
			LocationName: r.LocationName,
			ProductID:    r.ProductID,
			ProductName:  r.ProductName,
			VariantID:    nullableInt64(r.VariantID),
			OrderID:      nullableInt64(r.OrderID),
			Quantity:     r.Quantity.StringFixed(4),
			Status:       r.Status,
			ExpiresAt:    nullableTimeString(r.ExpiresAt),
			Notes:        nullableText(r.Notes),
			CreatedAt:    r.CreatedAt.Time,
			UpdatedAt:    r.UpdatedAt.Time,
		})
	}
	return out, nil
}

func reservationToView(res db.StockReservation) StockReservationView {
	return StockReservationView{
		ID:        res.ID,
		LocationID: res.LocationID,
		ProductID: res.ProductID,
		VariantID: nullableInt64(res.VariantID),
		OrderID:   nullableInt64(res.OrderID),
		Quantity:  res.Quantity.StringFixed(4),
		Status:    res.Status,
		ExpiresAt: nullableTimeString(res.ExpiresAt),
		Notes:     nullableText(res.Notes),
		CreatedAt: res.CreatedAt.Time,
		UpdatedAt: res.UpdatedAt.Time,
	}
}

func nullableInt64(v pgtype.Int8) *int64 {
	if !v.Valid {
		return nil
	}
	return &v.Int64
}

func nullableTimeString(v pgtype.Timestamptz) *string {
	if !v.Valid {
		return nil
	}
	s := v.Time.Format(time.RFC3339)
	return &s
}
