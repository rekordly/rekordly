package finance

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
)

var (
	ErrInvalidPurchaseRequestState = errors.New("purchase request is not in a state for that command")
	ErrPurchaseRequestVersion      = errors.New("purchase request changed; reload and try again")
	ErrForbiddenProduct            = errors.New("product does not belong to workspace")
	ErrApprovalForbidden           = errors.New("you do not have permission to approve purchase requests")
)

// CreatePurchaseRequestInput is intentionally non-posting. It is a request
// for approval, not a purchase, receipt, supplier bill or payment.
type CreatePurchaseRequestInput struct {
	SupplierID     *int64                     `json:"supplier_id"`
	NeededBy       string                     `json:"needed_by"`
	Reason         string                     `json:"reason" binding:"required"`
	Reference      string                     `json:"reference"`
	Priority       string                     `json:"priority"`
	Currency       string                     `json:"currency"`
	Lines          []PurchaseRequestLineInput `json:"lines" binding:"required"`
	IdempotencyKey string                     `json:"idempotency_key"`
}

type PurchaseRequestLineInput struct {
	ProductID          *int64 `json:"product_id"`
	Description        string `json:"description"`
	Quantity           string `json:"quantity" binding:"required"`
	UnitName           string `json:"unit_name"`
	EstimatedUnitPrice string `json:"estimated_unit_price" binding:"required"`
}

type PurchaseRequestCommandInput struct {
	ExpectedVersion int32  `json:"expected_version" binding:"required"`
	IdempotencyKey  string `json:"idempotency_key"`
	Reason          string `json:"reason"`
}

type PurchaseRequestLineView struct {
	ID                      int64  `json:"id"`
	ProductID               *int64 `json:"product_id,omitempty"`
	Description             string `json:"description"`
	Quantity                string `json:"quantity"`
	UnitName                string `json:"unit_name"`
	EstimatedUnitPriceMinor string `json:"estimated_unit_price_minor"`
	EstimatedLineTotalMinor string `json:"estimated_line_total_minor"`
}

type PurchaseRequestDecisionView struct {
	ID             int64     `json:"id"`
	Command        string    `json:"command"`
	RequestVersion int32     `json:"request_version"`
	Reason         *string   `json:"reason,omitempty"`
	ActorUserID    int64     `json:"actor_user_id"`
	CreatedAt      time.Time `json:"created_at"`
}

type DocumentSupplierView struct {
	ID    int64   `json:"id"`
	Name  string  `json:"name"`
	Phone *string `json:"phone,omitempty"`
	Email *string `json:"email,omitempty"`
}

type PurchaseRequestView struct {
	ID                   int64                         `json:"id"`
	SupplierID           *int64                        `json:"supplier_id,omitempty"`
	Supplier             *DocumentSupplierView         `json:"supplier,omitempty"`
	SupplierName         string                        `json:"supplier_name,omitempty"`
	Status               string                        `json:"status"`
	Version              int32                         `json:"version"`
	NeededBy             *string                       `json:"needed_by,omitempty"`
	Reason               string                        `json:"reason"`
	Reference            *string                       `json:"reference,omitempty"`
	Priority             string                        `json:"priority"`
	LatestDecisionReason *string                       `json:"latest_decision_reason,omitempty"`
	Currency             string                        `json:"currency"`
	CurrencyExponent     int32                         `json:"currency_exponent"`
	EstimatedTotalMinor  string                        `json:"estimated_total_minor"`
	CreatedByUserID      int64                         `json:"created_by_user_id"`
	SubmittedAt          *time.Time                    `json:"submitted_at,omitempty"`
	ApprovedAt           *time.Time                    `json:"approved_at,omitempty"`
	CreatedAt            time.Time                     `json:"created_at"`
	UpdatedAt            time.Time                     `json:"updated_at"`
	Lines                []PurchaseRequestLineView     `json:"lines,omitempty"`
	Decisions            []PurchaseRequestDecisionView `json:"decisions,omitempty"`
	// Orders made from this request (detail endpoint only).
	Orders []PurchaseRequestOrderView `json:"orders,omitempty"`
}

type PurchaseRequestOrderView struct {
	ID          int64   `json:"id"`
	OrderNumber *string `json:"order_number,omitempty"`
	Status      string  `json:"status"`
	TotalMinor  string  `json:"total_minor"`
}

type ListPurchaseRequestsFilter struct {
	Status   string `form:"status"`
	BeforeID int64  `form:"before_id"`
	Limit    int32  `form:"limit"`
}

type preparedPurchaseRequestLine struct {
	productID   *int64
	description string
	quantity    string
	decimal     decimal.Decimal
	unitName    string
	unitPrice   int64
	lineTotal   int64
}

func (s *Service) CreatePurchaseRequest(ctx context.Context, workspaceID, userID int64, in CreatePurchaseRequestInput) (PurchaseRequestView, error) {
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	if len(currency) != 3 {
		return PurchaseRequestView{}, ErrInvalidCurrency
	}
	if len(in.Lines) == 0 || len(in.Lines) > 100 {
		return PurchaseRequestView{}, errors.New("a purchase request needs between 1 and 100 lines")
	}
	reason := strings.TrimSpace(in.Reason)
	if reason == "" || len(reason) > 1000 {
		return PurchaseRequestView{}, errors.New("reason must be between 1 and 1000 characters")
	}
	idempotencyKey := strings.TrimSpace(in.IdempotencyKey)
	if idempotencyKey == "" || len(idempotencyKey) > 200 {
		return PurchaseRequestView{}, errors.New("an idempotency key is required")
	}
	priority := strings.ToLower(strings.TrimSpace(in.Priority))
	if priority == "" {
		priority = "normal"
	}
	if priority != "low" && priority != "normal" && priority != "high" && priority != "urgent" {
		return PurchaseRequestView{}, errors.New("priority must be low, normal, high, or urgent")
	}

	var supplierID pgtype.Int8
	if in.SupplierID != nil && *in.SupplierID > 0 {
		supplier, err := s.GetCounterparty(ctx, workspaceID, *in.SupplierID)
		if err != nil || (supplier.PartyType != "supplier" && supplier.PartyType != "both") {
			return PurchaseRequestView{}, ErrForbiddenParty
		}
		supplierID = pgtype.Int8{Int64: supplier.ID, Valid: true}
	}

	prepared, total, err := s.preparePurchaseRequestLines(ctx, workspaceID, in.Lines, CurrencyExponent(currency))
	if err != nil {
		return PurchaseRequestView{}, err
	}
	neededBy, err := optionalDate(in.NeededBy)
	if err != nil {
		return PurchaseRequestView{}, err
	}
	if existing, err := s.queries.GetPurchaseRequestByIdempotency(ctx, db.GetPurchaseRequestByIdempotencyParams{WorkspaceID: workspaceID, IdempotencyKey: idempotencyKey}); err == nil {
		detail, detailErr := purchaseRequestDetail(ctx, s.queries, existing)
		if detailErr != nil {
			return PurchaseRequestView{}, detailErr
		}
		if samePurchaseRequestInput(detail, supplierID, neededBy, reason, in.Reference, priority, currency, prepared) {
			return detail, nil
		}
		return PurchaseRequestView{}, ErrDuplicateIdempotent
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return PurchaseRequestView{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PurchaseRequestView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)
	request, err := qtx.CreatePurchaseRequest(ctx, db.CreatePurchaseRequestParams{
		WorkspaceID: workspaceID, SupplierID: supplierID, NeededBy: neededBy, Reason: reason,
		Reference: optionalPgText(in.Reference), Priority: priority, Currency: currency, CurrencyExponent: int32(CurrencyExponent(currency)),
		EstimatedTotalMinor: total, IdempotencyKey: idempotencyKey, CreatedByUserID: userID,
	})
	if err != nil {
		return PurchaseRequestView{}, fmt.Errorf("create purchase request: %w", err)
	}
	for _, line := range prepared {
		var productID pgtype.Int8
		if line.productID != nil {
			productID = pgtype.Int8{Int64: *line.productID, Valid: true}
		}
		if _, err := qtx.CreatePurchaseRequestLine(ctx, db.CreatePurchaseRequestLineParams{
			WorkspaceID: workspaceID, PurchaseRequestID: request.ID, ProductID: productID,
			Description: line.description, Quantity: line.decimal, UnitName: line.unitName,
			EstimatedUnitPriceMinor: line.unitPrice, EstimatedLineTotalMinor: line.lineTotal,
		}); err != nil {
			return PurchaseRequestView{}, fmt.Errorf("create purchase request line: %w", err)
		}
	}
	detail, err := purchaseRequestDetail(ctx, qtx, request)
	if err != nil {
		return PurchaseRequestView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PurchaseRequestView{}, fmt.Errorf("commit purchase request: %w", err)
	}
	return detail, nil
}

func (s *Service) batchSuppliersMap(ctx context.Context, workspaceID int64, supplierIDs []int64) (map[int64]*DocumentSupplierView, error) {
	if len(supplierIDs) == 0 {
		return map[int64]*DocumentSupplierView{}, nil
	}
	unique := make([]int64, 0, len(supplierIDs))
	seen := make(map[int64]bool, len(supplierIDs))
	for _, id := range supplierIDs {
		if id > 0 && !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	if len(unique) == 0 {
		return map[int64]*DocumentSupplierView{}, nil
	}
	rows, err := s.queries.ListCounterpartiesByIDs(ctx, db.ListCounterpartiesByIDsParams{
		WorkspaceID: workspaceID,
		Column2:     unique,
	})
	if err != nil {
		return nil, err
	}
	result := make(map[int64]*DocumentSupplierView, len(rows))
	for _, r := range rows {
		result[r.ID] = &DocumentSupplierView{
			ID:    r.ID,
			Name:  r.Name,
			Phone: nullableText(r.Phone),
			Email: nullableText(r.Email),
		}
	}
	return result, nil
}

func (s *Service) getSupplierView(ctx context.Context, workspaceID int64, supplierID int64) *DocumentSupplierView {
	if supplierID <= 0 {
		return nil
	}
	c, err := s.queries.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{
		WorkspaceID: workspaceID,
		ID:          supplierID,
	})
	if err != nil {
		return nil
	}
	return &DocumentSupplierView{
		ID:    c.ID,
		Name:  c.Name,
		Phone: nullableText(c.Phone),
		Email: nullableText(c.Email),
	}
}

func (s *Service) ListPurchaseRequests(ctx context.Context, workspaceID int64, filter ListPurchaseRequestsFilter) ([]PurchaseRequestView, *int64, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var beforeID pgtype.Int8
	if filter.BeforeID > 0 {
		beforeID = pgtype.Int8{Int64: filter.BeforeID, Valid: true}
	}
	var status pgtype.Text
	if value := strings.ToLower(strings.TrimSpace(filter.Status)); value != "" {
		switch value {
		case "draft", "submitted", "approved", "rejected", "changes_requested", "cancelled":
			status = pgtype.Text{String: value, Valid: true}
		default:
			return nil, nil, errors.New("invalid purchase request status")
		}
	}
	requests, err := s.queries.ListPurchaseRequests(ctx, db.ListPurchaseRequestsParams{WorkspaceID: workspaceID, Limit: limit + 1, Status: status, BeforeID: beforeID})
	if err != nil {
		return nil, nil, err
	}

	var nextBeforeID *int64
	if len(requests) > int(limit) {
		nextID := requests[limit-1].ID
		nextBeforeID = &nextID
		requests = requests[:limit]
	}

	supplierIDs := make([]int64, 0, len(requests))
	for _, r := range requests {
		if r.SupplierID.Valid {
			supplierIDs = append(supplierIDs, r.SupplierID.Int64)
		}
	}
	suppliers, _ := s.batchSuppliersMap(ctx, workspaceID, supplierIDs)

	items := make([]PurchaseRequestView, 0, len(requests))
	for _, request := range requests {
		v := purchaseRequestHeader(request)
		if v.SupplierID != nil {
			if sup, ok := suppliers[*v.SupplierID]; ok {
				v.Supplier = sup
				v.SupplierName = sup.Name
			}
		}
		items = append(items, v)
	}
	return items, nextBeforeID, nil
}

func (s *Service) GetPurchaseRequest(ctx context.Context, workspaceID, requestID int64) (PurchaseRequestView, error) {
	request, err := s.queries.GetPurchaseRequestByID(ctx, db.GetPurchaseRequestByIDParams{ID: requestID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return PurchaseRequestView{}, ErrNotFound
	}
	if err != nil {
		return PurchaseRequestView{}, err
	}
	view, err := purchaseRequestDetail(ctx, s.queries, request)
	if err != nil {
		return PurchaseRequestView{}, err
	}
	if view.SupplierID != nil {
		if sup := s.getSupplierView(ctx, workspaceID, *view.SupplierID); sup != nil {
			view.Supplier = sup
			view.SupplierName = sup.Name
		}
	}
	order, err := s.queries.GetPurchaseOrderBySource(ctx, db.GetPurchaseOrderBySourceParams{WorkspaceID: workspaceID, SourcePurchaseRequestID: pgtype.Int8{Int64: requestID, Valid: true}})
	if err == nil {
		summary := purchaseOrderView(order)
		view.Orders = []PurchaseRequestOrderView{{ID: summary.ID, OrderNumber: summary.OrderNumber, Status: summary.Status, TotalMinor: summary.TotalMinor}}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return PurchaseRequestView{}, err
	}
	return view, nil
}

func (s *Service) SubmitPurchaseRequest(ctx context.Context, workspaceID, userID, requestID int64, in PurchaseRequestCommandInput) (PurchaseRequestView, error) {
	return s.commandPurchaseRequest(ctx, workspaceID, userID, requestID, in, "submit")
}

func (s *Service) ApprovePurchaseRequest(ctx context.Context, workspaceID, userID, requestID int64, in PurchaseRequestCommandInput) (PurchaseRequestView, error) {
	return s.commandPurchaseRequest(ctx, workspaceID, userID, requestID, in, "approve")
}
func (s *Service) RejectPurchaseRequest(ctx context.Context, workspaceID, userID, requestID int64, in PurchaseRequestCommandInput) (PurchaseRequestView, error) {
	return s.commandPurchaseRequest(ctx, workspaceID, userID, requestID, in, "reject")
}
func (s *Service) RequestPurchaseRequestChanges(ctx context.Context, workspaceID, userID, requestID int64, in PurchaseRequestCommandInput) (PurchaseRequestView, error) {
	return s.commandPurchaseRequest(ctx, workspaceID, userID, requestID, in, "request_changes")
}
func (s *Service) CancelPurchaseRequest(ctx context.Context, workspaceID, userID, requestID int64, in PurchaseRequestCommandInput) (PurchaseRequestView, error) {
	return s.commandPurchaseRequest(ctx, workspaceID, userID, requestID, in, "cancel")
}

func (s *Service) commandPurchaseRequest(ctx context.Context, workspaceID, userID, requestID int64, in PurchaseRequestCommandInput, command string) (PurchaseRequestView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if requestID <= 0 || in.ExpectedVersion <= 0 || key == "" || len(key) > 200 {
		return PurchaseRequestView{}, errors.New("request id, expected version and idempotency key are required")
	}
	decisionReason := strings.TrimSpace(in.Reason)
	if len(decisionReason) > 1000 {
		return PurchaseRequestView{}, errors.New("decision reason must be at most 1000 characters")
	}
	if (command == "reject" || command == "request_changes") && len(decisionReason) < 3 {
		return PurchaseRequestView{}, errors.New("a decision reason of at least 3 characters is required")
	}
	if previous, err := s.queries.GetPurchaseRequestCommandByIdempotency(ctx, db.GetPurchaseRequestCommandByIdempotencyParams{WorkspaceID: workspaceID, IdempotencyKey: key}); err == nil {
		if previous.PurchaseRequestID != requestID || previous.Command != command || previous.ExpectedVersion != in.ExpectedVersion {
			return PurchaseRequestView{}, ErrDuplicateIdempotent
		}
		request, getErr := s.queries.GetPurchaseRequestByID(ctx, db.GetPurchaseRequestByIDParams{ID: requestID, WorkspaceID: workspaceID})
		if getErr != nil {
			return PurchaseRequestView{}, getErr
		}
		return purchaseRequestDetail(ctx, s.queries, request)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return PurchaseRequestView{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PurchaseRequestView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)
	current, err := qtx.GetPurchaseRequestForUpdate(ctx, db.GetPurchaseRequestForUpdateParams{ID: requestID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return PurchaseRequestView{}, ErrNotFound
	}
	if err != nil {
		return PurchaseRequestView{}, err
	}
	if current.Version != in.ExpectedVersion {
		return PurchaseRequestView{}, ErrPurchaseRequestVersion
	}

	var updated db.PurchaseRequest
	switch command {
	case "submit":
		if current.Status != "draft" && current.Status != "changes_requested" {
			return PurchaseRequestView{}, ErrInvalidPurchaseRequestState
		}
		updated, err = qtx.SubmitPurchaseRequest(ctx, db.SubmitPurchaseRequestParams{ID: requestID, WorkspaceID: workspaceID, Version: in.ExpectedVersion, SubmittedByUserID: pgtype.Int8{Int64: userID, Valid: true}})
	case "approve":
		if current.Status != "submitted" {
			return PurchaseRequestView{}, ErrInvalidPurchaseRequestState
		}
		policy, policyErr := qtx.GetProcurementApprovalPolicy(ctx, workspaceID)
		if policyErr != nil && !errors.Is(policyErr, pgx.ErrNoRows) {
			return PurchaseRequestView{}, policyErr
		}
		needsPolicyMembership := policyErr == nil && ((!policy.AllowSelfApproval && current.CreatedByUserID == userID) || (policy.ApprovalThresholdMinor > 0 && current.EstimatedTotalMinor >= policy.ApprovalThresholdMinor))
		if needsPolicyMembership {
			membership, membershipErr := qtx.GetActiveMembership(ctx, db.GetActiveMembershipParams{WorkspaceID: workspaceID, UserID: userID})
			if membershipErr != nil || !membership.IsOwner {
				return PurchaseRequestView{}, ErrApprovalForbidden
			}
		}
		updated, err = qtx.ApprovePurchaseRequest(ctx, db.ApprovePurchaseRequestParams{ID: requestID, WorkspaceID: workspaceID, Version: in.ExpectedVersion, ApprovedByUserID: pgtype.Int8{Int64: userID, Valid: true}})
	case "reject":
		if current.Status != "submitted" {
			return PurchaseRequestView{}, ErrInvalidPurchaseRequestState
		}
		updated, err = qtx.ResolvePurchaseRequest(ctx, db.ResolvePurchaseRequestParams{ID: requestID, WorkspaceID: workspaceID, Version: in.ExpectedVersion, Status: "rejected", LatestDecisionReason: optionalPgText(decisionReason)})
	case "request_changes":
		if current.Status != "submitted" {
			return PurchaseRequestView{}, ErrInvalidPurchaseRequestState
		}
		updated, err = qtx.ResolvePurchaseRequest(ctx, db.ResolvePurchaseRequestParams{ID: requestID, WorkspaceID: workspaceID, Version: in.ExpectedVersion, Status: "changes_requested", LatestDecisionReason: optionalPgText(decisionReason)})
	case "cancel":
		if current.Status != "draft" && current.Status != "submitted" && current.Status != "approved" {
			return PurchaseRequestView{}, ErrInvalidPurchaseRequestState
		}
		updated, err = qtx.ResolvePurchaseRequest(ctx, db.ResolvePurchaseRequestParams{ID: requestID, WorkspaceID: workspaceID, Version: in.ExpectedVersion, Status: "cancelled", LatestDecisionReason: optionalPgText(decisionReason)})
	default:
		return PurchaseRequestView{}, errors.New("unsupported purchase request command")
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return PurchaseRequestView{}, ErrPurchaseRequestVersion
	}
	if err != nil {
		return PurchaseRequestView{}, err
	}
	if _, err := qtx.CreatePurchaseRequestCommand(ctx, db.CreatePurchaseRequestCommandParams{WorkspaceID: workspaceID, PurchaseRequestID: requestID, Command: command, ExpectedVersion: in.ExpectedVersion, IdempotencyKey: key, ActorUserID: userID}); err != nil {
		return PurchaseRequestView{}, err
	}
	if _, err := qtx.CreatePurchaseRequestDecision(ctx, db.CreatePurchaseRequestDecisionParams{WorkspaceID: workspaceID, PurchaseRequestID: requestID, Command: command, RequestVersion: current.Version, Reason: optionalPgText(decisionReason), ActorUserID: userID}); err != nil {
		return PurchaseRequestView{}, err
	}
	detail, err := purchaseRequestDetail(ctx, qtx, updated)
	if err != nil {
		return PurchaseRequestView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PurchaseRequestView{}, err
	}
	return detail, nil
}

func (s *Service) preparePurchaseRequestLines(ctx context.Context, workspaceID int64, input []PurchaseRequestLineInput, exponent int) ([]preparedPurchaseRequestLine, int64, error) {
	lines := make([]preparedPurchaseRequestLine, 0, len(input))
	var total int64
	for _, raw := range input {
		quantity, quantityText, err := parseRequestQuantity(raw.Quantity)
		if err != nil {
			return nil, 0, err
		}
		description := strings.TrimSpace(raw.Description)
		var productID *int64
		if raw.ProductID != nil && *raw.ProductID > 0 {
			product, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{ID: *raw.ProductID, WorkspaceID: workspaceID})
			if err != nil {
				return nil, 0, ErrForbiddenProduct
			}
			productID = &product.ID
			if description == "" {
				description = product.Name
			}
		}
		if description == "" || len(description) > 240 {
			return nil, 0, errors.New("each request line needs a description under 240 characters")
		}
		unitName := strings.TrimSpace(raw.UnitName)
		if unitName == "" {
			unitName = "each"
		}
		if len(unitName) > 40 {
			return nil, 0, errors.New("unit name must be at most 40 characters")
		}
		price, err := ParseMajorToMinor(raw.EstimatedUnitPrice, exponent)
		if err != nil {
			return nil, 0, fmt.Errorf("invalid estimated unit price: %w", err)
		}
		lineTotal, err := requestLineTotal(price, quantity)
		if err != nil {
			return nil, 0, err
		}
		total, err = CheckedAdd(total, lineTotal)
		if err != nil {
			return nil, 0, err
		}
		lines = append(lines, preparedPurchaseRequestLine{productID: productID, description: description, quantity: quantityText, decimal: quantity, unitName: unitName, unitPrice: price, lineTotal: lineTotal})
	}
	return lines, total, nil
}

func parseRequestQuantity(input string) (decimal.Decimal, string, error) {
	value := strings.TrimSpace(input)
	if value == "" || strings.ContainsAny(value, "+-eE, \t\r\n") {
		return decimal.Zero, "", errors.New("quantity must be a plain positive decimal")
	}
	parts := strings.Split(value, ".")
	if len(parts) > 2 || len(parts[0]) > 14 || (len(parts) == 2 && len(parts[1]) > 4) {
		return decimal.Zero, "", errors.New("quantity supports up to 14 whole digits and 4 decimal places")
	}
	whole := parts[0]
	if whole == "" {
		whole = "0"
	}
	for _, part := range parts {
		for _, character := range part {
			if character < '0' || character > '9' {
				return decimal.Zero, "", errors.New("quantity must be a plain positive decimal")
			}
		}
	}
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	normalized := strings.TrimLeft(whole, "0")
	if normalized == "" {
		normalized = "0"
	}
	normalized += "." + fraction + strings.Repeat("0", 4-len(fraction))
	quantity, err := decimal.NewFromString(normalized)
	if err != nil || !quantity.GreaterThan(decimal.Zero) {
		return decimal.Zero, "", errors.New("quantity must be greater than zero")
	}
	return quantity, normalized, nil
}

// requestLineTotal rounds half up to the currency minor unit. This is only an
// estimate for request approval; it is never a stock, expense or payable posting.
func requestLineTotal(unitPriceMinor int64, quantity decimal.Decimal) (int64, error) {
	scaled := quantity.Shift(4)
	quantityInteger := scaled.BigInt()
	if !scaled.Equal(scaled.Truncate(0)) || !quantityInteger.IsInt64() {
		return 0, errors.New("invalid normalized quantity")
	}
	product := new(big.Int).Mul(big.NewInt(unitPriceMinor), quantityInteger)
	product.Add(product, big.NewInt(5_000))
	product.Quo(product, big.NewInt(10_000))
	if !product.IsInt64() || product.Sign() <= 0 {
		return 0, ErrAmountOverflow
	}
	return product.Int64(), nil
}

func optionalDate(input string) (pgtype.Date, error) {
	value := strings.TrimSpace(input)
	if value == "" {
		return pgtype.Date{}, nil
	}
	date, err := time.Parse("2006-01-02", value)
	if err != nil {
		return pgtype.Date{}, errors.New("needed-by date must use YYYY-MM-DD")
	}
	return pgtype.Date{Time: date, Valid: true}, nil
}

func purchaseRequestDetail(ctx context.Context, queries *db.Queries, request db.PurchaseRequest) (PurchaseRequestView, error) {
	view := purchaseRequestHeader(request)
	if request.SupplierID.Valid {
		if c, err := queries.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{
			WorkspaceID: request.WorkspaceID,
			ID:          request.SupplierID.Int64,
		}); err == nil {
			view.Supplier = &DocumentSupplierView{
				ID:    c.ID,
				Name:  c.Name,
				Phone: nullableText(c.Phone),
				Email: nullableText(c.Email),
			}
			view.SupplierName = c.Name
		}
	}
	lines, err := queries.GetPurchaseRequestLines(ctx, db.GetPurchaseRequestLinesParams{WorkspaceID: request.WorkspaceID, PurchaseRequestID: request.ID})
	if err != nil {
		return PurchaseRequestView{}, err
	}
	view.Lines = make([]PurchaseRequestLineView, 0, len(lines))
	for _, line := range lines {
		view.Lines = append(view.Lines, PurchaseRequestLineView{
			ID: line.ID, ProductID: nullableInt8(line.ProductID), Description: line.Description, Quantity: line.Quantity, UnitName: line.UnitName,
			EstimatedUnitPriceMinor: fmt.Sprint(line.EstimatedUnitPriceMinor), EstimatedLineTotalMinor: fmt.Sprint(line.EstimatedLineTotalMinor),
		})
	}
	decisions, err := queries.ListPurchaseRequestDecisions(ctx, db.ListPurchaseRequestDecisionsParams{WorkspaceID: request.WorkspaceID, PurchaseRequestID: request.ID})
	if err != nil {
		return PurchaseRequestView{}, err
	}
	view.Decisions = make([]PurchaseRequestDecisionView, 0, len(decisions))
	for _, decision := range decisions {
		view.Decisions = append(view.Decisions, PurchaseRequestDecisionView{
			ID: decision.ID, Command: decision.Command, RequestVersion: decision.RequestVersion, Reason: nullableText(decision.Reason), ActorUserID: decision.ActorUserID, CreatedAt: decision.CreatedAt.Time,
		})
	}
	return view, nil
}

func purchaseRequestHeader(request db.PurchaseRequest) PurchaseRequestView {
	return PurchaseRequestView{
		ID: request.ID, SupplierID: nullableInt8(request.SupplierID), Status: request.Status, Version: request.Version,
		NeededBy: nullableDate(request.NeededBy), Reason: request.Reason, Reference: nullableText(request.Reference), Priority: request.Priority, LatestDecisionReason: nullableText(request.LatestDecisionReason), Currency: request.Currency,
		CurrencyExponent: request.CurrencyExponent, EstimatedTotalMinor: fmt.Sprint(request.EstimatedTotalMinor), CreatedByUserID: request.CreatedByUserID,
		SubmittedAt: nullableTimestamp(request.SubmittedAt), ApprovedAt: nullableTimestamp(request.ApprovedAt),
		CreatedAt: request.CreatedAt.Time, UpdatedAt: request.UpdatedAt.Time,
	}
}

func samePurchaseRequestInput(existing PurchaseRequestView, supplierID pgtype.Int8, neededBy pgtype.Date, reason, reference, priority, currency string, lines []preparedPurchaseRequestLine) bool {
	if existing.Reason != reason || existing.Priority != priority || existing.Currency != currency || !sameNullableInt(existing.SupplierID, supplierID) || !sameNullableDate(existing.NeededBy, neededBy) || nullableStringValue(existing.Reference) != strings.TrimSpace(reference) || len(existing.Lines) != len(lines) {
		return false
	}
	for index, line := range lines {
		existingLine := existing.Lines[index]
		if !sameNullableInt(existingLine.ProductID, pgtype.Int8{Int64: optionalInt64(line.productID), Valid: line.productID != nil}) || existingLine.Description != line.description || existingLine.Quantity != line.quantity || existingLine.UnitName != line.unitName || existingLine.EstimatedUnitPriceMinor != fmt.Sprint(line.unitPrice) || existingLine.EstimatedLineTotalMinor != fmt.Sprint(line.lineTotal) {
			return false
		}
	}
	return true
}

func nullableInt8(value pgtype.Int8) *int64 {
	if !value.Valid {
		return nil
	}
	result := value.Int64
	return &result
}

func nullableDate(value pgtype.Date) *string {
	if !value.Valid {
		return nil
	}
	result := value.Time.Format("2006-01-02")
	return &result
}

func nullableTimestamp(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	result := value.Time
	return &result
}

func optionalInt64(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}
func nullableStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
func sameNullableInt(existing *int64, actual pgtype.Int8) bool {
	return (existing == nil && !actual.Valid) || (existing != nil && actual.Valid && *existing == actual.Int64)
}
func sameNullableDate(existing *string, actual pgtype.Date) bool {
	return (existing == nil && !actual.Valid) || (existing != nil && actual.Valid && *existing == actual.Time.Format("2006-01-02"))
}
