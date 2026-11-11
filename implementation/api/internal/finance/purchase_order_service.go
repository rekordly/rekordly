package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
	"strconv"
	"time"
)

type PurchaseOrderView struct {
	ID                      int64   `json:"id"`
	SourcePurchaseRequestID int64   `json:"source_purchase_request_id"`
	Status                  string  `json:"status"`
	Version                 int32   `json:"version"`
	OrderNumber             *string `json:"order_number,omitempty"`
	Currency                string  `json:"currency"`
	CurrencyExponent        int32   `json:"currency_exponent"`
	TotalMinor              string  `json:"total_minor"`
	CancellationReason      *string `json:"cancellation_reason,omitempty"`
	ClosedReason            *string `json:"closed_reason,omitempty"`
	AcknowledgedAt          *string `json:"acknowledged_at,omitempty"`
	AcknowledgementNote     *string `json:"acknowledgement_note,omitempty"`
}

func purchaseOrderView(po db.PurchaseOrder) PurchaseOrderView {
	var acknowledgedAt *string
	if po.AcknowledgedAt.Valid {
		value := po.AcknowledgedAt.Time.UTC().Format(time.RFC3339)
		acknowledgedAt = &value
	}
	return PurchaseOrderView{ID: po.ID, SourcePurchaseRequestID: po.SourcePurchaseRequestID, Status: po.Status, Version: po.Version, OrderNumber: nullableText(po.OrderNumber), Currency: po.Currency, CurrencyExponent: po.CurrencyExponent, TotalMinor: strconv.FormatInt(po.TotalMinor, 10), CancellationReason: nullableText(po.CancellationReason), ClosedReason: nullableText(po.ClosedReason), AcknowledgedAt: acknowledgedAt, AcknowledgementNote: nullableText(po.AcknowledgementNote)}
}

func (s *Service) CreatePurchaseOrderFromRequest(ctx context.Context, ws, user, requestID int64, key string) (PurchaseOrderView, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return PurchaseOrderView{}, errors.New("an idempotency key is required")
	}
	if old, e := s.queries.GetPurchaseOrderByIdempotency(ctx, db.GetPurchaseOrderByIdempotencyParams{WorkspaceID: ws, IdempotencyKey: key}); e == nil {
		if old.SourcePurchaseRequestID != requestID {
			return PurchaseOrderView{}, ErrDuplicateIdempotent
		}
		return purchaseOrderView(old), nil
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return PurchaseOrderView{}, e
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return PurchaseOrderView{}, e
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	request, e := q.GetPurchaseRequestForUpdate(ctx, db.GetPurchaseRequestForUpdateParams{ID: requestID, WorkspaceID: ws})
	if errors.Is(e, pgx.ErrNoRows) {
		return PurchaseOrderView{}, ErrNotFound
	}
	if e != nil {
		return PurchaseOrderView{}, e
	}
	if request.Status != "approved" {
		return PurchaseOrderView{}, ErrInvalidPurchaseRequestState
	}
	if old, e := q.GetPurchaseOrderBySource(ctx, db.GetPurchaseOrderBySourceParams{WorkspaceID: ws, SourcePurchaseRequestID: requestID}); e == nil {
		return PurchaseOrderView{}, fmt.Errorf("purchase request already converted to PO %d", old.ID)
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return PurchaseOrderView{}, e
	}
	lines, e := q.GetPurchaseRequestLines(ctx, db.GetPurchaseRequestLinesParams{WorkspaceID: ws, PurchaseRequestID: requestID})
	if e != nil || len(lines) == 0 {
		return PurchaseOrderView{}, errors.New("approved request has no lines")
	}
	po, e := q.CreatePurchaseOrder(ctx, db.CreatePurchaseOrderParams{WorkspaceID: ws, SourcePurchaseRequestID: requestID, SupplierID: request.SupplierID, Currency: request.Currency, CurrencyExponent: request.CurrencyExponent, TotalMinor: request.EstimatedTotalMinor, IdempotencyKey: key, CreatedByUserID: user})
	if e != nil {
		return PurchaseOrderView{}, e
	}
	for _, line := range lines {
		qty, e := decimal.NewFromString(line.Quantity)
		if e != nil {
			return PurchaseOrderView{}, e
		}
		if e = q.CreatePurchaseOrderLine(ctx, db.CreatePurchaseOrderLineParams{WorkspaceID: ws, PurchaseOrderID: po.ID, SourcePurchaseRequestLineID: line.ID, ProductID: line.ProductID, Description: line.Description, Quantity: qty, UnitName: line.UnitName, ExpectedUnitCostMinor: line.EstimatedUnitPriceMinor, LineTotalMinor: line.EstimatedLineTotalMinor}); e != nil {
			return PurchaseOrderView{}, e
		}
	}
	if e = tx.Commit(ctx); e != nil {
		return PurchaseOrderView{}, e
	}
	return purchaseOrderView(po), nil
}

func (s *Service) ListPurchaseOrders(ctx context.Context, ws int64, before int64) ([]PurchaseOrderView, error) {
	var cursor pgtype.Int8
	if before > 0 {
		cursor = pgtype.Int8{Int64: before, Valid: true}
	}
	rows, e := s.queries.ListPurchaseOrders(ctx, db.ListPurchaseOrdersParams{WorkspaceID: ws, Limit: 50, BeforeID: cursor})
	if e != nil {
		return nil, e
	}
	out := make([]PurchaseOrderView, 0, len(rows))
	for _, r := range rows {
		out = append(out, purchaseOrderView(r))
	}
	return out, nil
}

// AdvancePurchaseOrder moves an operational PO through its approval and issue
// states. It deliberately has no stock, payable, expense, cash, or ledger
// effect. Each command is versioned and replay-safe inside the same database
// transaction as the state update.
func (s *Service) AdvancePurchaseOrder(ctx context.Context, ws, user, id int64, version int32, next, key string) (PurchaseOrderView, error) {
	key = strings.TrimSpace(key)
	if id <= 0 || version <= 0 || key == "" || len(key) > 200 {
		return PurchaseOrderView{}, errors.New("purchase order id, expected version and idempotency key are required")
	}
	if next != "submitted" && next != "approved" && next != "issued" && next != "acknowledged" {
		return PurchaseOrderView{}, errors.New("unsupported purchase order command")
	}
	if previous, err := s.queries.GetPurchaseOrderCommand(ctx, db.GetPurchaseOrderCommandParams{WorkspaceID: ws, IdempotencyKey: key}); err == nil {
		if previous.PurchaseOrderID != id || previous.Command != next || previous.ExpectedVersion != version {
			return PurchaseOrderView{}, ErrDuplicateIdempotent
		}
		current, getErr := s.queries.GetPurchaseOrderByID(ctx, db.GetPurchaseOrderByIDParams{WorkspaceID: ws, ID: id})
		if errors.Is(getErr, pgx.ErrNoRows) {
			return PurchaseOrderView{}, ErrNotFound
		}
		if getErr != nil {
			return PurchaseOrderView{}, getErr
		}
		return purchaseOrderView(current), nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return PurchaseOrderView{}, err
	}

	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return PurchaseOrderView{}, e
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	po, e := q.GetPurchaseOrderForUpdate(ctx, db.GetPurchaseOrderForUpdateParams{WorkspaceID: ws, ID: id})
	if errors.Is(e, pgx.ErrNoRows) {
		return PurchaseOrderView{}, ErrNotFound
	}
	if e != nil {
		return PurchaseOrderView{}, e
	}
	// Lock the document before re-checking the key. This closes the race where
	// a retry arrives while the first request is issuing the same PO.
	if previous, commandErr := q.GetPurchaseOrderCommand(ctx, db.GetPurchaseOrderCommandParams{WorkspaceID: ws, IdempotencyKey: key}); commandErr == nil {
		if previous.PurchaseOrderID != id || previous.Command != next || previous.ExpectedVersion != version {
			return PurchaseOrderView{}, ErrDuplicateIdempotent
		}
		return purchaseOrderView(po), nil
	} else if !errors.Is(commandErr, pgx.ErrNoRows) {
		return PurchaseOrderView{}, commandErr
	}
	if po.Version != version {
		return PurchaseOrderView{}, ErrPurchaseRequestVersion
	}
	if (next == "submitted" && po.Status != "draft") || (next == "approved" && po.Status != "submitted") || (next == "issued" && po.Status != "approved") || (next == "acknowledged" && po.Status != "issued") {
		return PurchaseOrderView{}, ErrInvalidPurchaseRequestState
	}
	var number pgtype.Text
	if next == "issued" {
		n, e := q.NextPurchaseOrderSequence(ctx, ws)
		if e != nil {
			return PurchaseOrderView{}, e
		}
		number = pgtype.Text{String: fmt.Sprintf("PO-%06d", n), Valid: true}
	}
	updated, e := q.AdvancePurchaseOrder(ctx, db.AdvancePurchaseOrderParams{WorkspaceID: ws, ID: id, Version: version, Status: next, ApprovedByUserID: pgtype.Int8{Int64: user, Valid: true}, OrderNumber: number})
	if e != nil {
		return PurchaseOrderView{}, e
	}
	if e = q.CreatePurchaseOrderCommand(ctx, db.CreatePurchaseOrderCommandParams{
		WorkspaceID: ws, PurchaseOrderID: id, Command: next, ExpectedVersion: version, IdempotencyKey: key, ActorUserID: user,
	}); e != nil {
		var pgErr *pgconn.PgError
		if errors.As(e, &pgErr) && pgErr.Code == "23505" {
			return PurchaseOrderView{}, ErrDuplicateIdempotent
		}
		return PurchaseOrderView{}, e
	}
	if _, e = q.CreatePurchaseOrderEvent(ctx, db.CreatePurchaseOrderEventParams{WorkspaceID: ws, PurchaseOrderID: id, EventType: next, OrderVersion: po.Version, ActorUserID: user}); e != nil {
		return PurchaseOrderView{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return PurchaseOrderView{}, e
	}
	return purchaseOrderView(updated), nil
}

// ResolvePurchaseOrder closes only an operational commitment. It never
// deletes or reverses receipts, bills, payments, inventory movements, or GL.
// Any financial correction must use its own controlled document.
func (s *Service) ResolvePurchaseOrder(ctx context.Context, ws, user, id, version int64, command, reason, key string) (PurchaseOrderView, error) {
	key = strings.TrimSpace(key)
	reason = strings.TrimSpace(reason)
	if id <= 0 || version <= 0 || key == "" || len(key) > 200 || len(reason) > 1000 {
		return PurchaseOrderView{}, errors.New("purchase order, version, idempotency key, and valid reason are required")
	}
	if (command == "cancel" || command == "cancel_remainder") && len(reason) < 3 {
		return PurchaseOrderView{}, errors.New("a cancellation reason of at least 3 characters is required")
	}
	if command != "cancel" && command != "cancel_remainder" && command != "close" {
		return PurchaseOrderView{}, errors.New("unsupported purchase order resolution command")
	}
	if previous, err := s.queries.GetPurchaseOrderCommand(ctx, db.GetPurchaseOrderCommandParams{WorkspaceID: ws, IdempotencyKey: key}); err == nil {
		if previous.PurchaseOrderID != id || previous.Command != command || previous.ExpectedVersion != int32(version) {
			return PurchaseOrderView{}, ErrDuplicateIdempotent
		}
		po, getErr := s.queries.GetPurchaseOrderByID(ctx, db.GetPurchaseOrderByIDParams{WorkspaceID: ws, ID: id})
		if errors.Is(getErr, pgx.ErrNoRows) {
			return PurchaseOrderView{}, ErrNotFound
		}
		return purchaseOrderView(po), getErr
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return PurchaseOrderView{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PurchaseOrderView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	po, err := q.GetPurchaseOrderForUpdate(ctx, db.GetPurchaseOrderForUpdateParams{WorkspaceID: ws, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return PurchaseOrderView{}, ErrNotFound
	}
	if err != nil {
		return PurchaseOrderView{}, err
	}
	if prior, err := q.GetPurchaseOrderCommand(ctx, db.GetPurchaseOrderCommandParams{WorkspaceID: ws, IdempotencyKey: key}); err == nil {
		if prior.PurchaseOrderID != id || prior.Command != command || prior.ExpectedVersion != int32(version) {
			return PurchaseOrderView{}, ErrDuplicateIdempotent
		}
		return purchaseOrderView(po), nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return PurchaseOrderView{}, err
	}
	if po.Version != int32(version) {
		return PurchaseOrderView{}, ErrPurchaseRequestVersion
	}
	status, event := "", ""
	switch command {
	case "cancel":
		if po.Status != "draft" && po.Status != "submitted" && po.Status != "approved" {
			return PurchaseOrderView{}, ErrInvalidPurchaseRequestState
		}
		status, event = "cancelled", "cancelled"
	case "cancel_remainder":
		if po.Status != "issued" && po.Status != "acknowledged" && po.Status != "partially_received" {
			return PurchaseOrderView{}, ErrInvalidPurchaseRequestState
		}
		if po.Status == "issued" || po.Status == "acknowledged" {
			status, event = "cancelled", "cancelled"
		} else {
			status, event = "partially_cancelled", "remainder_cancelled"
		}
	case "close":
		if po.Status != "fully_received" && po.Status != "partially_cancelled" {
			return PurchaseOrderView{}, ErrInvalidPurchaseRequestState
		}
		unbilled, countErr := q.CountUnbilledReceiptsForPurchaseOrder(ctx, db.CountUnbilledReceiptsForPurchaseOrderParams{WorkspaceID: ws, PurchaseOrderID: id})
		if countErr != nil {
			return PurchaseOrderView{}, countErr
		}
		if unbilled > 0 {
			return PurchaseOrderView{}, errors.New("purchase order has receipts awaiting supplier bills")
		}
		status, event = "closed", "closed"
	}
	updated, err := q.ResolvePurchaseOrder(ctx, db.ResolvePurchaseOrderParams{WorkspaceID: ws, ID: id, Version: int32(version), Status: status, CancellationReason: optionalPgText(reason)})
	if errors.Is(err, pgx.ErrNoRows) {
		return PurchaseOrderView{}, ErrPurchaseRequestVersion
	}
	if err != nil {
		return PurchaseOrderView{}, err
	}
	if err = q.CreatePurchaseOrderCommand(ctx, db.CreatePurchaseOrderCommandParams{WorkspaceID: ws, PurchaseOrderID: id, Command: command, ExpectedVersion: int32(version), IdempotencyKey: key, ActorUserID: user}); err != nil {
		return PurchaseOrderView{}, err
	}
	if _, err = q.CreatePurchaseOrderEvent(ctx, db.CreatePurchaseOrderEventParams{WorkspaceID: ws, PurchaseOrderID: id, EventType: event, OrderVersion: po.Version, Note: optionalPgText(reason), ActorUserID: user}); err != nil {
		return PurchaseOrderView{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return PurchaseOrderView{}, err
	}
	return purchaseOrderView(updated), nil
}
