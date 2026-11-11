package finance

import (
	"context"
	"encoding/json"
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

// Goods receipts are the first procurement posting: they record what was
// accepted, create stock movements for stock-tracked products, and accrue GRNI.
// A supplier bill is intentionally a later, separate Accounts Payable event.
type CreateGoodsReceiptInput struct {
	PurchaseOrderID   int64                   `json:"purchase_order_id"`
	SupplierID        int64                   `json:"supplier_id"`
	Reason            string                  `json:"reason"`
	Currency          string                  `json:"currency"`
	LocationID        int64                   `json:"location_id"`
	ReceiptReference  string                  `json:"receipt_reference"`
	DeliveryReference string                  `json:"delivery_reference"`
	ServiceAccepted   bool                    `json:"service_accepted"`
	LandedCost        string                  `json:"landed_cost"`
	ReceivedOn        string                  `json:"received_on" binding:"required"`
	Lines             []GoodsReceiptLineInput `json:"lines" binding:"required"`
	IdempotencyKey    string                  `json:"idempotency_key"`
}

type GoodsReceiptLineInput struct {
	PurchaseOrderLineID int64    `json:"purchase_order_line_id"`
	ProductID           *int64   `json:"product_id"`
	Description         string   `json:"description"`
	AcceptedQuantity    string   `json:"accepted_quantity"`
	RejectedQuantity    string   `json:"rejected_quantity"`
	ActualUnitCost      string   `json:"actual_unit_cost"`
	BatchNumber         string   `json:"batch_number"`
	ExpiryDate          string   `json:"expiry_date"`
	SerialNumbers       []string `json:"serial_numbers"`
	Notes               string   `json:"notes"`
}

type GoodsReceiptView struct {
	ID                  int64   `json:"id"`
	PurchaseOrderID     int64   `json:"purchase_order_id"`
	SupplierID          *int64  `json:"supplier_id,omitempty"`
	LocationID          *int64  `json:"location_id,omitempty"`
	SourceType          string  `json:"source_type"`
	Reason              *string `json:"reason,omitempty"`
	PurchaseOrderStatus string  `json:"purchase_order_status"`
	ReceivedOn          string  `json:"received_on"`
	Currency            string  `json:"currency,omitempty"`
	CurrencyExponent    int32   `json:"currency_exponent,omitempty"`
	TotalMinor          string  `json:"total_minor"`
	LandedCostMinor     string  `json:"landed_cost_minor,omitempty"`
	DeliveryReference   *string `json:"delivery_reference,omitempty"`
	ServiceAccepted     bool    `json:"service_accepted"`
}

type GoodsReceiptLineView struct {
	ID                     int64    `json:"id"`
	PurchaseOrderLineID    int64    `json:"purchase_order_line_id"`
	ProductID              *int64   `json:"product_id,omitempty"`
	Description            string   `json:"description"`
	AcceptedQuantity       string   `json:"accepted_quantity"`
	RejectedQuantity       string   `json:"rejected_quantity,omitempty"`
	UnitCostMinor          string   `json:"unit_cost_minor"`
	ActualUnitCostMinor    string   `json:"actual_unit_cost_minor"`
	LandedCostMinor        string   `json:"landed_cost_minor,omitempty"`
	EffectiveUnitCostMinor string   `json:"effective_unit_cost_minor,omitempty"`
	LineTotalMinor         string   `json:"line_total_minor"`
	BatchNumber            *string  `json:"batch_number,omitempty"`
	ExpiryDate             *string  `json:"expiry_date,omitempty"`
	SerialNumbers          []string `json:"serial_numbers,omitempty"`
	Notes                  *string  `json:"notes,omitempty"`
}

type GoodsReceiptDetailView struct {
	GoodsReceiptView
	ReceiptReference *string                `json:"receipt_reference,omitempty"`
	Lines            []GoodsReceiptLineView `json:"lines"`
}

type ReceiptOptionLine struct {
	PurchaseOrderLineID int64  `json:"purchase_order_line_id"`
	Description         string `json:"description"`
	RemainingQuantity   string `json:"remaining_quantity"`
}

type GoodsReceiptListItem struct {
	ID               int64   `json:"id"`
	PurchaseOrderID  int64   `json:"purchase_order_id"`
	SupplierID       *int64  `json:"supplier_id,omitempty"`
	LocationID       *int64  `json:"location_id,omitempty"`
	SourceType       string  `json:"source_type"`
	LandedCostMinor  string  `json:"landed_cost_minor,omitempty"`
	ReceivedOn       string  `json:"received_on"`
	ReceiptReference *string `json:"receipt_reference,omitempty"`
}

func (s *Service) ListGoodsReceipts(ctx context.Context, ws int64) ([]GoodsReceiptListItem, error) {
	rows, e := s.queries.ListGoodsReceipts(ctx, db.ListGoodsReceiptsParams{WorkspaceID: ws, Limit: 50})
	if e != nil {
		return nil, e
	}
	out := make([]GoodsReceiptListItem, 0, len(rows))
	for _, r := range rows {
		var poID int64
		if r.PurchaseOrderID.Valid {
			poID = r.PurchaseOrderID.Int64
		}
		out = append(out, GoodsReceiptListItem{
			ID:               r.ID,
			PurchaseOrderID:  poID,
			SupplierID:       nullableInt8(r.SupplierID),
			LocationID:       nullableInt8(r.LocationID),
			SourceType:       r.SourceType,
			LandedCostMinor:  fmt.Sprint(r.LandedCostMinor),
			ReceivedOn:       r.ReceivedOn.Time.Format("2006-01-02"),
			ReceiptReference: nullableText(r.ReceiptReference),
		})
	}
	return out, nil
}

func (s *Service) ReceiptOptions(ctx context.Context, ws, purchaseOrderID int64) ([]ReceiptOptionLine, error) {
	po, err := s.queries.GetPurchaseOrderByID(ctx, db.GetPurchaseOrderByIDParams{WorkspaceID: ws, ID: purchaseOrderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if po.Status != "issued" && po.Status != "acknowledged" && po.Status != "partially_received" {
		return nil, errors.New("purchase order is not open for receiving")
	}
	lines, err := s.queries.ListReceiptPurchaseOrderLines(ctx, db.ListReceiptPurchaseOrderLinesParams{WorkspaceID: ws, PurchaseOrderID: purchaseOrderID})
	if err != nil {
		return nil, err
	}
	received, err := s.queries.ListReceivedQuantityByPurchaseOrderLine(ctx, db.ListReceivedQuantityByPurchaseOrderLineParams{WorkspaceID: ws, PurchaseOrderID: pgtype.Int8{Int64: purchaseOrderID, Valid: true}})
	if err != nil {
		return nil, err
	}
	prior := map[int64]decimal.Decimal{}
	for _, row := range received {
		if row.PurchaseOrderLineID.Valid {
			prior[row.PurchaseOrderLineID.Int64] = row.ReceivedQuantity
		}
	}
	out := make([]ReceiptOptionLine, 0, len(lines))
	for _, line := range lines {
		if remaining := line.Quantity.Sub(prior[line.ID]); remaining.GreaterThan(decimal.Zero) {
			out = append(out, ReceiptOptionLine{PurchaseOrderLineID: line.ID, Description: line.Description, RemainingQuantity: remaining.StringFixed(4)})
		}
	}
	return out, nil
}

func parseOptionalNonNegativeDecimal(input string) (decimal.Decimal, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" || trimmed == "0" || trimmed == "0.0" || trimmed == "0.00" || trimmed == "0.0000" {
		return decimal.Zero, nil
	}
	d, _, err := parseRequestQuantity(trimmed)
	return d, err
}

func normalizeSerialNumbers(raw []string) []string {
	var out []string
	for _, s := range raw {
		t := strings.TrimSpace(s)
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}

func effectiveUnitCost(totalMinor int64, qty decimal.Decimal, fallback int64) int64 {
	if !qty.GreaterThan(decimal.Zero) || totalMinor <= 0 {
		return fallback
	}
	scaled := qty.Shift(4).BigInt()
	if scaled == nil || scaled.Sign() <= 0 {
		return fallback
	}
	num := new(big.Int).Mul(big.NewInt(totalMinor), big.NewInt(10_000))
	half := new(big.Int).Quo(scaled, big.NewInt(2))
	num.Add(num, half)
	num.Quo(num, scaled)
	if !num.IsInt64() {
		return fallback
	}
	return num.Int64()
}

type preparedReceiptLine struct {
	poLineID        pgtype.Int8
	productID       pgtype.Int8
	productKind     string
	description     string
	acceptedQty     decimal.Decimal
	rejectedQty     decimal.Decimal
	unitCost        int64
	baseTotal       int64
	landedCostMinor int64
	effectiveUnit   int64
	batchNumber     string
	expiryDate      pgtype.Date
	serialNumbers   []string
	notes           string
}

func allocateLandedCost(lines []preparedReceiptLine, headerLandedMinor int64) {
	if headerLandedMinor <= 0 || len(lines) == 0 {
		return
	}
	var baseSum int64
	largestIdx := -1
	for i := range lines {
		if lines[i].baseTotal > 0 {
			baseSum += lines[i].baseTotal
			if largestIdx == -1 || lines[i].baseTotal > lines[largestIdx].baseTotal {
				largestIdx = i
			}
		}
	}
	if baseSum <= 0 || largestIdx == -1 {
		return
	}
	var assigned int64
	for i := range lines {
		if lines[i].baseTotal <= 0 {
			continue
		}
		share := new(big.Int).Mul(big.NewInt(headerLandedMinor), big.NewInt(lines[i].baseTotal))
		share.Quo(share, big.NewInt(baseSum))
		v := share.Int64()
		lines[i].landedCostMinor = v
		assigned += v
	}
	lines[largestIdx].landedCostMinor += headerLandedMinor - assigned
}

func (s *Service) CreateGoodsReceipt(ctx context.Context, ws, user int64, in CreateGoodsReceiptInput) (GoodsReceiptView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	in.ReceiptReference = strings.TrimSpace(in.ReceiptReference)
	in.DeliveryReference = strings.TrimSpace(in.DeliveryReference)
	in.Reason = strings.TrimSpace(in.Reason)
	if key == "" || len(key) > 200 || len(in.Lines) == 0 || len(in.Lines) > 100 {
		return GoodsReceiptView{}, errors.New("receipt lines and idempotency key are required")
	}
	isUnplanned := in.PurchaseOrderID <= 0
	if isUnplanned && in.SupplierID <= 0 {
		return GoodsReceiptView{}, errors.New("unplanned receipt requires a supplier")
	}
	date, err := time.Parse("2006-01-02", strings.TrimSpace(in.ReceivedOn))
	if err != nil {
		return GoodsReceiptView{}, errors.New("received date must be YYYY-MM-DD")
	}
	if existing, e := s.queries.GetGoodsReceiptByIdempotency(ctx, db.GetGoodsReceiptByIdempotencyParams{WorkspaceID: ws, IdempotencyKey: key}); e == nil {
		var existingPO int64
		if existing.PurchaseOrderID.Valid {
			existingPO = existing.PurchaseOrderID.Int64
		}
		if existingPO != in.PurchaseOrderID {
			return GoodsReceiptView{}, ErrDuplicateIdempotent
		}
		return GoodsReceiptView{
			ID:                existing.ID,
			PurchaseOrderID:   existingPO,
			SupplierID:        nullableInt8(existing.SupplierID),
			LocationID:        nullableInt8(existing.LocationID),
			SourceType:        existing.SourceType,
			ReceivedOn:        existing.ReceivedOn.Time.Format("2006-01-02"),
			Currency:          existing.Currency,
			CurrencyExponent:  existing.CurrencyExponent,
			LandedCostMinor:   fmt.Sprint(existing.LandedCostMinor),
			DeliveryReference: nullableText(existing.DeliveryReference),
			ServiceAccepted:   existing.ServiceAccepted,
		}, nil
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return GoodsReceiptView{}, e
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return GoodsReceiptView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	policy, polErr := q.GetProcurementApprovalPolicy(ctx, ws)
	if errors.Is(polErr, pgx.ErrNoRows) {
		policy = db.ProcurementApprovalPolicy{AllowSelfApproval: true, AllowUnplannedReceipt: true, AllowOverReceipt: false}
	} else if polErr != nil {
		return GoodsReceiptView{}, polErr
	}

	location, err := inventoryLocationFor(ctx, q, ws, in.LocationID)
	if err != nil {
		return GoodsReceiptView{}, err
	}

	var po db.PurchaseOrder
	var poValid bool
	var supplierID pgtype.Int8
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	var exponent int32 = 2

	if !isUnplanned {
		po, err = q.GetPurchaseOrderForUpdate(ctx, db.GetPurchaseOrderForUpdateParams{WorkspaceID: ws, ID: in.PurchaseOrderID})
		if errors.Is(err, pgx.ErrNoRows) {
			return GoodsReceiptView{}, ErrNotFound
		}
		if err != nil {
			return GoodsReceiptView{}, err
		}
		if po.Status != "issued" && po.Status != "acknowledged" && po.Status != "partially_received" {
			return GoodsReceiptView{}, errors.New("purchase order must be issued before receiving")
		}
		poValid = true
		supplierID = po.SupplierID
		currency = po.Currency
		exponent = po.CurrencyExponent
	} else {
		if !policy.AllowUnplannedReceipt {
			return GoodsReceiptView{}, errors.New("unplanned receipts are disabled by workspace procurement policy")
		}
		party, partyErr := s.GetCounterparty(ctx, ws, in.SupplierID)
		if partyErr != nil || (party.PartyType != "supplier" && party.PartyType != "both") {
			return GoodsReceiptView{}, ErrForbiddenParty
		}
		supplierID = pgtype.Int8{Int64: party.ID, Valid: true}
		if currency == "" {
			currency = "NGN"
		}
		if len(currency) != 3 {
			return GoodsReceiptView{}, ErrInvalidCurrency
		}
		exponent = int32(CurrencyExponent(currency))
	}

	if _, err = q.CreateInventoryCostingSettings(ctx, db.CreateInventoryCostingSettingsParams{WorkspaceID: ws, Currency: currency}); err != nil {
		return GoodsReceiptView{}, err
	}

	landedCostMinor, err := parseOptionalNonNegativeMajor(in.LandedCost, int(exponent))
	if err != nil || landedCostMinor < 0 {
		return GoodsReceiptView{}, errors.New("landed cost is invalid")
	}

	prepared := make([]preparedReceiptLine, 0, len(in.Lines))
	var previous map[int64]decimal.Decimal
	var poLines []db.GetReceiptPurchaseOrderLinesForUpdateRow

	if poValid {
		poLines, err = q.GetReceiptPurchaseOrderLinesForUpdate(ctx, db.GetReceiptPurchaseOrderLinesForUpdateParams{WorkspaceID: ws, PurchaseOrderID: po.ID})
		if err != nil {
			return GoodsReceiptView{}, fmt.Errorf("load purchase order receipt lines: %w", err)
		}
		if len(poLines) == 0 {
			return GoodsReceiptView{}, errors.New("purchase order has no receivable lines")
		}
		received, err := q.ListReceivedQuantityByPurchaseOrderLine(ctx, db.ListReceivedQuantityByPurchaseOrderLineParams{WorkspaceID: ws, PurchaseOrderID: pgtype.Int8{Int64: po.ID, Valid: true}})
		if err != nil {
			return GoodsReceiptView{}, err
		}
		previous = map[int64]decimal.Decimal{}
		for _, row := range received {
			if row.PurchaseOrderLineID.Valid {
				previous[row.PurchaseOrderLineID.Int64] = row.ReceivedQuantity
			}
		}
		byID := map[int64]db.GetReceiptPurchaseOrderLinesForUpdateRow{}
		for _, line := range poLines {
			byID[line.ID] = line
		}
		seen := map[int64]bool{}
		for _, input := range in.Lines {
			line, ok := byID[input.PurchaseOrderLineID]
			if !ok || seen[line.ID] {
				return GoodsReceiptView{}, errors.New("receipt line does not belong to this purchase order")
			}
			seen[line.ID] = true
			acceptedQty, err := parseOptionalNonNegativeDecimal(input.AcceptedQuantity)
			if err != nil {
				return GoodsReceiptView{}, err
			}
			rejectedQty, err := parseOptionalNonNegativeDecimal(input.RejectedQuantity)
			if err != nil {
				return GoodsReceiptView{}, errors.New("rejected quantity must be a valid non-negative decimal")
			}
			if acceptedQty.IsZero() && rejectedQty.IsZero() {
				return GoodsReceiptView{}, errors.New("receipt line must have accepted or rejected quantity greater than zero")
			}
			if !policy.AllowOverReceipt && previous[line.ID].Add(acceptedQty).GreaterThan(line.Quantity) {
				return GoodsReceiptView{}, errors.New("receipt quantity exceeds the open purchase order quantity")
			}
			serials := normalizeSerialNumbers(input.SerialNumbers)
			if len(serials) > 0 && (!acceptedQty.Equal(acceptedQty.Truncate(0)) || int64(len(serials)) != acceptedQty.IntPart()) {
				return GoodsReceiptView{}, errors.New("serial number count must match whole accepted quantity")
			}
			expiry, err := optionalDate(input.ExpiryDate)
			if err != nil {
				return GoodsReceiptView{}, errors.New("expiry date must use YYYY-MM-DD")
			}
			unitCost := line.ExpectedUnitCostMinor
			if strings.TrimSpace(input.ActualUnitCost) != "" {
				unitCost, err = parseOptionalNonNegativeMajor(input.ActualUnitCost, int(exponent))
				if err != nil || unitCost < 0 {
					return GoodsReceiptView{}, errors.New("actual unit cost is invalid")
				}
			}
			var lineTotal int64
			if acceptedQty.GreaterThan(decimal.Zero) {
				if unitCost > 0 {
					lineTotal, err = requestLineTotal(unitCost, acceptedQty)
					if err != nil {
						return GoodsReceiptView{}, err
					}
				}
			}
			prepared = append(prepared, preparedReceiptLine{
				poLineID:      pgtype.Int8{Int64: line.ID, Valid: true},
				productID:     line.ProductID,
				productKind:   line.ProductKind,
				description:   line.Description,
				acceptedQty:   acceptedQty,
				rejectedQty:   rejectedQty,
				unitCost:      unitCost,
				baseTotal:     lineTotal,
				batchNumber:   strings.TrimSpace(input.BatchNumber),
				expiryDate:    expiry,
				serialNumbers: serials,
				notes:         strings.TrimSpace(input.Notes),
			})
		}
	} else {
		for _, input := range in.Lines {
			acceptedQty, err := parseOptionalNonNegativeDecimal(input.AcceptedQuantity)
			if err != nil {
				return GoodsReceiptView{}, err
			}
			rejectedQty, err := parseOptionalNonNegativeDecimal(input.RejectedQuantity)
			if err != nil {
				return GoodsReceiptView{}, errors.New("rejected quantity must be a valid non-negative decimal")
			}
			if acceptedQty.IsZero() && rejectedQty.IsZero() {
				return GoodsReceiptView{}, errors.New("receipt line must have accepted or rejected quantity greater than zero")
			}
			serials := normalizeSerialNumbers(input.SerialNumbers)
			if len(serials) > 0 && (!acceptedQty.Equal(acceptedQty.Truncate(0)) || int64(len(serials)) != acceptedQty.IntPart()) {
				return GoodsReceiptView{}, errors.New("serial number count must match whole accepted quantity")
			}
			expiry, err := optionalDate(input.ExpiryDate)
			if err != nil {
				return GoodsReceiptView{}, errors.New("expiry date must use YYYY-MM-DD")
			}
			desc := strings.TrimSpace(input.Description)
			var prodID pgtype.Int8
			prodKind := "service"
			if input.ProductID != nil && *input.ProductID > 0 {
				p, err := q.GetProductByID(ctx, db.GetProductByIDParams{ID: *input.ProductID, WorkspaceID: ws})
				if err != nil {
					return GoodsReceiptView{}, ErrForbiddenProduct
				}
				prodID = pgtype.Int8{Int64: p.ID, Valid: true}
				prodKind = p.Kind
				if desc == "" {
					desc = p.Name
				}
			}
			if desc == "" {
				return GoodsReceiptView{}, errors.New("unplanned receipt line requires description or product")
			}
			unitCost, err := parseOptionalNonNegativeMajor(input.ActualUnitCost, int(exponent))
			if err != nil || unitCost < 0 {
				return GoodsReceiptView{}, errors.New("actual unit cost is invalid")
			}
			var lineTotal int64
			if acceptedQty.GreaterThan(decimal.Zero) && unitCost > 0 {
				lineTotal, err = requestLineTotal(unitCost, acceptedQty)
				if err != nil {
					return GoodsReceiptView{}, err
				}
			}
			prepared = append(prepared, preparedReceiptLine{
				productID:     prodID,
				productKind:   prodKind,
				description:   desc,
				acceptedQty:   acceptedQty,
				rejectedQty:   rejectedQty,
				unitCost:      unitCost,
				baseTotal:     lineTotal,
				batchNumber:   strings.TrimSpace(input.BatchNumber),
				expiryDate:    expiry,
				serialNumbers: serials,
				notes:         strings.TrimSpace(input.Notes),
			})
		}
	}

	allocateLandedCost(prepared, landedCostMinor)

	var stockTotal, expenseTotal int64
	for i := range prepared {
		lineTotalWithLanded := prepared[i].baseTotal + prepared[i].landedCostMinor
		prepared[i].effectiveUnit = effectiveUnitCost(lineTotalWithLanded, prepared[i].acceptedQty, prepared[i].unitCost)
		var addErr error
		if prepared[i].productKind == "stock_tracked" {
			stockTotal, addErr = CheckedAdd(stockTotal, lineTotalWithLanded)
		} else {
			expenseTotal, addErr = CheckedAdd(expenseTotal, lineTotalWithLanded)
		}
		if addErr != nil {
			return GoodsReceiptView{}, addErr
		}
	}

	sourceType := "po"
	var poIDParam pgtype.Int8
	if poValid {
		poIDParam = pgtype.Int8{Int64: po.ID, Valid: true}
	} else {
		sourceType = "unplanned"
	}

	receipt, err := q.CreateExtendedGoodsReceipt(ctx, db.CreateExtendedGoodsReceiptParams{
		WorkspaceID:       ws,
		PurchaseOrderID:   poIDParam,
		SupplierID:        supplierID,
		SourceType:        sourceType,
		Reason:            optionalPgText(in.Reason),
		Currency:          currency,
		CurrencyExponent:  exponent,
		ReceiptReference:  optionalPgText(in.ReceiptReference),
		DeliveryReference: optionalPgText(in.DeliveryReference),
		ServiceAccepted:   in.ServiceAccepted,
		ReceivedOn:        pgtype.Date{Time: date, Valid: true},
		IdempotencyKey:    key,
		CreatedByUserID:   user,
		LocationID:        pgtype.Int8{Int64: location.ID, Valid: true},
		LandedCostMinor:   landedCostMinor,
	})
	if err != nil {
		return GoodsReceiptView{}, err
	}

	for _, item := range prepared {
		rl, e := q.CreateExtendedGoodsReceiptLine(ctx, db.CreateExtendedGoodsReceiptLineParams{
			WorkspaceID:            ws,
			GoodsReceiptID:         receipt.ID,
			PurchaseOrderLineID:    item.poLineID,
			ProductID:              item.productID,
			Description:            optionalPgText(item.description),
			AcceptedQuantity:       item.acceptedQty,
			RejectedQuantity:       item.rejectedQty,
			UnitCostMinor:          item.unitCost,
			ActualUnitCostMinor:    pgtype.Int8{Int64: item.unitCost, Valid: true},
			LandedCostMinor:        item.landedCostMinor,
			EffectiveUnitCostMinor: pgtype.Int8{Int64: item.effectiveUnit, Valid: true},
			LineTotalMinor:         item.baseTotal,
			BatchNumber:            optionalPgText(item.batchNumber),
			ExpiryDate:             item.expiryDate,
			SerialNumbers:          item.serialNumbers,
			LineNotes:              optionalPgText(item.notes),
		})
		if e != nil {
			return GoodsReceiptView{}, e
		}
		if item.productKind == "stock_tracked" && item.acceptedQty.GreaterThan(decimal.Zero) {
			if !item.productID.Valid {
				return GoodsReceiptView{}, errors.New("stock-tracked receipt line requires product")
			}
			valDelta := item.baseTotal + item.landedCostMinor
			if e = q.CreateInventoryReceiptMovement(ctx, db.CreateInventoryReceiptMovementParams{
				WorkspaceID:        ws,
				ProductID:          item.productID.Int64,
				GoodsReceiptLineID: pgtype.Int8{Int64: rl.ID, Valid: true},
				LocationID:         pgtype.Int8{Int64: location.ID, Valid: true},
				SourceID:           pgtype.Int8{Int64: receipt.ID, Valid: true},
				QuantityDelta:      item.acceptedQty,
				ValueDeltaMinor:    valDelta,
				OccurredOn:         pgtype.Date{Time: date, Valid: true},
			}); e != nil {
				return GoodsReceiptView{}, e
			}
			if _, e = q.UpsertInventoryBalance(ctx, db.UpsertInventoryBalanceParams{
				WorkspaceID:      ws,
				LocationID:       location.ID,
				ProductID:        item.productID.Int64,
				QuantityOnHand:   item.acceptedQty,
				ValueOnHandMinor: valDelta,
			}); e != nil {
				return GoodsReceiptView{}, e
			}
		}
	}

	poStatus := "unplanned"
	var poIDOut int64
	if poValid {
		allComplete := true
		for _, item := range prepared {
			if item.poLineID.Valid {
				previous[item.poLineID.Int64] = previous[item.poLineID.Int64].Add(item.acceptedQty)
			}
		}
		for _, line := range poLines {
			if previous[line.ID].LessThan(line.Quantity) {
				allComplete = false
				break
			}
		}
		status := "partially_received"
		if allComplete {
			status = "fully_received"
		}
		updated, err := q.UpdatePurchaseOrderReceiptStatus(ctx, db.UpdatePurchaseOrderReceiptStatusParams{WorkspaceID: ws, ID: po.ID, Status: status})
		if err != nil {
			return GoodsReceiptView{}, err
		}
		poStatus = updated.Status
		poIDOut = po.ID
	}

	total, err := CheckedAdd(stockTotal, expenseTotal)
	if err != nil {
		return GoodsReceiptView{}, err
	}
	if total > 0 {
		if err = s.postReceiptGRNI(ctx, q, ws, receipt, currency, exponent, date, stockTotal, expenseTotal, total); err != nil {
			return GoodsReceiptView{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return GoodsReceiptView{}, err
	}
	return GoodsReceiptView{
		ID:                  receipt.ID,
		PurchaseOrderID:     poIDOut,
		SupplierID:          nullableInt8(receipt.SupplierID),
		LocationID:          nullableInt8(receipt.LocationID),
		SourceType:          receipt.SourceType,
		Reason:              nullableText(receipt.Reason),
		PurchaseOrderStatus: poStatus,
		ReceivedOn:          date.Format("2006-01-02"),
		Currency:            currency,
		CurrencyExponent:    exponent,
		TotalMinor:          fmt.Sprintf("%d", total),
		LandedCostMinor:     fmt.Sprintf("%d", landedCostMinor),
		DeliveryReference:   nullableText(receipt.DeliveryReference),
		ServiceAccepted:     receipt.ServiceAccepted,
	}, nil
}

func (s *Service) GetGoodsReceipt(ctx context.Context, ws, id int64) (GoodsReceiptDetailView, error) {
	row, err := s.queries.GetGoodsReceiptDetail(ctx, db.GetGoodsReceiptDetailParams{WorkspaceID: ws, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return GoodsReceiptDetailView{}, ErrNotFound
	}
	if err != nil {
		return GoodsReceiptDetailView{}, err
	}
	var rawLines []struct {
		ID                     int64           `json:"id"`
		PurchaseOrderLineID    *int64          `json:"purchase_order_line_id"`
		ProductID              *int64          `json:"product_id"`
		Description            *string         `json:"description"`
		AcceptedQuantity       json.RawMessage `json:"accepted_quantity"`
		RejectedQuantity       json.RawMessage `json:"rejected_quantity"`
		UnitCostMinor          json.RawMessage `json:"unit_cost_minor"`
		ActualUnitCostMinor    json.RawMessage `json:"actual_unit_cost_minor"`
		LandedCostMinor        json.RawMessage `json:"landed_cost_minor"`
		EffectiveUnitCostMinor json.RawMessage `json:"effective_unit_cost_minor"`
		LineTotalMinor         json.RawMessage `json:"line_total_minor"`
		BatchNumber            *string         `json:"batch_number"`
		ExpiryDate             *string         `json:"expiry_date"`
		SerialNumbers          []string        `json:"serial_numbers"`
		LineNotes              *string         `json:"line_notes"`
	}
	var payload []byte
	switch v := row.Lines.(type) {
	case []byte:
		payload = v
	case string:
		payload = []byte(v)
	case nil:
	default:
		if marshaled, mErr := json.Marshal(v); mErr == nil {
			payload = marshaled
		}
	}
	if len(payload) > 0 {
		if err := json.Unmarshal(payload, &rawLines); err != nil {
			return GoodsReceiptDetailView{}, err
		}
	}
	lines := make([]GoodsReceiptLineView, 0, len(rawLines))
	var totalMinor int64
	for _, rl := range rawLines {
		var poLineID int64
		if rl.PurchaseOrderLineID != nil {
			poLineID = *rl.PurchaseOrderLineID
		}
		desc := ""
		if rl.Description != nil {
			desc = *rl.Description
		}
		lineTotalStr := jsonRawScalarString(rl.LineTotalMinor)
		if lt, parseErr := strconvParseIntSafe(lineTotalStr); parseErr == nil {
			totalMinor += lt
		}
		lines = append(lines, GoodsReceiptLineView{
			ID:                     rl.ID,
			PurchaseOrderLineID:    poLineID,
			ProductID:              rl.ProductID,
			Description:            desc,
			AcceptedQuantity:       jsonRawScalarString(rl.AcceptedQuantity),
			RejectedQuantity:       jsonRawScalarString(rl.RejectedQuantity),
			UnitCostMinor:          jsonRawScalarString(rl.UnitCostMinor),
			ActualUnitCostMinor:    jsonRawScalarString(rl.ActualUnitCostMinor),
			LandedCostMinor:        jsonRawScalarString(rl.LandedCostMinor),
			EffectiveUnitCostMinor: jsonRawScalarString(rl.EffectiveUnitCostMinor),
			LineTotalMinor:         lineTotalStr,
			BatchNumber:            rl.BatchNumber,
			ExpiryDate:             rl.ExpiryDate,
			SerialNumbers:          rl.SerialNumbers,
			Notes:                  rl.LineNotes,
		})
	}
	var poID int64
	if row.PurchaseOrderID.Valid {
		poID = row.PurchaseOrderID.Int64
	}
	return GoodsReceiptDetailView{
		GoodsReceiptView: GoodsReceiptView{
			ID:                row.ID,
			PurchaseOrderID:   poID,
			SupplierID:        nullableInt8(row.SupplierID),
			LocationID:        nullableInt8(row.LocationID),
			SourceType:        row.SourceType,
			Reason:            nullableText(row.Reason),
			ReceivedOn:        row.ReceivedOn.Time.Format("2006-01-02"),
			Currency:          row.Currency,
			CurrencyExponent:  row.CurrencyExponent,
			TotalMinor:        fmt.Sprint(totalMinor + row.LandedCostMinor),
			LandedCostMinor:   fmt.Sprint(row.LandedCostMinor),
			DeliveryReference: nullableText(row.DeliveryReference),
			ServiceAccepted:   row.ServiceAccepted,
		},
		ReceiptReference: nullableText(row.ReceiptReference),
		Lines:            lines,
	}, nil
}

func jsonRawScalarString(raw json.RawMessage) string {
	s := strings.TrimSpace(string(raw))
	s = strings.Trim(s, `"`)
	if s == "" || s == "null" {
		return "0"
	}
	return s
}

func strconvParseIntSafe(s string) (int64, error) {
	d, err := decimal.NewFromString(s)
	if err != nil {
		return 0, err
	}
	return d.IntPart(), nil
}

func (s *Service) postReceiptGRNI(ctx context.Context, q *db.Queries, ws int64, receipt db.GoodsReceipt, currency string, exponent int32, date time.Time, stock, expense, total int64) error {
	entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: ws, SourceType: "goods_receipt", SourceID: receipt.ID, EntryDate: pgtype.Date{Time: date, Valid: true}, Currency: currency, CurrencyExponent: exponent, Description: optionalPgText("Goods receipt / GRNI")})
	if err != nil {
		return err
	}
	if stock > 0 {
		if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "asset", DebitMinor: stock, Description: optionalPgText("Inventory received")}); err != nil {
			return err
		}
	}
	if expense > 0 {
		if _, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "expense", DebitMinor: expense, Description: optionalPgText("Non-stock or service received")}); err != nil {
			return err
		}
	}
	if total <= 0 {
		return ErrLedgerUnbalanced
	}
	_, err = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "liability", CreditMinor: total, Description: optionalPgText("Goods received not invoiced")})
	return err
}
