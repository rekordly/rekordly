package finance

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
)

type MerchantOrderLineView struct {
	ID                int64   `json:"id"`
	ProductID         int64   `json:"product_id"`
	VariantID         *int64  `json:"variant_id,omitempty"`
	ProductKind       string  `json:"product_kind"`
	Title             string  `json:"title"`
	VariantName       *string `json:"variant_name,omitempty"`
	UnitName          string  `json:"unit_name"`
	RequestedQuantity string  `json:"requested_quantity"`
	ConfirmedQuantity string  `json:"confirmed_quantity"`
	FulfilledQuantity string  `json:"fulfilled_quantity"`
	UnitPriceMinor    string  `json:"unit_price_minor"`
	LineTotalMinor    string  `json:"line_total_minor"`
	AvailableQuantity string  `json:"available_quantity"`
	ReservationID     *int64  `json:"reservation_id,omitempty"`
}

type MerchantOrderCustomerMatch struct {
	ID    int64   `json:"id"`
	Name  string  `json:"name"`
	Phone *string `json:"phone,omitempty"`
	Email *string `json:"email,omitempty"`
}

type MerchantOrderView struct {
	ID                    int64                        `json:"id"`
	OrderReference        string                       `json:"order_reference"`
	CustomerID            *int64                       `json:"customer_id,omitempty"`
	OutletID              *int64                       `json:"outlet_id,omitempty"`
	CommercialStatus      string                       `json:"commercial_status"`
	FulfilmentStatus      string                       `json:"fulfilment_status"`
	PaymentStatus         string                       `json:"payment_status"`
	Version               int32                        `json:"version"`
	Currency              string                       `json:"currency"`
	CurrencyExponent      int32                        `json:"currency_exponent"`
	SubtotalMinor         string                       `json:"subtotal_minor"`
	DeliveryFeeMinor      string                       `json:"delivery_fee_minor"`
	ProcessingFeeMinor    string                       `json:"processing_fee_minor"`
	TotalMinor            string                       `json:"total_minor"`
	DeliveryMethod        string                       `json:"delivery_method"`
	CustomerName          string                       `json:"customer_name"`
	CustomerPhone         *string                      `json:"customer_phone,omitempty"`
	CustomerEmail         *string                      `json:"customer_email,omitempty"`
	OrganizationName      *string                      `json:"organization_name,omitempty"`
	DeliveryAddress       *string                      `json:"delivery_address,omitempty"`
	CustomerNote          *string                      `json:"customer_note,omitempty"`
	PaymentArrangement    *string                      `json:"payment_arrangement,omitempty"`
	LinkedInvoiceID       *int64                       `json:"linked_invoice_id,omitempty"`
	LinkedSaleID          *int64                       `json:"linked_sale_id,omitempty"`
	DeclineOrCancelReason *string                      `json:"decline_or_cancel_reason,omitempty"`
	HoldType              *string                      `json:"hold_type,omitempty"`
	ReservationExpiresAt  *string                      `json:"reservation_expires_at,omitempty"`
	PickupCode            *string                      `json:"pickup_code,omitempty"`
	PickupPointID         *int64                       `json:"pickup_point_id,omitempty"`
	CourierName           *string                      `json:"courier_name,omitempty"`
	CourierTrackingNumber *string                      `json:"courier_tracking_number,omitempty"`
	CourierStatus           *string                      `json:"courier_status,omitempty"`
	CourierBookingError     *string                      `json:"courier_booking_error,omitempty"`
	CourierTrackingURL      *string                      `json:"courier_tracking_url,omitempty"`
	PaymentAttentionReason  *string                      `json:"payment_attention_reason,omitempty"`
	PaymentAttentionMessage *string                      `json:"payment_attention_message,omitempty"`
	CreatedAt               string                       `json:"created_at"`
	Lines                   []MerchantOrderLineView      `json:"lines,omitempty"`
	Events                  []PublicOrderEventView       `json:"events,omitempty"`
	SuggestedCustomers      []MerchantOrderCustomerMatch `json:"suggested_customers,omitempty"`
}

func merchantOrderHeader(o db.StorefrontOrder) MerchantOrderView {
	var holdExp *string
	if o.ReservationExpiresAt.Valid {
		s := o.ReservationExpiresAt.Time.UTC().Format(time.RFC3339)
		holdExp = &s
	}
	return MerchantOrderView{
		ID:                      o.ID,
		OrderReference:          o.OrderReference,
		CustomerID:              nullableInt8(o.CustomerID),
		OutletID:                nullableInt8(o.OutletID),
		CommercialStatus:        o.CommercialStatus,
		FulfilmentStatus:        o.FulfilmentStatus,
		PaymentStatus:           o.PaymentStatus,
		Version:                 o.Version,
		Currency:                o.Currency,
		CurrencyExponent:        o.CurrencyExponent,
		SubtotalMinor:           fmt.Sprint(o.SubtotalMinor),
		DeliveryFeeMinor:        fmt.Sprint(o.DeliveryFeeMinor),
		ProcessingFeeMinor:      fmt.Sprint(o.ProcessingFeeMinor),
		TotalMinor:              fmt.Sprint(o.TotalMinor),
		DeliveryMethod:          o.DeliveryMethod,
		CustomerName:            o.CustomerName,
		CustomerPhone:           nullableText(o.CustomerPhone),
		CustomerEmail:           nullableText(o.CustomerEmail),
		OrganizationName:        nullableText(o.OrganizationName),
		DeliveryAddress:         nullableText(o.DeliveryAddress),
		CustomerNote:            nullableText(o.CustomerNote),
		PaymentArrangement:      nullableText(o.PaymentArrangement),
		LinkedInvoiceID:         nullableInt8(o.LinkedInvoiceID),
		DeclineOrCancelReason:   nullableText(o.DeclineOrCancelReason),
		HoldType:                nullableText(o.HoldType),
		ReservationExpiresAt:    holdExp,
		PickupCode:              nullableText(o.PickupCode),
		PickupPointID:           nullableInt8(o.PickupPointID),
		CourierName:             nullableText(o.CourierName),
		CourierTrackingNumber:   nullableText(o.CourierTrackingNumber),
		CourierStatus:           nullableText(o.CourierStatus),
		CourierBookingError:     nullableText(o.CourierBookingError),
		CourierTrackingURL:      nullableText(o.CourierTrackingUrl),
		PaymentAttentionReason:  nullableText(o.PaymentAttentionReason),
		PaymentAttentionMessage: nullableText(o.PaymentAttentionMessage),
		CreatedAt:               o.CreatedAt.Time.UTC().Format(time.RFC3339),
	}
}

func (s *Service) buildMerchantOrderDetail(ctx context.Context, o db.StorefrontOrder) (MerchantOrderView, error) {
	v := merchantOrderHeader(o)
	if saleID, err := s.queries.GetStorefrontOrderSaleID(ctx, db.GetStorefrontOrderSaleIDParams{WorkspaceID: o.WorkspaceID, StorefrontOrderID: pgtype.Int8{Int64: o.ID, Valid: true}}); err == nil {
		v.LinkedSaleID = &saleID
	}
	lines, err := s.queries.ListStorefrontOrderLines(ctx, o.ID)
	if err != nil {
		return MerchantOrderView{}, err
	}
	v.Lines = make([]MerchantOrderLineView, 0, len(lines))
	for _, l := range lines {
		var avail decimal.Decimal
		if o.OutletID.Valid && l.VariantID.Valid {
			_ = s.pool.QueryRow(ctx, `SELECT COALESCE((quantity_on_hand - reserved_quantity), 0) FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3 AND variant_id=$4`, o.WorkspaceID, o.OutletID.Int64, l.ProductID, l.VariantID.Int64).Scan(&avail)
		} else if o.OutletID.Valid {
			_ = s.pool.QueryRow(ctx, `SELECT COALESCE(sum(quantity_on_hand - reserved_quantity), 0) FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3`, o.WorkspaceID, o.OutletID.Int64, l.ProductID).Scan(&avail)
		} else {
			_ = s.pool.QueryRow(ctx, `SELECT COALESCE(sum(quantity_on_hand - reserved_quantity), 0) FROM inventory_balances WHERE workspace_id=$1 AND product_id=$2`, o.WorkspaceID, l.ProductID).Scan(&avail)
		}
		v.Lines = append(v.Lines, MerchantOrderLineView{
			ID:                l.ID,
			ProductID:         l.ProductID,
			VariantID:         nullableInt8(l.VariantID),
			ProductKind:       l.ProductKind,
			Title:             l.TitleSnapshot,
			VariantName:       nullableText(l.VariantSnapshot),
			UnitName:          l.UnitName,
			RequestedQuantity: l.RequestedQuantity.String(),
			ConfirmedQuantity: l.ConfirmedQuantity.String(),
			FulfilledQuantity: l.FulfilledQuantity.String(),
			UnitPriceMinor:    fmt.Sprint(l.UnitPriceMinor),
			LineTotalMinor:    fmt.Sprint(l.LineTotalMinor),
			AvailableQuantity: avail.StringFixed(4),
			ReservationID:     nullableInt8(l.ReservationID),
		})
	}
	events, err := s.queries.ListStorefrontOrderEvents(ctx, db.ListStorefrontOrderEventsParams{OrderID: o.ID, Column2: false})
	if err == nil {
		v.Events = make([]PublicOrderEventView, 0, len(events))
		for _, e := range events {
			v.Events = append(v.Events, PublicOrderEventView{
				EventType: e.EventType,
				ActorType: e.ActorType,
				Message:   nullableText(e.Message),
				CreatedAt: e.CreatedAt.Time.UTC().Format(time.RFC3339),
			})
		}
	}
	rows, qErr := s.pool.Query(ctx, `
		SELECT id, name, phone, email
		FROM counterparties
		WHERE workspace_id=$1 AND party_type IN ('customer','both')
		  AND (
		    ($2 <> '' AND lower(btrim(email)) = lower(btrim($2))) OR
		    ($3 <> '' AND btrim(phone) = btrim($3)) OR
		    lower(btrim(name)) = lower(btrim($4))
		  )
		LIMIT 5
	`, o.WorkspaceID, o.CustomerEmail.String, o.CustomerPhone.String, o.CustomerName)
	if qErr == nil {
		defer rows.Close()
		for rows.Next() {
			var m MerchantOrderCustomerMatch
			var ph, em pgtype.Text
			if rows.Scan(&m.ID, &m.Name, &ph, &em) == nil {
				m.Phone = nullableText(ph)
				m.Email = nullableText(em)
				v.SuggestedCustomers = append(v.SuggestedCustomers, m)
			}
		}
	}
	return v, nil
}

func (s *Service) ListMerchantOrders(ctx context.Context, ws int64, status string, outletID int64) ([]MerchantOrderView, error) {
	var stParam pgtype.Text
	if st := strings.TrimSpace(status); st != "" {
		stParam = pgtype.Text{String: st, Valid: true}
	}
	var outParam pgtype.Int8
	if outletID > 0 {
		outParam = pgtype.Int8{Int64: outletID, Valid: true}
	}
	rows, err := s.queries.ListStorefrontOrders(ctx, db.ListStorefrontOrdersParams{
		WorkspaceID:      ws,
		Limit:            100,
		CommercialStatus: stParam,
		OutletID:         outParam,
	})
	if err != nil {
		return nil, err
	}
	out := make([]MerchantOrderView, 0, len(rows))
	for _, r := range rows {
		out = append(out, merchantOrderHeader(r))
	}
	return out, nil
}

func (s *Service) GetMerchantOrder(ctx context.Context, ws, orderID int64) (MerchantOrderView, error) {
	o, err := s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: ws, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	return s.buildMerchantOrderDetail(ctx, o)
}

type OrderLineRevisionInput struct {
	OrderLineID int64  `json:"order_line_id"`
	Quantity    string `json:"quantity"`
	UnitPrice   string `json:"unit_price"`
}

type RequestOrderChangeInput struct {
	ExpectedVersion    int32                    `json:"expected_version"`
	DeliveryFee        string                   `json:"delivery_fee"`
	DeliveryMethod     string                   `json:"delivery_method"`
	PaymentArrangement string                   `json:"payment_arrangement"`
	ChangeSummary      string                   `json:"change_summary"`
	RequiresAck        bool                     `json:"requires_customer_ack"`
	Lines              []OrderLineRevisionInput `json:"lines"`
}

func (s *Service) RequestOrderChange(ctx context.Context, ws, user, orderID int64, in RequestOrderChangeInput) (MerchantOrderView, error) {
	summary := sanitizePublicText(in.ChangeSummary, 500)
	if in.ExpectedVersion < 1 || summary == "" {
		return MerchantOrderView{}, errors.New("expected_version and change_summary are required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MerchantOrderView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	o, err := q.GetStorefrontOrderForUpdate(ctx, db.GetStorefrontOrderForUpdateParams{WorkspaceID: ws, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if o.Version != in.ExpectedVersion {
		return MerchantOrderView{}, ErrOrderVersionConflict
	}
	switch o.CommercialStatus {
	case "request_received", "needs_review", "quote_changes_requested":
	default:
		return MerchantOrderView{}, ErrOrderAlreadyHandled
	}

	curLines, err := q.ListStorefrontOrderLines(ctx, o.ID)
	if err != nil {
		return MerchantOrderView{}, err
	}
	revByID := map[int64]OrderLineRevisionInput{}
	for _, rl := range in.Lines {
		revByID[rl.OrderLineID] = rl
	}

	var subtotal int64
	updatedLines := make([]db.StorefrontOrderLine, 0, len(curLines))
	for _, cl := range curLines {
		qty := cl.ConfirmedQuantity
		uPrice := cl.UnitPriceMinor
		if rev, ok := revByID[cl.ID]; ok {
			if strings.TrimSpace(rev.Quantity) != "" {
				qParsed, _, qErr := parseRequestQuantity(rev.Quantity)
				if qErr != nil {
					return MerchantOrderView{}, qErr
				}
				qty = qParsed
			}
			if strings.TrimSpace(rev.UnitPrice) != "" {
				pParsed, pErr := parseOptionalNonNegativeMajor(rev.UnitPrice, int(o.CurrencyExponent))
				if pErr != nil || pParsed < 0 {
					return MerchantOrderView{}, errors.New("revised unit price is invalid")
				}
				uPrice = pParsed
			}
		}
		lineTotal := int64(0)
		if uPrice > 0 {
			lineTotal, err = requestLineTotal(uPrice, qty)
			if err != nil {
				return MerchantOrderView{}, err
			}
		}
		subtotal += lineTotal
		ul, err := q.UpdateStorefrontOrderLineReservation(ctx, db.UpdateStorefrontOrderLineReservationParams{
			ID:                cl.ID,
			ReservationID:     cl.ReservationID,
			ConfirmedQuantity: qty,
			UnitPriceMinor:    uPrice,
			LineTotalMinor:    lineTotal,
		})
		if err != nil {
			return MerchantOrderView{}, err
		}
		updatedLines = append(updatedLines, ul)
	}

	delivFee := o.DeliveryFeeMinor
	if strings.TrimSpace(in.DeliveryFee) != "" {
		delivFee, err = parseOptionalNonNegativeMajor(in.DeliveryFee, int(o.CurrencyExponent))
		if err != nil || delivFee < 0 {
			return MerchantOrderView{}, errors.New("revised delivery fee is invalid")
		}
	}
	delivMethod := o.DeliveryMethod
	if strings.TrimSpace(in.DeliveryMethod) != "" {
		m := strings.TrimSpace(in.DeliveryMethod)
		if m != "pickup" && m != "merchant_delivery" && m != "customer_arranged" {
			return MerchantOrderView{}, errors.New("invalid delivery method")
		}
		delivMethod = m
	}
	total := subtotal + delivFee
	nextStatus := "needs_review"
	if in.RequiresAck {
		nextStatus = "quote_changes_requested"
	}
	newVersion := o.Version + 1
	payArr := o.PaymentArrangement
	if strings.TrimSpace(in.PaymentArrangement) != "" {
		payArr = optionalPgText(sanitizePublicText(in.PaymentArrangement, 300))
	}

	if _, err := q.UpdateStorefrontOrderRevision(ctx, db.UpdateStorefrontOrderRevisionParams{
		WorkspaceID:        ws,
		ID:                 o.ID,
		CommercialStatus:   nextStatus,
		Version:            newVersion,
		SubtotalMinor:      subtotal,
		DeliveryFeeMinor:   delivFee,
		TotalMinor:         total,
		DeliveryMethod:     delivMethod,
		PaymentArrangement: payArr,
	}); err != nil {
		return MerchantOrderView{}, err
	}
	snapBytes, _ := json.Marshal(map[string]any{"total_minor": total, "lines": updatedLines})
	if _, err := q.CreateStorefrontOrderVersion(ctx, db.CreateStorefrontOrderVersionParams{
		WorkspaceID:         ws,
		OrderID:             o.ID,
		Version:             newVersion,
		Snapshot:            snapBytes,
		ChangeSummary:       pgtype.Text{String: summary, Valid: true},
		RequiresCustomerAck: in.RequiresAck,
		ActorType:           "merchant",
		ActorUserID:         pgtype.Int8{Int64: user, Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     ws,
		OrderID:         o.ID,
		EventType:       "merchant_change_requested",
		ActorType:       "merchant",
		ActorUserID:     pgtype.Int8{Int64: user, Valid: true},
		CustomerVisible: true,
		Message:         pgtype.Text{String: summary, Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}
	updated, err := q.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: ws, ID: o.ID})
	if err != nil {
		return MerchantOrderView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return MerchantOrderView{}, err
	}
	s.notifyStorefrontWorkspace(ctx, ws, fmt.Sprintf("Order %s revision sent", o.OrderReference), "Proposed changes were sent to the customer")
	return s.buildMerchantOrderDetail(ctx, updated)
}

type ConfirmOrderInput struct {
	ExpectedVersion    int32  `json:"expected_version"`
	OutletID           int64  `json:"outlet_id"`
	DeliveryFee        string `json:"delivery_fee"`
	PaymentArrangement string `json:"payment_arrangement"`
	Note               string `json:"note"`
	IdempotencyKey     string `json:"idempotency_key"`
}

func (s *Service) PackStorefrontOrder(ctx context.Context, ws, user, orderID int64, expectedVersion int32) (MerchantOrderView, error) {
	if expectedVersion < 1 {
		return MerchantOrderView{}, errors.New("expected_version is required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MerchantOrderView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	_, err = q.MarkStorefrontOrderPacked(ctx, db.MarkStorefrontOrderPackedParams{WorkspaceID: ws, ID: orderID, Version: expectedVersion})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrOrderVersionConflict
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if _, err = q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID: ws, OrderID: orderID, EventType: "order_packed", ActorType: "merchant",
		ActorUserID: pgtype.Int8{Int64: user, Valid: user > 0}, CustomerVisible: true,
		Message: pgtype.Text{String: "Your order has been packed and is ready for delivery.", Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}
	order, err := q.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: ws, ID: orderID})
	if err != nil {
		return MerchantOrderView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return MerchantOrderView{}, err
	}
	return s.buildMerchantOrderDetail(ctx, order)
}

func (s *Service) ReadyForPickupStorefrontOrder(ctx context.Context, ws, user, orderID int64, expectedVersion int32) (MerchantOrderView, error) {
	if expectedVersion < 1 {
		return MerchantOrderView{}, errors.New("expected_version is required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MerchantOrderView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	existing, err := q.GetStorefrontOrderForUpdate(ctx, db.GetStorefrontOrderForUpdateParams{WorkspaceID: ws, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if existing.DeliveryMethod != "pickup" {
		return MerchantOrderView{}, errors.New("only pickup orders can be marked ready for pickup")
	}
	if existing.Version != expectedVersion {
		return MerchantOrderView{}, ErrOrderVersionConflict
	}
	updated, err := q.UpdateStorefrontOrderPackedReady(ctx, db.UpdateStorefrontOrderPackedReadyParams{
		WorkspaceID: ws,
		ID:          orderID,
		Version:     expectedVersion,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, errors.New("order is not in a state to be marked ready for pickup")
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	msg := "Your order is packed and ready for pickup."
	if existing.PickupCode.Valid && existing.PickupCode.String != "" {
		msg = fmt.Sprintf("Your order is packed and ready for pickup. Show pickup code %s when collecting.", existing.PickupCode.String)
	}
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     ws,
		OrderID:         orderID,
		EventType:       "ready_for_pickup",
		ActorType:       "merchant",
		ActorUserID:     pgtype.Int8{Int64: user, Valid: user > 0},
		CustomerVisible: true,
		Message:         pgtype.Text{String: msg, Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return MerchantOrderView{}, err
	}
	return s.buildMerchantOrderDetail(ctx, updated)
}

type CollectStorefrontOrderInput struct {
	ExpectedVersion int32  `json:"expected_version"`
	PickupCode      string `json:"pickup_code"`
	MoneyAccountID  int64  `json:"money_account_id"`
}

func (s *Service) CollectStorefrontOrder(ctx context.Context, ws, user, orderID int64, in CollectStorefrontOrderInput) (MerchantOrderView, error) {
	if in.ExpectedVersion < 1 {
		return MerchantOrderView{}, errors.New("expected_version is required")
	}
	order, err := s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: ws, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if order.DeliveryMethod != "pickup" {
		return MerchantOrderView{}, errors.New("only pickup orders can be collected with a pickup code")
	}
	if order.Version != in.ExpectedVersion {
		return MerchantOrderView{}, ErrOrderVersionConflict
	}
	entered := strings.ToUpper(strings.TrimSpace(in.PickupCode))
	expected := strings.ToUpper(strings.TrimSpace(order.PickupCode.String))
	if expected == "" || entered == "" || entered != expected {
		return MerchantOrderView{}, errors.New("invalid pickup code")
	}
	if order.PaymentStatus != "paid" {
		if in.MoneyAccountID <= 0 {
			return MerchantOrderView{}, errors.New("select a cash or POS account to record payment on collection")
		}
		if err := s.MarkStorefrontOrderPaidManual(ctx, ws, orderID, in.MoneyAccountID, "Collected at pickup with code"); err != nil {
			return MerchantOrderView{}, err
		}
	}
	refreshed, err := s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: ws, ID: orderID})
	if err != nil {
		return MerchantOrderView{}, err
	}
	view, err := s.FulfilStorefrontOrder(ctx, ws, user, orderID, FulfilStorefrontOrderInput{
		ExpectedVersion: refreshed.Version,
		RecipientName:   order.CustomerName,
		TrackingNote:    "Collected at pickup with code " + expected,
	})
	if err != nil {
		return MerchantOrderView{}, err
	}
	if _, err := s.queries.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     ws,
		OrderID:         orderID,
		EventType:       "order_collected",
		ActorType:       "merchant",
		ActorUserID:     pgtype.Int8{Int64: user, Valid: user > 0},
		CustomerVisible: true,
		Message:         optionalPgText("Order handed over and collected at pickup."),
	}); err != nil {
		return MerchantOrderView{}, err
	}
	return s.GetMerchantOrder(ctx, ws, view.ID)
}

func (s *Service) ConfirmStorefrontOrder(ctx context.Context, ws, user, orderID int64, in ConfirmOrderInput) (MerchantOrderView, error) {
	if in.ExpectedVersion < 1 {
		return MerchantOrderView{}, errors.New("expected_version is required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MerchantOrderView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	o, err := q.GetStorefrontOrderForUpdate(ctx, db.GetStorefrontOrderForUpdateParams{WorkspaceID: ws, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if o.CommercialStatus == "confirmed" && o.FulfilmentStatus == "reserved" {
		return s.buildMerchantOrderDetail(ctx, o)
	}
	if o.Version != in.ExpectedVersion {
		return MerchantOrderView{}, ErrOrderVersionConflict
	}
	switch o.CommercialStatus {
	case "request_received", "needs_review":
	case "quote_changes_requested":
		return MerchantOrderView{}, errors.New("awaiting customer acknowledgement of revised terms")
	default:
		return MerchantOrderView{}, ErrOrderAlreadyHandled
	}

	if !o.CustomerID.Valid {
		if err := linkMatchingOrderCustomer(ctx, tx, ws, o.ID, o.CustomerEmail.String, o.CustomerPhone.String); err != nil {
			return MerchantOrderView{}, err
		}
	}

	targetOutletID := in.OutletID
	if targetOutletID <= 0 && o.OutletID.Valid {
		targetOutletID = o.OutletID.Int64
	}
	loc, err := inventoryLocationFor(ctx, q, ws, targetOutletID)
	if err != nil {
		return MerchantOrderView{}, err
	}

	lines, err := q.ListStorefrontOrderLines(ctx, o.ID)
	if err != nil {
		return MerchantOrderView{}, err
	}
	// Deterministic lock order on (product_id, variant_id) to prevent deadlocks
	sort.Slice(lines, func(i, j int) bool {
		if lines[i].ProductID != lines[j].ProductID {
			return lines[i].ProductID < lines[j].ProductID
		}
		return lines[i].VariantID.Int64 < lines[j].VariantID.Int64
	})

	sf, err := q.GetStorefrontByWorkspace(ctx, ws)
	if err != nil {
		return MerchantOrderView{}, err
	}

	hadCheckoutHold := o.HoldType.Valid && o.HoldType.String == "awaiting_confirmation"
	var expiresAt pgtype.Timestamptz
	if !hadCheckoutHold && sf.ReservationTtlHours > 0 {
		expiresAt = pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Duration(sf.ReservationTtlHours) * time.Hour), Valid: true}
	}

	for _, l := range lines {
		if l.ProductKind != "stock_tracked" || l.ConfirmedQuantity.IsZero() {
			continue
		}
		if l.ReservationID.Valid {
			existingRes, rErr := q.GetStockReservationForUpdate(ctx, db.GetStockReservationForUpdateParams{
				WorkspaceID: ws,
				ID:          l.ReservationID.Int64,
			})
			if rErr == nil && existingRes.Status == "active" {
				if existingRes.LocationID == loc.ID {
					// C13 & C14: Checkout already holds this line at the target outlet.
					// Make the existing hold firm instead of reserving again!
					hadCheckoutHold = true
					continue
				}
				// Outlet was changed on confirm: release the old outlet's reservation first.
				oldBal, obErr := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
					WorkspaceID: ws,
					LocationID:  existingRes.LocationID,
					ProductID:   existingRes.ProductID,
					VariantID:   existingRes.VariantID,
				})
				if obErr != nil && !errors.Is(obErr, pgx.ErrNoRows) {
					return MerchantOrderView{}, obErr
				}
				if obErr == nil {
					newOldRes := oldBal.ReservedQuantity.Sub(existingRes.Quantity)
					if newOldRes.IsNegative() {
						newOldRes = decimal.Zero
					}
					if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
						WorkspaceID:       ws,
						LocationID:        existingRes.LocationID,
						ProductID:         existingRes.ProductID,
						VariantID:         existingRes.VariantID,
						QuantityOnHand:    oldBal.QuantityOnHand,
						ReservedQuantity:  newOldRes,
						InTransitQuantity: oldBal.InTransitQuantity,
						ValueOnHandMinor:  oldBal.ValueOnHandMinor,
					}); err != nil {
						return MerchantOrderView{}, err
					}
				}
				if _, err := q.UpdateStockReservationStatus(ctx, db.UpdateStockReservationStatusParams{
					WorkspaceID: ws,
					ID:          existingRes.ID,
					Status:      "released",
				}); err != nil {
					return MerchantOrderView{}, err
				}
			}
		}

		// C14: Pass VariantID when locking and updating inventory_balances!
		bal, bErr := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
			WorkspaceID: ws,
			LocationID:  loc.ID,
			ProductID:   l.ProductID,
			VariantID:   l.VariantID,
		})
		if errors.Is(bErr, pgx.ErrNoRows) {
			return MerchantOrderView{}, fmt.Errorf("%w: no stock available for %s at %s", ErrInsufficientStock, l.TitleSnapshot, loc.Name)
		}
		if bErr != nil {
			return MerchantOrderView{}, bErr
		}
		avail := bal.QuantityOnHand.Sub(bal.ReservedQuantity)
		if avail.LessThan(l.ConfirmedQuantity) {
			return MerchantOrderView{}, fmt.Errorf("%w: %s has %s available, %s requested", ErrInsufficientStock, l.TitleSnapshot, avail.StringFixed(2), l.ConfirmedQuantity.StringFixed(2))
		}
		newReserved := bal.ReservedQuantity.Add(l.ConfirmedQuantity)
		if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
			WorkspaceID:       ws,
			LocationID:        loc.ID,
			ProductID:         l.ProductID,
			VariantID:         l.VariantID,
			QuantityOnHand:    bal.QuantityOnHand,
			ReservedQuantity:  newReserved,
			InTransitQuantity: bal.InTransitQuantity,
			ValueOnHandMinor:  bal.ValueOnHandMinor,
		}); err != nil {
			return MerchantOrderView{}, err
		}
		res, err := q.CreateStockReservation(ctx, db.CreateStockReservationParams{
			WorkspaceID:    ws,
			LocationID:     loc.ID,
			ProductID:      l.ProductID,
			VariantID:      l.VariantID,
			OrderID:        pgtype.Int8{Int64: o.ID, Valid: true},
			Quantity:       l.ConfirmedQuantity,
			Status:         "active",
			ExpiresAt:      expiresAt,
			Notes:          pgtype.Text{String: "Reserved for storefront order " + o.OrderReference, Valid: true},
			IdempotencyKey: pgtype.Text{String: fmt.Sprintf("sf-order-%d-line-%d", o.ID, l.ID), Valid: true},
		})
		if err != nil {
			return MerchantOrderView{}, err
		}
		if _, err := q.UpdateStorefrontOrderLineReservation(ctx, db.UpdateStorefrontOrderLineReservationParams{
			ID:                l.ID,
			ReservationID:     pgtype.Int8{Int64: res.ID, Valid: true},
			ConfirmedQuantity: l.ConfirmedQuantity,
			UnitPriceMinor:    l.UnitPriceMinor,
			LineTotalMinor:    l.LineTotalMinor,
		}); err != nil {
			return MerchantOrderView{}, err
		}
	}

	if hadCheckoutHold {
		expiresAt = pgtype.Timestamptz{Valid: false}
		if err := q.MakeOrderReservationsFirm(ctx, db.MakeOrderReservationsFirmParams{
			WorkspaceID: ws,
			OrderID:     pgtype.Int8{Int64: o.ID, Valid: true},
		}); err != nil {
			return MerchantOrderView{}, err
		}
	}

	delivFee := o.DeliveryFeeMinor
	if strings.TrimSpace(in.DeliveryFee) != "" {
		delivFee, err = parseOptionalNonNegativeMajor(in.DeliveryFee, int(o.CurrencyExponent))
		if err != nil || delivFee < 0 {
			return MerchantOrderView{}, errors.New("delivery fee is invalid")
		}
	}
	total := o.SubtotalMinor + delivFee + o.ProcessingFeeMinor
	payArr := o.PaymentArrangement
	if strings.TrimSpace(in.PaymentArrangement) != "" {
		payArr = optionalPgText(sanitizePublicText(in.PaymentArrangement, 300))
	}
	payStatus := o.PaymentStatus
	if payStatus == "" || payStatus == "not_requested" {
		payStatus = "not_requested"
		if total > 0 && payArr.Valid && strings.TrimSpace(payArr.String) != "" {
			payStatus = "unpaid"
		}
	}

	updated, err := q.ConfirmStorefrontOrderRecord(ctx, db.ConfirmStorefrontOrderRecordParams{
		WorkspaceID:          ws,
		ID:                   o.ID,
		OutletID:             pgtype.Int8{Int64: loc.ID, Valid: true},
		PaymentStatus:        payStatus,
		DeliveryFeeMinor:     delivFee,
		TotalMinor:           total,
		PaymentArrangement:   payArr,
		ReservationExpiresAt: expiresAt,
	})
	if err != nil {
		return MerchantOrderView{}, err
	}
	msg := "Order confirmed and stock reserved."
	if strings.TrimSpace(in.Note) != "" {
		msg = sanitizePublicText(in.Note, 400)
	}
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     ws,
		OrderID:         o.ID,
		EventType:       "order_confirmed",
		ActorType:       "merchant",
		ActorUserID:     pgtype.Int8{Int64: user, Valid: true},
		CustomerVisible: true,
		Message:         pgtype.Text{String: msg, Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}
	_ = q.InsertStorefrontAnalyticsEvent(ctx, db.InsertStorefrontAnalyticsEventParams{
		WorkspaceID:  ws,
		StorefrontID: o.StorefrontID,
		EventType:    "order_confirmed",
	})

	if err := tx.Commit(ctx); err != nil {
		return MerchantOrderView{}, err
	}
	invalidateStorefrontCache("")
	s.notifyStorefrontWorkspace(ctx, ws, fmt.Sprintf("Order %s confirmed", o.OrderReference), "Order confirmed and stock reserved")
	return s.buildMerchantOrderDetail(ctx, updated)
}

type FulfilOrderLineInput struct {
	OrderLineID int64  `json:"order_line_id"`
	Quantity    string `json:"quantity"`
}

type FulfilStorefrontOrderInput struct {
	ExpectedVersion int32                  `json:"expected_version"`
	DispatchedOn    string                 `json:"dispatched_on"`
	RecipientName   string                 `json:"recipient_name"`
	TrackingNote    string                 `json:"tracking_note"`
	Lines           []FulfilOrderLineInput `json:"lines"`
}

func (s *Service) FulfilStorefrontOrder(ctx context.Context, ws, user, orderID int64, in FulfilStorefrontOrderInput) (MerchantOrderView, error) {
	if in.ExpectedVersion < 1 {
		return MerchantOrderView{}, errors.New("expected_version is required")
	}
	dispatchedOn := time.Now().UTC()
	if strings.TrimSpace(in.DispatchedOn) != "" {
		parsed, err := time.Parse("2006-01-02", strings.TrimSpace(in.DispatchedOn))
		if err != nil {
			return MerchantOrderView{}, errors.New("dispatched_on must use YYYY-MM-DD")
		}
		dispatchedOn = parsed
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MerchantOrderView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	o, err := q.GetStorefrontOrderForUpdate(ctx, db.GetStorefrontOrderForUpdateParams{WorkspaceID: ws, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if o.Version != in.ExpectedVersion {
		return MerchantOrderView{}, ErrOrderVersionConflict
	}
	if o.CommercialStatus != "confirmed" || (o.FulfilmentStatus != "reserved" && o.FulfilmentStatus != "packed" && o.FulfilmentStatus != "partially_fulfilled") {
		return MerchantOrderView{}, errors.New("only confirmed reserved orders can be fulfilled")
	}
	if !o.OutletID.Valid {
		return MerchantOrderView{}, errors.New("order must have a fulfilment outlet")
	}

	lines, err := q.ListStorefrontOrderLines(ctx, o.ID)
	if err != nil {
		return MerchantOrderView{}, err
	}
	reqMap := map[int64]decimal.Decimal{}
	if len(in.Lines) == 0 {
		for _, l := range lines {
			rem := l.ConfirmedQuantity.Sub(l.FulfilledQuantity)
			if rem.GreaterThan(decimal.Zero) {
				reqMap[l.ID] = rem
			}
		}
	} else {
		for _, il := range in.Lines {
			qty, _, err := parseRequestQuantity(il.Quantity)
			if err != nil {
				return MerchantOrderView{}, err
			}
			reqMap[il.OrderLineID] = qty
		}
	}
	if len(reqMap) == 0 {
		return MerchantOrderView{}, errors.New("no remaining quantities to fulfil")
	}

	sort.Slice(lines, func(i, j int) bool { return lines[i].ProductID < lines[j].ProductID })
	var cogsTotal int64
	allDone := true

	for _, l := range lines {
		rem := l.ConfirmedQuantity.Sub(l.FulfilledQuantity)
		fulfilQty, requested := reqMap[l.ID]
		if !requested || fulfilQty.IsZero() {
			if rem.GreaterThan(decimal.Zero) {
				allDone = false
			}
			continue
		}
		if fulfilQty.GreaterThan(rem) {
			return MerchantOrderView{}, fmt.Errorf("fulfil quantity exceeds remaining confirmed quantity on line %s", l.TitleSnapshot)
		}
		if fulfilQty.LessThan(rem) {
			allDone = false
		}
		if l.ProductKind == "stock_tracked" {
			if !l.ReservationID.Valid {
				return MerchantOrderView{}, errors.New("missing stock reservation for stock-tracked order line")
			}
			res, err := q.GetStockReservationForUpdate(ctx, db.GetStockReservationForUpdateParams{WorkspaceID: ws, ID: l.ReservationID.Int64})
			if err != nil || res.Status != "active" {
				return MerchantOrderView{}, ErrReservationNotActive
			}
			bal, err := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
				WorkspaceID: ws,
				LocationID:  res.LocationID,
				ProductID:   l.ProductID,
				VariantID:   res.VariantID,
			})
			if err != nil || bal.QuantityOnHand.LessThan(fulfilQty) {
				return MerchantOrderView{}, ErrInsufficientStock
			}
			var lineCOGS int64
			if bal.ValueOnHandMinor > 0 && bal.QuantityOnHand.GreaterThan(decimal.Zero) {
				if bal.QuantityOnHand.Equal(fulfilQty) {
					lineCOGS = bal.ValueOnHandMinor
				} else {
					unitCostDec := decimal.NewFromInt(bal.ValueOnHandMinor).Div(bal.QuantityOnHand)
					lineCOGS = unitCostDec.Mul(fulfilQty).Round(0).IntPart()
				}
			}
			newQty := bal.QuantityOnHand.Sub(fulfilQty)
			newVal := bal.ValueOnHandMinor - lineCOGS
			if newVal < 0 {
				newVal = 0
			}
			newReserved := bal.ReservedQuantity.Sub(fulfilQty)
			if newReserved.IsNegative() {
				newReserved = decimal.Zero
			}
			if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
				WorkspaceID:       ws,
				LocationID:        res.LocationID,
				ProductID:         l.ProductID,
				VariantID:         res.VariantID,
				QuantityOnHand:    newQty,
				ReservedQuantity:  newReserved,
				InTransitQuantity: bal.InTransitQuantity,
				ValueOnHandMinor:  newVal,
			}); err != nil {
				return MerchantOrderView{}, err
			}
			if res.Quantity.LessThanOrEqual(fulfilQty) {
				if _, err := q.UpdateStockReservationStatus(ctx, db.UpdateStockReservationStatusParams{
					WorkspaceID: ws, ID: res.ID, Status: "fulfilled",
				}); err != nil {
					return MerchantOrderView{}, err
				}
			} else {
				remRes := res.Quantity.Sub(fulfilQty)
				if err := q.UpdateStockReservationQuantity(ctx, db.UpdateStockReservationQuantityParams{
					WorkspaceID: ws,
					ID:          res.ID,
					Quantity:    remRes,
				}); err != nil {
					return MerchantOrderView{}, err
				}
			}
			if _, err := q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{
				WorkspaceID:        ws,
				ProductID:          l.ProductID,
				GoodsReceiptLineID: pgtype.Int8{},
				LocationID:         pgtype.Int8{Int64: res.LocationID, Valid: true},
				MovementType:       "sale",
				SourceType:         "sale",
				SourceID:           pgtype.Int8{Int64: o.ID, Valid: true},
				QuantityDelta:      fulfilQty.Neg(),
				ValueDeltaMinor:    -lineCOGS,
				OccurredOn:         pgtype.Date{Time: dispatchedOn, Valid: true},
			}); err != nil {
				return MerchantOrderView{}, err
			}
			cogsTotal += lineCOGS
		}
		if _, err := q.UpdateStorefrontOrderLineFulfilled(ctx, db.UpdateStorefrontOrderLineFulfilledParams{
			ID:                l.ID,
			FulfilledQuantity: fulfilQty,
		}); err != nil {
			return MerchantOrderView{}, err
		}
	}

	fulf, err := q.CreateStorefrontFulfilment(ctx, db.CreateStorefrontFulfilmentParams{
		WorkspaceID:     ws,
		OrderID:         o.ID,
		OutletID:        o.OutletID.Int64,
		DeliveryMethod:  o.DeliveryMethod,
		DispatchedOn:    pgtype.Date{Time: dispatchedOn, Valid: true},
		RecipientName:   optionalPgText(sanitizePublicText(in.RecipientName, 160)),
		TrackingNote:    optionalPgText(sanitizePublicText(in.TrackingNote, 400)),
		CogsTotalMinor:  cogsTotal,
		CreatedByUserID: pgtype.Int8{Int64: user, Valid: user > 0},
	})
	if err != nil {
		return MerchantOrderView{}, err
	}

	if cogsTotal > 0 {
		entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
			WorkspaceID:      ws,
			SourceType:       "cogs_sale",
			SourceID:         fulf.ID,
			EntryDate:        pgtype.Date{Time: dispatchedOn, Valid: true},
			Currency:         o.Currency,
			CurrencyExponent: o.CurrencyExponent,
			Description:      optionalPgText("Storefront order fulfilment COGS: " + o.OrderReference),
		})
		if err != nil {
			return MerchantOrderView{}, err
		}
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   ws,
			AccountClass:  "expense",
			DebitMinor:    cogsTotal,
			Description:   optionalPgText("Cost of Goods Sold"),
		}); err != nil {
			return MerchantOrderView{}, err
		}
		if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   ws,
			AccountClass:  "asset",
			CreditMinor:   cogsTotal,
			Description:   optionalPgText("Inventory issued on fulfilment"),
		}); err != nil {
			return MerchantOrderView{}, err
		}
	}

	nextFulfilmentStatus := "partially_fulfilled"
	nextCommercialStatus := "confirmed"
	if allDone {
		nextFulfilmentStatus = "fulfilled"
		nextCommercialStatus = "completed"
	}
	updated, err := q.UpdateStorefrontOrderFulfilmentResult(ctx, db.UpdateStorefrontOrderFulfilmentResultParams{
		WorkspaceID:      ws,
		ID:               o.ID,
		FulfilmentStatus: nextFulfilmentStatus,
		CommercialStatus: nextCommercialStatus,
	})
	if err != nil {
		return MerchantOrderView{}, err
	}
	actorType := "merchant"
	if user <= 0 {
		actorType = "system"
	}
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     ws,
		OrderID:         o.ID,
		EventType:       "order_fulfilled",
		ActorType:       actorType,
		ActorUserID:     pgtype.Int8{Int64: user, Valid: user > 0},
		CustomerVisible: true,
		Message:         pgtype.Text{String: fmt.Sprintf("Order %s %s", o.OrderReference, nextFulfilmentStatus), Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}
	_ = q.InsertStorefrontAnalyticsEvent(ctx, db.InsertStorefrontAnalyticsEventParams{
		WorkspaceID:  ws,
		StorefrontID: o.StorefrontID,
		EventType:    "order_fulfilled",
	})

	if err := tx.Commit(ctx); err != nil {
		return MerchantOrderView{}, err
	}
	invalidateStorefrontCache("")
	s.notifyStorefrontWorkspace(ctx, ws, fmt.Sprintf("Order %s fulfilled", o.OrderReference), "Stock issued and fulfilment recorded")
	return s.buildMerchantOrderDetail(ctx, updated)
}

func (s *Service) DeclineOrCancelStorefrontOrder(ctx context.Context, ws, user, orderID int64, action, reason string) (MerchantOrderView, error) {
	if action != "decline" && action != "cancel" {
		return MerchantOrderView{}, errors.New("action must be decline or cancel")
	}
	cleanReason := sanitizePublicText(reason, 400)
	if cleanReason == "" {
		cleanReason = "Order " + action + "d by merchant"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MerchantOrderView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	o, err := q.GetStorefrontOrderForUpdate(ctx, db.GetStorefrontOrderForUpdateParams{WorkspaceID: ws, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if o.FulfilmentStatus == "partially_fulfilled" || o.FulfilmentStatus == "fulfilled" || o.CommercialStatus == "completed" {
		return MerchantOrderView{}, errors.New("partially or fully fulfilled orders cannot be cancelled; use returns workflow")
	}
	if o.CommercialStatus == "declined" || o.CommercialStatus == "cancelled" {
		return s.buildMerchantOrderDetail(ctx, o)
	}

	// Release any active stock reservations atomically
	lines, err := q.ListStorefrontOrderLines(ctx, o.ID)
	if err != nil {
		return MerchantOrderView{}, err
	}
	for _, l := range lines {
		if !l.ReservationID.Valid {
			continue
		}
		res, rErr := q.GetStockReservationForUpdate(ctx, db.GetStockReservationForUpdateParams{WorkspaceID: ws, ID: l.ReservationID.Int64})
		if rErr != nil || res.Status != "active" {
			continue
		}
		bal, bErr := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
			WorkspaceID: ws,
			LocationID:  res.LocationID,
			ProductID:   res.ProductID,
			VariantID:   res.VariantID,
		})
		if bErr != nil && !errors.Is(bErr, pgx.ErrNoRows) {
			return MerchantOrderView{}, bErr
		}
		if bErr == nil {
			newRes := bal.ReservedQuantity.Sub(res.Quantity)
			if newRes.IsNegative() {
				newRes = decimal.Zero
			}
			if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
				WorkspaceID:       ws,
				LocationID:        res.LocationID,
				ProductID:         res.ProductID,
				VariantID:         res.VariantID,
				QuantityOnHand:    bal.QuantityOnHand,
				ReservedQuantity:  newRes,
				InTransitQuantity: bal.InTransitQuantity,
				ValueOnHandMinor:  bal.ValueOnHandMinor,
			}); err != nil {
				return MerchantOrderView{}, err
			}
		}
		if _, err := q.UpdateStockReservationStatus(ctx, db.UpdateStockReservationStatusParams{
			WorkspaceID: ws, ID: res.ID, Status: "released",
		}); err != nil {
			return MerchantOrderView{}, err
		}
	}

	nextStatus := "cancelled"
	evAnalytic := "order_cancelled"
	if action == "decline" {
		nextStatus = "declined"
		evAnalytic = "order_declined"
	}
	updated, err := q.UpdateStorefrontOrderCancelledOrDeclined(ctx, db.UpdateStorefrontOrderCancelledOrDeclinedParams{
		WorkspaceID:           ws,
		ID:                    o.ID,
		CommercialStatus:      nextStatus,
		DeclineOrCancelReason: optionalPgText(cleanReason),
	})
	if err != nil {
		return MerchantOrderView{}, err
	}
	actorType := "merchant"
	if user == 0 {
		actorType = "system"
	}
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     ws,
		OrderID:         o.ID,
		EventType:       "order_" + nextStatus,
		ActorType:       actorType,
		ActorUserID:     pgtype.Int8{Int64: user, Valid: user > 0},
		CustomerVisible: true,
		Message:         pgtype.Text{String: cleanReason, Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}
	_ = q.InsertStorefrontAnalyticsEvent(ctx, db.InsertStorefrontAnalyticsEventParams{
		WorkspaceID:  ws,
		StorefrontID: o.StorefrontID,
		EventType:    evAnalytic,
	})
	if err := tx.Commit(ctx); err != nil {
		return MerchantOrderView{}, err
	}
	invalidateStorefrontCache("")
	s.notifyStorefrontWorkspace(ctx, ws, fmt.Sprintf("Order %s %s", o.OrderReference, nextStatus), cleanReason)
	return s.buildMerchantOrderDetail(ctx, updated)
}

func (s *Service) LinkOrCreateOrderCustomer(ctx context.Context, ws, orderID, counterpartyID int64) (MerchantOrderView, error) {
	o, err := s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: ws, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	var targetID int64
	if counterpartyID > 0 {
		party, err := s.GetCounterparty(ctx, ws, counterpartyID)
		if err != nil || (party.PartyType != "customer" && party.PartyType != "both") {
			return MerchantOrderView{}, ErrForbiddenParty
		}
		targetID = party.ID
	} else {
		created, err := s.CreateCounterparty(ctx, ws, CreateCounterpartyInput{
			Name:      o.CustomerName,
			PartyType: "customer",
			Phone:     o.CustomerPhone.String,
			Email:     o.CustomerEmail.String,
			Notes:     "Created from storefront order " + o.OrderReference,
		})
		if err != nil {
			return MerchantOrderView{}, err
		}
		targetID = created.ID
	}
	if err := s.queries.UpdateStorefrontOrderCustomerID(ctx, db.UpdateStorefrontOrderCustomerIDParams{
		WorkspaceID: ws,
		ID:          o.ID,
		CustomerID:  pgtype.Int8{Int64: targetID, Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}
	updated, err := s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: ws, ID: o.ID})
	if err != nil {
		return MerchantOrderView{}, err
	}
	return s.buildMerchantOrderDetail(ctx, updated)
}

func (s *Service) ConvertOrderToInvoice(ctx context.Context, ws, user, orderID int64, asProforma bool) (MerchantOrderView, error) {
	o, err := s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: ws, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if o.LinkedInvoiceID.Valid {
		return s.buildMerchantOrderDetail(ctx, o)
	}
	if o.CommercialStatus == "declined" || o.CommercialStatus == "cancelled" {
		return MerchantOrderView{}, ErrOrderAlreadyHandled
	}
	if !o.CustomerID.Valid {
		linked, err := s.LinkOrCreateOrderCustomer(ctx, ws, orderID, 0)
		if err != nil {
			return MerchantOrderView{}, err
		}
		o.CustomerID = pgtype.Int8{Int64: *linked.CustomerID, Valid: true}
	}
	lines, err := s.queries.ListStorefrontOrderLines(ctx, o.ID)
	if err != nil {
		return MerchantOrderView{}, err
	}
	invItems := make([]InvoiceItemInput, 0, len(lines)+1)
	for _, l := range lines {
		if l.ConfirmedQuantity.Equal(l.ConfirmedQuantity.Truncate(0)) && l.ConfirmedQuantity.IntPart() > 0 {
			invItems = append(invItems, InvoiceItemInput{
				Description:    l.TitleSnapshot,
				Quantity:       int32(l.ConfirmedQuantity.IntPart()),
				UnitPriceMinor: l.UnitPriceMinor,
			})
		} else {
			invItems = append(invItems, InvoiceItemInput{
				Description:    fmt.Sprintf("%s (%s %s)", l.TitleSnapshot, l.ConfirmedQuantity.Truncate(2).String(), l.UnitName),
				Quantity:       1,
				UnitPriceMinor: l.LineTotalMinor,
			})
		}
	}
	if o.DeliveryFeeMinor > 0 {
		invItems = append(invItems, InvoiceItemInput{
			Description:    "Delivery fee (" + o.DeliveryMethod + ")",
			Quantity:       1,
			UnitPriceMinor: o.DeliveryFeeMinor,
		})
	}
	docKind := "invoice"
	if asProforma {
		docKind = "proforma"
	}
	inv, err := s.CreateInvoice(ctx, ws, user, CreateInvoiceInput{
		CustomerID:     o.CustomerID.Int64,
		DocumentKind:   docKind,
		IssueDate:      time.Now().UTC().Format("2006-01-02"),
		DueDate:        time.Now().UTC().AddDate(0, 0, 7).Format("2006-01-02"),
		Currency:       o.Currency,
		Notes:          "Storefront Order " + o.OrderReference,
		Items:          invItems,
		IdempotencyKey: fmt.Sprintf("sf-ord-inv-%d-%s", o.ID, docKind),
	})
	if err != nil {
		return MerchantOrderView{}, err
	}
	payStatus := o.PaymentStatus
	if !asProforma && payStatus == "not_requested" {
		payStatus = "unpaid"
	}
	if err := s.queries.UpdateStorefrontOrderLinkedInvoice(ctx, db.UpdateStorefrontOrderLinkedInvoiceParams{
		WorkspaceID:     ws,
		ID:              o.ID,
		LinkedInvoiceID: pgtype.Int8{Int64: inv.Invoice.ID, Valid: true},
		PaymentStatus:   payStatus,
	}); err != nil {
		return MerchantOrderView{}, err
	}
	if _, err := s.queries.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     ws,
		OrderID:         o.ID,
		EventType:       "linked_" + docKind,
		ActorType:       "merchant",
		ActorUserID:     pgtype.Int8{Int64: user, Valid: true},
		CustomerVisible: true,
		Message:         pgtype.Text{String: fmt.Sprintf("Linked %s #%d", docKind, inv.Invoice.ID), Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}
	updated, err := s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: ws, ID: o.ID})
	if err != nil {
		return MerchantOrderView{}, err
	}
	return s.buildMerchantOrderDetail(ctx, updated)
}

func (s *Service) PostMerchantOrderMessage(ctx context.Context, ws, user, orderID int64, rawMessage string, visible bool) (MerchantOrderView, error) {
	msg := sanitizePublicText(rawMessage, 1000)
	if msg == "" {
		return MerchantOrderView{}, errors.New("message is required")
	}
	o, err := s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: ws, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if _, err := s.queries.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     ws,
		OrderID:         o.ID,
		EventType:       "merchant_message",
		ActorType:       "merchant",
		ActorUserID:     pgtype.Int8{Int64: user, Valid: true},
		CustomerVisible: visible,
		Message:         pgtype.Text{String: msg, Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}
	return s.buildMerchantOrderDetail(ctx, o)
}

func (s *Service) ExportStorefrontOrdersCSV(ctx context.Context, ws int64) ([]byte, error) {
	orders, err := s.ListMerchantOrders(ctx, ws, "", 0)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"Order Reference", "Commercial Status", "Fulfilment Status", "Payment Status", "Customer Name", "Delivery Method", "Currency", "Total Minor", "Created At"})
	for _, o := range orders {
		_ = w.Write([]string{o.OrderReference, o.CommercialStatus, o.FulfilmentStatus, o.PaymentStatus, o.CustomerName, o.DeliveryMethod, o.Currency, o.TotalMinor, o.CreatedAt})
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

type ReturnStorefrontOrderInput struct {
	Reason string                 `json:"reason"`
	Lines  []FulfilOrderLineInput `json:"lines"`
}

func (s *Service) ReturnStorefrontOrder(ctx context.Context, ws, user, orderID int64, in ReturnStorefrontOrderInput) (MerchantOrderView, error) {
	cleanReason := sanitizePublicText(in.Reason, 400)
	if cleanReason == "" {
		cleanReason = "Customer return recorded"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MerchantOrderView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	o, err := q.GetStorefrontOrderForUpdate(ctx, db.GetStorefrontOrderForUpdateParams{WorkspaceID: ws, ID: orderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if o.FulfilmentStatus != "fulfilled" && o.FulfilmentStatus != "partially_fulfilled" {
		return MerchantOrderView{}, errors.New("only fulfilled orders can accept returns")
	}
	if !o.OutletID.Valid {
		return MerchantOrderView{}, errors.New("order has no fulfilment outlet")
	}

	lines, err := q.ListStorefrontOrderLines(ctx, o.ID)
	if err != nil {
		return MerchantOrderView{}, err
	}
	reqMap := map[int64]decimal.Decimal{}
	if len(in.Lines) == 0 {
		for _, l := range lines {
			if l.FulfilledQuantity.GreaterThan(decimal.Zero) {
				reqMap[l.ID] = l.FulfilledQuantity
			}
		}
	} else {
		for _, il := range in.Lines {
			qty, _, err := parseRequestQuantity(il.Quantity)
			if err != nil {
				return MerchantOrderView{}, err
			}
			reqMap[il.OrderLineID] = qty
		}
	}
	if len(reqMap) == 0 {
		return MerchantOrderView{}, errors.New("no fulfilled quantities selected for return")
	}

	sort.Slice(lines, func(i, j int) bool { return lines[i].ProductID < lines[j].ProductID })
	today := time.Now().UTC()

	for _, l := range lines {
		retQty, ok := reqMap[l.ID]
		if !ok || retQty.IsZero() {
			continue
		}
		if retQty.GreaterThan(l.FulfilledQuantity) {
			return MerchantOrderView{}, fmt.Errorf("return quantity exceeds fulfilled quantity on line %s", l.TitleSnapshot)
		}
		prodKind, err := q.GetProductKindByID(ctx, db.GetProductKindByIDParams{
			WorkspaceID: ws,
			ID:          l.ProductID,
		})
		if err != nil {
			return MerchantOrderView{}, err
		}
		if prodKind == "stock_tracked" {
			bal, err := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
				WorkspaceID: ws,
				LocationID:  o.OutletID.Int64,
				ProductID:   l.ProductID,
				VariantID:   l.VariantID,
			})
			if err != nil {
				return MerchantOrderView{}, err
			}
			var restockVal int64
			if bal.QuantityOnHand.GreaterThan(decimal.Zero) && bal.ValueOnHandMinor > 0 {
				unitVal := decimal.NewFromInt(bal.ValueOnHandMinor).Div(bal.QuantityOnHand)
				restockVal = unitVal.Mul(retQty).Round(0).IntPart()
			}
			if _, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
				WorkspaceID:       ws,
				LocationID:        o.OutletID.Int64,
				ProductID:         l.ProductID,
				VariantID:         l.VariantID,
				QuantityOnHand:    bal.QuantityOnHand.Add(retQty),
				ReservedQuantity:  bal.ReservedQuantity,
				InTransitQuantity: bal.InTransitQuantity,
				ValueOnHandMinor:  bal.ValueOnHandMinor + restockVal,
			}); err != nil {
				return MerchantOrderView{}, err
			}
			if _, err := q.CreateInventoryMovement(ctx, db.CreateInventoryMovementParams{
				WorkspaceID:        ws,
				ProductID:          l.ProductID,
				GoodsReceiptLineID: pgtype.Int8{},
				LocationID:         pgtype.Int8{Int64: o.OutletID.Int64, Valid: true},
				MovementType:       "return",
				SourceType:         "sale",
				SourceID:           pgtype.Int8{Int64: o.ID, Valid: true},
				QuantityDelta:      retQty,
				ValueDeltaMinor:    restockVal,
				OccurredOn:         pgtype.Date{Time: today, Valid: true},
			}); err != nil {
				return MerchantOrderView{}, err
			}
		}
		if err := q.DecrementStorefrontOrderLineFulfilled(ctx, db.DecrementStorefrontOrderLineFulfilledParams{
			WorkspaceID:       ws,
			ID:                l.ID,
			FulfilledQuantity: retQty,
		}); err != nil {
			return MerchantOrderView{}, err
		}
	}

	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     ws,
		OrderID:         o.ID,
		EventType:       "return_recorded",
		ActorType:       "merchant",
		ActorUserID:     pgtype.Int8{Int64: user, Valid: true},
		CustomerVisible: true,
		Message:         pgtype.Text{String: cleanReason, Valid: true},
	}); err != nil {
		return MerchantOrderView{}, err
	}
	updated, err := q.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: ws, ID: o.ID})
	if err != nil {
		return MerchantOrderView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return MerchantOrderView{}, err
	}
	invalidateStorefrontCache("")
	s.notifyStorefrontWorkspace(ctx, ws, fmt.Sprintf("Return recorded for %s", o.OrderReference), cleanReason)
	return s.buildMerchantOrderDetail(ctx, updated)
}

func (s *Service) ExpireStaleStorefrontReservations(ctx context.Context) (int, error) {
	targets, err := s.queries.ListExpiredStorefrontOrders(ctx)
	if err != nil {
		return 0, err
	}

	expired := 0
	for _, t := range targets {
		if _, err := s.DeclineOrCancelStorefrontOrder(ctx, t.WorkspaceID, 0, t.ID, "cancel", "Payment hold expired"); err == nil {
			expired++
			if err := s.queries.ExpirePendingStorefrontPaymentAttempts(ctx, db.ExpirePendingStorefrontPaymentAttemptsParams{
				WorkspaceID: t.WorkspaceID,
				OrderID:     t.ID,
			}); err != nil {
				return expired, err
			}
			if _, err := s.queries.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
				WorkspaceID:     t.WorkspaceID,
				OrderID:         t.ID,
				EventType:       "hold_expired",
				ActorType:       "system",
				CustomerVisible: true,
				Message:         optionalPgText("Checkout stock hold expired. Order cancelled."),
			}); err != nil {
				return expired, err
			}
		}
	}
	return expired, nil
}
