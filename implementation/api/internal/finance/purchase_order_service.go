package finance

import (
	"context"
	"encoding/json"
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
	ID                      int64                      `json:"id"`
	SourcePurchaseRequestID int64                      `json:"source_purchase_request_id"`
	SupplierID              *int64                     `json:"supplier_id,omitempty"`
	OutletID                *int64                     `json:"outlet_id,omitempty"`
	Status                  string                     `json:"status"`
	Version                 int32                      `json:"version"`
	OrderNumber             *string                    `json:"order_number,omitempty"`
	ExpectedDate            *string                    `json:"expected_date,omitempty"`
	PaymentTerms            *string                    `json:"payment_terms,omitempty"`
	Notes                   *string                    `json:"notes,omitempty"`
	Currency                string                     `json:"currency"`
	CurrencyExponent        int32                      `json:"currency_exponent"`
	TotalMinor              string                     `json:"total_minor"`
	CancellationReason      *string                    `json:"cancellation_reason,omitempty"`
	ClosedReason            *string                    `json:"closed_reason,omitempty"`
	AcknowledgedAt          *string                    `json:"acknowledged_at,omitempty"`
	AcknowledgementNote     *string                    `json:"acknowledgement_note,omitempty"`
	Lines                   []PurchaseOrderLineView    `json:"lines,omitempty"`
	Events                  []PurchaseOrderEventView   `json:"events,omitempty"`
	Versions                []PurchaseOrderVersionView `json:"versions,omitempty"`
}

type PurchaseOrderLineView struct {
	ID                    int64  `json:"id"`
	ProductID             *int64 `json:"product_id,omitempty"`
	Description           string `json:"description"`
	Quantity              string `json:"quantity"`
	UnitName              string `json:"unit_name"`
	ExpectedUnitCostMinor string `json:"expected_unit_cost_minor"`
	DiscountMinor         string `json:"discount_minor"`
	TaxAmountMinor        string `json:"tax_amount_minor"`
	LineTotalMinor        string `json:"line_total_minor"`
}
type PurchaseOrderEventView struct {
	ID           int64   `json:"id"`
	EventType    string  `json:"event_type"`
	OrderVersion int32   `json:"order_version"`
	Note         *string `json:"note,omitempty"`
	ActorUserID  int64   `json:"actor_user_id"`
	CreatedAt    string  `json:"created_at"`
}
type PurchaseOrderVersionView struct {
	ID              int64           `json:"id"`
	Version         int32           `json:"version"`
	Snapshot        json.RawMessage `json:"snapshot"`
	ChangeReason    *string         `json:"change_reason,omitempty"`
	ChangedByUserID int64           `json:"changed_by_user_id"`
	CreatedAt       string          `json:"created_at"`
}

type PurchaseOrderLineInput struct {
	ID               int64  `json:"id"`
	ProductID        *int64 `json:"product_id"`
	Description      string `json:"description"`
	Quantity         string `json:"quantity"`
	UnitName         string `json:"unit_name"`
	ExpectedUnitCost string `json:"expected_unit_cost"`
	Discount         string `json:"discount"`
	TaxAmount        string `json:"tax_amount"`
}

type CreatePurchaseOrderInput struct {
	PurchaseRequestID int64                    `json:"purchase_request_id"`
	SupplierID        int64                    `json:"supplier_id"`
	OutletID          *int64                   `json:"outlet_id"`
	ExpectedDate      string                   `json:"expected_date"`
	PaymentTerms      string                   `json:"payment_terms"`
	Notes             string                   `json:"notes"`
	Currency          string                   `json:"currency"`
	Lines             []PurchaseOrderLineInput `json:"lines"`
	IdempotencyKey    string                   `json:"idempotency_key"`
}

type UpdatePurchaseOrderDraftInput struct {
	ExpectedVersion int32                    `json:"expected_version"`
	SupplierID      int64                    `json:"supplier_id"`
	OutletID        *int64                   `json:"outlet_id"`
	ExpectedDate    string                   `json:"expected_date"`
	PaymentTerms    string                   `json:"payment_terms"`
	Notes           string                   `json:"notes"`
	Currency        string                   `json:"currency"`
	Lines           []PurchaseOrderLineInput `json:"lines"`
}

type RevisePurchaseOrderInput struct {
	ExpectedVersion int32                    `json:"expected_version"`
	Reason          string                   `json:"reason"`
	ExpectedDate    string                   `json:"expected_date"`
	PaymentTerms    string                   `json:"payment_terms"`
	Notes           string                   `json:"notes"`
	Lines           []PurchaseOrderLineInput `json:"lines"`
	IdempotencyKey  string                   `json:"idempotency_key"`
}

func purchaseOrderView(po db.PurchaseOrder) PurchaseOrderView {
	var acknowledgedAt *string
	if po.AcknowledgedAt.Valid {
		value := po.AcknowledgedAt.Time.UTC().Format(time.RFC3339)
		acknowledgedAt = &value
	}
	var srcID int64
	if po.SourcePurchaseRequestID.Valid {
		srcID = po.SourcePurchaseRequestID.Int64
	}
	return PurchaseOrderView{
		ID:                      po.ID,
		SourcePurchaseRequestID: srcID,
		SupplierID:              nullableInt8(po.SupplierID),
		OutletID:                nullableInt8(po.OutletID),
		Status:                  po.Status,
		Version:                 po.Version,
		OrderNumber:             nullableText(po.OrderNumber),
		ExpectedDate:            nullableDate(po.ExpectedDate),
		PaymentTerms:            nullableText(po.PaymentTerms),
		Notes:                   nullableText(po.Notes),
		Currency:                po.Currency,
		CurrencyExponent:        po.CurrencyExponent,
		TotalMinor:              strconv.FormatInt(po.TotalMinor, 10),
		CancellationReason:      nullableText(po.CancellationReason),
		ClosedReason:            nullableText(po.ClosedReason),
		AcknowledgedAt:          acknowledgedAt,
		AcknowledgementNote:     nullableText(po.AcknowledgementNote),
	}
}

func purchaseOrderDetail(ctx context.Context, q *db.Queries, po db.PurchaseOrder) (PurchaseOrderView, error) {
	view := purchaseOrderView(po)
	lines, err := q.GetPurchaseOrderLines(ctx, db.GetPurchaseOrderLinesParams{WorkspaceID: po.WorkspaceID, PurchaseOrderID: po.ID})
	if err != nil {
		return PurchaseOrderView{}, err
	}
	view.Lines = make([]PurchaseOrderLineView, 0, len(lines))
	for _, line := range lines {
		var productID *int64
		if line.ProductID.Valid {
			x := line.ProductID.Int64
			productID = &x
		}
		view.Lines = append(view.Lines, PurchaseOrderLineView{
			ID:                    line.ID,
			ProductID:             productID,
			Description:           line.Description,
			Quantity:              line.Quantity.String(),
			UnitName:              line.UnitName,
			ExpectedUnitCostMinor: strconv.FormatInt(line.ExpectedUnitCostMinor, 10),
			DiscountMinor:         strconv.FormatInt(line.DiscountMinor, 10),
			TaxAmountMinor:        strconv.FormatInt(line.TaxAmountMinor, 10),
			LineTotalMinor:        strconv.FormatInt(line.LineTotalMinor, 10),
		})
	}
	events, err := q.ListPurchaseOrderEvents(ctx, db.ListPurchaseOrderEventsParams{WorkspaceID: po.WorkspaceID, PurchaseOrderID: po.ID})
	if err != nil {
		return PurchaseOrderView{}, err
	}
	view.Events = make([]PurchaseOrderEventView, 0, len(events))
	for _, event := range events {
		var note *string
		if event.Note.Valid {
			note = &event.Note.String
		}
		view.Events = append(view.Events, PurchaseOrderEventView{ID: event.ID, EventType: event.EventType, OrderVersion: event.OrderVersion, Note: note, ActorUserID: event.ActorUserID, CreatedAt: event.CreatedAt.Time.UTC().Format(time.RFC3339)})
	}
	versions, err := q.ListPurchaseOrderVersions(ctx, db.ListPurchaseOrderVersionsParams{WorkspaceID: po.WorkspaceID, PurchaseOrderID: po.ID})
	if err == nil && len(versions) > 0 {
		view.Versions = make([]PurchaseOrderVersionView, 0, len(versions))
		for _, v := range versions {
			view.Versions = append(view.Versions, PurchaseOrderVersionView{
				ID:              v.ID,
				Version:         v.Version,
				Snapshot:        json.RawMessage(v.Snapshot),
				ChangeReason:    nullableText(v.ChangeReason),
				ChangedByUserID: v.ChangedByUserID,
				CreatedAt:       v.CreatedAt.Time.UTC().Format(time.RFC3339),
			})
		}
	}
	return view, nil
}

func (s *Service) GetPurchaseOrder(ctx context.Context, ws, id int64) (PurchaseOrderView, error) {
	po, err := s.queries.GetPurchaseOrderByID(ctx, db.GetPurchaseOrderByIDParams{WorkspaceID: ws, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return PurchaseOrderView{}, ErrNotFound
	}
	if err != nil {
		return PurchaseOrderView{}, err
	}
	return purchaseOrderDetail(ctx, s.queries, po)
}

func (s *Service) CreatePurchaseOrderFromRequest(ctx context.Context, ws, user, requestID int64, key string) (PurchaseOrderView, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return PurchaseOrderView{}, errors.New("an idempotency key is required")
	}
	if old, e := s.queries.GetPurchaseOrderByIdempotency(ctx, db.GetPurchaseOrderByIdempotencyParams{WorkspaceID: ws, IdempotencyKey: key}); e == nil {
		if !old.SourcePurchaseRequestID.Valid || old.SourcePurchaseRequestID.Int64 != requestID {
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
	if old, e := q.GetPurchaseOrderBySource(ctx, db.GetPurchaseOrderBySourceParams{WorkspaceID: ws, SourcePurchaseRequestID: pgtype.Int8{Int64: requestID, Valid: true}}); e == nil {
		return PurchaseOrderView{}, fmt.Errorf("purchase request already converted to PO %d", old.ID)
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return PurchaseOrderView{}, e
	}
	lines, e := q.GetPurchaseRequestLines(ctx, db.GetPurchaseRequestLinesParams{WorkspaceID: ws, PurchaseRequestID: requestID})
	if e != nil || len(lines) == 0 {
		return PurchaseOrderView{}, errors.New("approved request has no lines")
	}
	po, e := q.CreatePurchaseOrder(ctx, db.CreatePurchaseOrderParams{
		WorkspaceID:             ws,
		SourcePurchaseRequestID: pgtype.Int8{Int64: requestID, Valid: true},
		SupplierID:              request.SupplierID,
		Currency:                request.Currency,
		CurrencyExponent:        request.CurrencyExponent,
		TotalMinor:              request.EstimatedTotalMinor,
		IdempotencyKey:          key,
		CreatedByUserID:         user,
	})
	if e != nil {
		return PurchaseOrderView{}, e
	}
	for _, line := range lines {
		qty, e := decimal.NewFromString(line.Quantity)
		if e != nil {
			return PurchaseOrderView{}, e
		}
		if e = q.CreatePurchaseOrderLine(ctx, db.CreatePurchaseOrderLineParams{
			WorkspaceID:                 ws,
			PurchaseOrderID:             po.ID,
			SourcePurchaseRequestLineID: pgtype.Int8{Int64: line.ID, Valid: true},
			ProductID:                   line.ProductID,
			Description:                 line.Description,
			Quantity:                    qty,
			UnitName:                    line.UnitName,
			ExpectedUnitCostMinor:       line.EstimatedUnitPriceMinor,
			LineTotalMinor:              line.EstimatedLineTotalMinor,
		}); e != nil {
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
		unbilled, countErr := q.CountUnbilledReceiptsForPurchaseOrder(ctx, db.CountUnbilledReceiptsForPurchaseOrderParams{WorkspaceID: ws, PurchaseOrderID: pgtype.Int8{Int64: id, Valid: true}})
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

type preparedPOLine struct {
	id                    int64
	productID             pgtype.Int8
	description           string
	qty                   decimal.Decimal
	unitName              string
	expectedUnitCostMinor int64
	discountMinor         int64
	taxAmountMinor        int64
	lineTotalMinor        int64
}

func parseOptionalNonNegativeMajor(input string, exponent int) (int64, error) {
	s := strings.TrimSpace(input)
	if s == "" {
		return 0, nil
	}
	if d, err := decimal.NewFromString(s); err == nil && d.IsZero() && !strings.ContainsAny(s, "eE+-") {
		return 0, nil
	}
	return ParseMajorToMinor(s, exponent)
}

func (s *Service) preparePOLines(ctx context.Context, ws int64, rawLines []PurchaseOrderLineInput, exponent int) ([]preparedPOLine, int64, error) {
	if len(rawLines) == 0 || len(rawLines) > 100 {
		return nil, 0, errors.New("at least one purchase order line is required")
	}
	out := make([]preparedPOLine, 0, len(rawLines))
	var grandTotal int64
	for _, raw := range rawLines {
		qty, _, err := parseRequestQuantity(raw.Quantity)
		if err != nil {
			return nil, 0, err
		}
		desc := strings.TrimSpace(raw.Description)
		var prod pgtype.Int8
		if raw.ProductID != nil && *raw.ProductID > 0 {
			p, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{ID: *raw.ProductID, WorkspaceID: ws})
			if err != nil {
				return nil, 0, ErrForbiddenProduct
			}
			prod = pgtype.Int8{Int64: p.ID, Valid: true}
			if desc == "" {
				desc = p.Name
			}
		}
		if desc == "" || len(desc) > 240 {
			return nil, 0, errors.New("each purchase order line requires a description under 240 characters")
		}
		unitName := strings.TrimSpace(raw.UnitName)
		if unitName == "" {
			unitName = "each"
		}
		unitCost, err := ParseMajorToMinor(raw.ExpectedUnitCost, exponent)
		if err != nil || unitCost <= 0 {
			return nil, 0, errors.New("expected unit cost must be positive")
		}
		gross, err := requestLineTotal(unitCost, qty)
		if err != nil {
			return nil, 0, err
		}
		discountMinor, err := parseOptionalNonNegativeMajor(raw.Discount, exponent)
		if err != nil || discountMinor < 0 || discountMinor >= gross {
			return nil, 0, errors.New("line discount is invalid")
		}
		taxMinor, err := parseOptionalNonNegativeMajor(raw.TaxAmount, exponent)
		if err != nil || taxMinor < 0 {
			return nil, 0, errors.New("line tax amount is invalid")
		}
		lineTotal := gross - discountMinor + taxMinor
		if lineTotal <= 0 {
			return nil, 0, errors.New("line total must be positive")
		}
		grandTotal, err = CheckedAdd(grandTotal, lineTotal)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, preparedPOLine{
			id:                    raw.ID,
			productID:             prod,
			description:           desc,
			qty:                   qty,
			unitName:              unitName,
			expectedUnitCostMinor: unitCost,
			discountMinor:         discountMinor,
			taxAmountMinor:        taxMinor,
			lineTotalMinor:        lineTotal,
		})
	}
	return out, grandTotal, nil
}

func (s *Service) CreateDirectPurchaseOrder(ctx context.Context, ws, user int64, in CreatePurchaseOrderInput) (PurchaseOrderView, error) {
	if in.PurchaseRequestID > 0 {
		return s.CreatePurchaseOrderFromRequest(ctx, ws, user, in.PurchaseRequestID, in.IdempotencyKey)
	}
	key := strings.TrimSpace(in.IdempotencyKey)
	if key == "" || in.SupplierID <= 0 {
		return PurchaseOrderView{}, errors.New("supplier, lines and idempotency key are required for a direct purchase order")
	}
	if old, err := s.queries.GetPurchaseOrderByIdempotency(ctx, db.GetPurchaseOrderByIdempotencyParams{WorkspaceID: ws, IdempotencyKey: key}); err == nil {
		return purchaseOrderDetail(ctx, s.queries, old)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return PurchaseOrderView{}, err
	}
	party, err := s.GetCounterparty(ctx, ws, in.SupplierID)
	if err != nil || (party.PartyType != "supplier" && party.PartyType != "both") {
		return PurchaseOrderView{}, ErrForbiddenParty
	}
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	if len(currency) != 3 {
		return PurchaseOrderView{}, ErrInvalidCurrency
	}
	exponent := CurrencyExponent(currency)
	expectedDate, err := optionalDate(in.ExpectedDate)
	if err != nil {
		return PurchaseOrderView{}, errors.New("expected date must use YYYY-MM-DD")
	}
	var outletID pgtype.Int8
	if in.OutletID != nil && *in.OutletID > 0 {
		if _, err := inventoryLocationFor(ctx, s.queries, ws, *in.OutletID); err != nil {
			return PurchaseOrderView{}, err
		}
		outletID = pgtype.Int8{Int64: *in.OutletID, Valid: true}
	}
	lines, total, err := s.preparePOLines(ctx, ws, in.Lines, exponent)
	if err != nil {
		return PurchaseOrderView{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PurchaseOrderView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	po, err := q.CreateDirectPurchaseOrder(ctx, db.CreateDirectPurchaseOrderParams{
		WorkspaceID:      ws,
		SupplierID:       pgtype.Int8{Int64: party.ID, Valid: true},
		OutletID:         outletID,
		ExpectedDate:     expectedDate,
		PaymentTerms:     optionalPgText(in.PaymentTerms),
		Notes:            optionalPgText(in.Notes),
		Currency:         currency,
		CurrencyExponent: int32(exponent),
		TotalMinor:       total,
		IdempotencyKey:   key,
		CreatedByUserID:  user,
	})
	if err != nil {
		return PurchaseOrderView{}, err
	}
	for _, line := range lines {
		if _, err := q.CreatePurchaseOrderDirectLine(ctx, db.CreatePurchaseOrderDirectLineParams{
			WorkspaceID:           ws,
			PurchaseOrderID:       po.ID,
			ProductID:             line.productID,
			Description:           line.description,
			Quantity:              line.qty,
			UnitName:              line.unitName,
			ExpectedUnitCostMinor: line.expectedUnitCostMinor,
			DiscountMinor:         line.discountMinor,
			TaxAmountMinor:        line.taxAmountMinor,
			LineTotalMinor:        line.lineTotalMinor,
		}); err != nil {
			return PurchaseOrderView{}, err
		}
	}
	view, err := purchaseOrderDetail(ctx, q, po)
	if err != nil {
		return PurchaseOrderView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PurchaseOrderView{}, err
	}
	return view, nil
}

func (s *Service) UpdatePurchaseOrderDraft(ctx context.Context, ws, user, id int64, in UpdatePurchaseOrderDraftInput) (PurchaseOrderView, error) {
	if id <= 0 || in.ExpectedVersion <= 0 {
		return PurchaseOrderView{}, errors.New("purchase order and expected version are required")
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
	if po.Status != "draft" {
		return PurchaseOrderView{}, ErrInvalidPurchaseRequestState
	}
	if po.Version != in.ExpectedVersion {
		return PurchaseOrderView{}, ErrPurchaseRequestVersion
	}
	supplierID := po.SupplierID
	if in.SupplierID > 0 {
		party, err := s.GetCounterparty(ctx, ws, in.SupplierID)
		if err != nil || (party.PartyType != "supplier" && party.PartyType != "both") {
			return PurchaseOrderView{}, ErrForbiddenParty
		}
		supplierID = pgtype.Int8{Int64: party.ID, Valid: true}
	}
	currency := po.Currency
	if strings.TrimSpace(in.Currency) != "" {
		currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	}
	exponent := CurrencyExponent(currency)
	expectedDate := po.ExpectedDate
	if strings.TrimSpace(in.ExpectedDate) != "" {
		expectedDate, err = optionalDate(in.ExpectedDate)
		if err != nil {
			return PurchaseOrderView{}, errors.New("expected date must use YYYY-MM-DD")
		}
	}
	outletID := po.OutletID
	if in.OutletID != nil && *in.OutletID > 0 {
		if _, err := inventoryLocationFor(ctx, q, ws, *in.OutletID); err != nil {
			return PurchaseOrderView{}, err
		}
		outletID = pgtype.Int8{Int64: *in.OutletID, Valid: true}
	}
	lines, total, err := s.preparePOLines(ctx, ws, in.Lines, exponent)
	if err != nil {
		return PurchaseOrderView{}, err
	}
	if err := q.DeletePurchaseOrderLines(ctx, db.DeletePurchaseOrderLinesParams{WorkspaceID: ws, PurchaseOrderID: id}); err != nil {
		return PurchaseOrderView{}, err
	}
	for _, line := range lines {
		if _, err := q.CreatePurchaseOrderDirectLine(ctx, db.CreatePurchaseOrderDirectLineParams{
			WorkspaceID:           ws,
			PurchaseOrderID:       po.ID,
			ProductID:             line.productID,
			Description:           line.description,
			Quantity:              line.qty,
			UnitName:              line.unitName,
			ExpectedUnitCostMinor: line.expectedUnitCostMinor,
			DiscountMinor:         line.discountMinor,
			TaxAmountMinor:        line.taxAmountMinor,
			LineTotalMinor:        line.lineTotalMinor,
		}); err != nil {
			return PurchaseOrderView{}, err
		}
	}
	updated, err := q.UpdatePurchaseOrderDraft(ctx, db.UpdatePurchaseOrderDraftParams{
		WorkspaceID:      ws,
		ID:               id,
		Version:          in.ExpectedVersion,
		SupplierID:       supplierID,
		OutletID:         outletID,
		ExpectedDate:     expectedDate,
		PaymentTerms:     optionalPgText(in.PaymentTerms),
		Notes:            optionalPgText(in.Notes),
		Currency:         currency,
		CurrencyExponent: int32(exponent),
		TotalMinor:       total,
	})
	if err != nil {
		return PurchaseOrderView{}, err
	}
	view, err := purchaseOrderDetail(ctx, q, updated)
	if err != nil {
		return PurchaseOrderView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PurchaseOrderView{}, err
	}
	return view, nil
}

func (s *Service) DuplicatePurchaseOrder(ctx context.Context, ws, user, id int64, key string) (PurchaseOrderView, error) {
	key = strings.TrimSpace(key)
	if id <= 0 || key == "" {
		return PurchaseOrderView{}, errors.New("purchase order and idempotency key are required")
	}
	orig, err := s.GetPurchaseOrder(ctx, ws, id)
	if err != nil {
		return PurchaseOrderView{}, err
	}
	if orig.SupplierID == nil || *orig.SupplierID <= 0 {
		return PurchaseOrderView{}, errors.New("source purchase order has no supplier")
	}
	lines := make([]PurchaseOrderLineInput, 0, len(orig.Lines))
	for _, l := range orig.Lines {
		unitCostMajor := FormatMinorToMajorMust(l.ExpectedUnitCostMinor, int(orig.CurrencyExponent))
		discountMajor := FormatMinorToMajorMust(l.DiscountMinor, int(orig.CurrencyExponent))
		taxMajor := FormatMinorToMajorMust(l.TaxAmountMinor, int(orig.CurrencyExponent))
		lines = append(lines, PurchaseOrderLineInput{
			ProductID:        l.ProductID,
			Description:      l.Description,
			Quantity:         l.Quantity,
			UnitName:         l.UnitName,
			ExpectedUnitCost: unitCostMajor,
			Discount:         discountMajor,
			TaxAmount:        taxMajor,
		})
	}
	return s.CreateDirectPurchaseOrder(ctx, ws, user, CreatePurchaseOrderInput{
		SupplierID:     *orig.SupplierID,
		OutletID:       orig.OutletID,
		PaymentTerms:   nullableStringValue(orig.PaymentTerms),
		Notes:          nullableStringValue(orig.Notes),
		Currency:       orig.Currency,
		Lines:          lines,
		IdempotencyKey: key,
	})
}

func FormatMinorToMajorMust(minorStr string, exponent int) string {
	val, err := strconv.ParseInt(minorStr, 10, 64)
	if err != nil || val == 0 {
		return "0"
	}
	d := decimal.New(val, int32(-exponent))
	return d.String()
}

func (s *Service) RevisePurchaseOrder(ctx context.Context, ws, user, id int64, in RevisePurchaseOrderInput) (PurchaseOrderView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	reason := strings.TrimSpace(in.Reason)
	if id <= 0 || in.ExpectedVersion <= 0 || key == "" || len(reason) < 3 {
		return PurchaseOrderView{}, errors.New("purchase order, expected version, revision reason and idempotency key are required")
	}
	if previous, err := s.queries.GetPurchaseOrderCommand(ctx, db.GetPurchaseOrderCommandParams{WorkspaceID: ws, IdempotencyKey: key}); err == nil {
		if previous.PurchaseOrderID != id || previous.Command != "revise" || previous.ExpectedVersion != in.ExpectedVersion {
			return PurchaseOrderView{}, ErrDuplicateIdempotent
		}
		return s.GetPurchaseOrder(ctx, ws, id)
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
	if po.Version != in.ExpectedVersion {
		return PurchaseOrderView{}, ErrPurchaseRequestVersion
	}
	switch po.Status {
	case "draft", "submitted", "approved", "issued", "acknowledged", "partially_received":
	default:
		return PurchaseOrderView{}, ErrInvalidPurchaseRequestState
	}
	oldView, err := purchaseOrderDetail(ctx, q, po)
	if err != nil {
		return PurchaseOrderView{}, err
	}
	snapshotBytes, err := json.Marshal(oldView)
	if err != nil {
		return PurchaseOrderView{}, err
	}
	if _, err := q.CreatePurchaseOrderVersionSnapshot(ctx, db.CreatePurchaseOrderVersionSnapshotParams{
		WorkspaceID:     ws,
		PurchaseOrderID: id,
		Version:         po.Version,
		Snapshot:        snapshotBytes,
		ChangeReason:    optionalPgText(reason),
		ChangedByUserID: user,
	}); err != nil {
		return PurchaseOrderView{}, err
	}
	receivedRows, err := q.ListReceivedQuantityByPurchaseOrderLine(ctx, db.ListReceivedQuantityByPurchaseOrderLineParams{WorkspaceID: ws, PurchaseOrderID: pgtype.Int8{Int64: id, Valid: true}})
	if err != nil {
		return PurchaseOrderView{}, err
	}
	receivedByLine := map[int64]decimal.Decimal{}
	for _, r := range receivedRows {
		if r.PurchaseOrderLineID.Valid {
			receivedByLine[r.PurchaseOrderLineID.Int64] = r.ReceivedQuantity
		}
	}
	oldLines, err := q.GetPurchaseOrderLines(ctx, db.GetPurchaseOrderLinesParams{WorkspaceID: ws, PurchaseOrderID: id})
	if err != nil {
		return PurchaseOrderView{}, err
	}
	prepared, total, err := s.preparePOLines(ctx, ws, in.Lines, int(po.CurrencyExponent))
	if err != nil {
		return PurchaseOrderView{}, err
	}
	retainedIDs := map[int64]bool{}
	for idx, line := range prepared {
		targetID := line.id
		if targetID <= 0 && idx < len(oldLines) {
			targetID = oldLines[idx].ID
		}
		if targetID > 0 {
			if recQty, hasRec := receivedByLine[targetID]; hasRec && line.qty.LessThan(recQty) {
				return PurchaseOrderView{}, errors.New("cannot reduce quantity below already received quantity")
			}
			retainedIDs[targetID] = true
			if _, err := tx.Exec(ctx, `UPDATE purchase_order_lines SET product_id=$4, description=$5, quantity=$6, unit_name=$7, expected_unit_cost_minor=$8, discount_minor=$9, tax_amount_minor=$10, line_total_minor=$11 WHERE workspace_id=$1 AND purchase_order_id=$2 AND id=$3`,
				ws, id, targetID, line.productID, line.description, line.qty, line.unitName, line.expectedUnitCostMinor, line.discountMinor, line.taxAmountMinor, line.lineTotalMinor); err != nil {
				return PurchaseOrderView{}, err
			}
		} else {
			if _, err := q.CreatePurchaseOrderDirectLine(ctx, db.CreatePurchaseOrderDirectLineParams{
				WorkspaceID:           ws,
				PurchaseOrderID:       po.ID,
				ProductID:             line.productID,
				Description:           line.description,
				Quantity:              line.qty,
				UnitName:              line.unitName,
				ExpectedUnitCostMinor: line.expectedUnitCostMinor,
				DiscountMinor:         line.discountMinor,
				TaxAmountMinor:        line.taxAmountMinor,
				LineTotalMinor:        line.lineTotalMinor,
			}); err != nil {
				return PurchaseOrderView{}, err
			}
		}
	}
	for _, oldLine := range oldLines {
		if !retainedIDs[oldLine.ID] {
			if recQty, hasRec := receivedByLine[oldLine.ID]; hasRec && recQty.GreaterThan(decimal.Zero) {
				return PurchaseOrderView{}, errors.New("cannot remove a purchase order line that has already received goods")
			}
			if _, err := tx.Exec(ctx, `DELETE FROM purchase_order_lines WHERE workspace_id=$1 AND purchase_order_id=$2 AND id=$3`, ws, id, oldLine.ID); err != nil {
				return PurchaseOrderView{}, err
			}
		}
	}
	expectedDate := po.ExpectedDate
	if strings.TrimSpace(in.ExpectedDate) != "" {
		expectedDate, err = optionalDate(in.ExpectedDate)
		if err != nil {
			return PurchaseOrderView{}, errors.New("expected date must use YYYY-MM-DD")
		}
	}
	paymentTerms := po.PaymentTerms
	if strings.TrimSpace(in.PaymentTerms) != "" {
		paymentTerms = optionalPgText(in.PaymentTerms)
	}
	notes := po.Notes
	if strings.TrimSpace(in.Notes) != "" {
		notes = optionalPgText(in.Notes)
	}
	updated, err := q.UpdatePurchaseOrderDraft(ctx, db.UpdatePurchaseOrderDraftParams{
		WorkspaceID:      ws,
		ID:               id,
		Version:          in.ExpectedVersion,
		SupplierID:       po.SupplierID,
		OutletID:         po.OutletID,
		ExpectedDate:     expectedDate,
		PaymentTerms:     paymentTerms,
		Notes:            notes,
		Currency:         po.Currency,
		CurrencyExponent: po.CurrencyExponent,
		TotalMinor:       total,
	})
	if err != nil {
		return PurchaseOrderView{}, err
	}
	if err := q.CreatePurchaseOrderCommand(ctx, db.CreatePurchaseOrderCommandParams{
		WorkspaceID: ws, PurchaseOrderID: id, Command: "revise", ExpectedVersion: in.ExpectedVersion, IdempotencyKey: key, ActorUserID: user,
	}); err != nil {
		return PurchaseOrderView{}, err
	}
	if _, err := q.CreatePurchaseOrderEvent(ctx, db.CreatePurchaseOrderEventParams{
		WorkspaceID: ws, PurchaseOrderID: id, EventType: "revised", OrderVersion: po.Version, Note: optionalPgText(reason), ActorUserID: user,
	}); err != nil {
		return PurchaseOrderView{}, err
	}
	view, err := purchaseOrderDetail(ctx, q, updated)
	if err != nil {
		return PurchaseOrderView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PurchaseOrderView{}, err
	}
	return view, nil
}

func (s *Service) ListPurchaseOrderVersions(ctx context.Context, ws, id int64) ([]PurchaseOrderVersionView, error) {
	if _, err := s.queries.GetPurchaseOrderByID(ctx, db.GetPurchaseOrderByIDParams{WorkspaceID: ws, ID: id}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	rows, err := s.queries.ListPurchaseOrderVersions(ctx, db.ListPurchaseOrderVersionsParams{WorkspaceID: ws, PurchaseOrderID: id})
	if err != nil {
		return nil, err
	}
	out := make([]PurchaseOrderVersionView, 0, len(rows))
	for _, v := range rows {
		out = append(out, PurchaseOrderVersionView{
			ID:              v.ID,
			Version:         v.Version,
			Snapshot:        json.RawMessage(v.Snapshot),
			ChangeReason:    nullableText(v.ChangeReason),
			ChangedByUserID: v.ChangedByUserID,
			CreatedAt:       v.CreatedAt.Time.UTC().Format(time.RFC3339),
		})
	}
	return out, nil
}
