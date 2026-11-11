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

var ErrDuplicateBill = errors.New("duplicate supplier invoice number")

type SupplierBillLineInput struct {
	GoodsReceiptLineID  int64  `json:"goods_receipt_line_id"`
	PurchaseOrderLineID int64  `json:"purchase_order_line_id"`
	Description         string `json:"description"`
	Quantity            string `json:"quantity"`
	UnitCost            string `json:"unit_cost"`
	Discount            string `json:"discount"`
	TaxAmount           string `json:"tax_amount"`
}

type CreateSupplierBillInput struct {
	GoodsReceiptID        int64                   `json:"goods_receipt_id"`
	SupplierID            int64                   `json:"supplier_id"`
	OutletID              *int64                  `json:"outlet_id"`
	SupplierInvoiceNumber string                  `json:"supplier_invoice_number"`
	BillDate              string                  `json:"bill_date"`
	DueDate               string                  `json:"due_date"`
	Amount                string                  `json:"amount"`
	TaxAmount             string                  `json:"tax_amount"`
	Discount              string                  `json:"discount"`
	Currency              string                  `json:"currency"`
	BillType              string                  `json:"bill_type"`
	ExpenseAccountClass   string                  `json:"expense_account_class"`
	Description           string                  `json:"description"`
	Lines                 []SupplierBillLineInput `json:"lines"`
	IdempotencyKey        string                  `json:"idempotency_key"`
}

type SupplierBillCommandInput struct {
	ExpectedVersion int32  `json:"expected_version"`
	AcceptVariance  bool   `json:"accept_variance"`
	Reason          string `json:"reason"`
	IdempotencyKey  string `json:"idempotency_key"`
}

type ApplySupplierCreditToBillInput struct {
	SupplierCreditID    int64  `json:"supplier_credit_id"`
	Amount              string `json:"amount"`
	ExpectedBillVersion int32  `json:"expected_bill_version"`
	IdempotencyKey      string `json:"idempotency_key"`
}

type SupplierBillLineView struct {
	ID                  int64  `json:"id"`
	GoodsReceiptLineID  *int64 `json:"goods_receipt_line_id,omitempty"`
	PurchaseOrderLineID *int64 `json:"purchase_order_line_id,omitempty"`
	Description         string `json:"description"`
	Quantity            string `json:"quantity"`
	UnitCostMinor       string `json:"unit_cost_minor"`
	DiscountMinor       string `json:"discount_minor"`
	TaxAmountMinor      string `json:"tax_amount_minor"`
	LineTotalMinor      string `json:"line_total_minor"`
}

type SupplierBillView struct {
	ID                    int64                  `json:"id"`
	GoodsReceiptID        int64                  `json:"goods_receipt_id"`
	SupplierID            int64                  `json:"supplier_id"`
	OutletID              *int64                 `json:"outlet_id,omitempty"`
	SupplierInvoiceNumber string                 `json:"supplier_invoice_number"`
	BillDate              string                 `json:"bill_date"`
	Status                string                 `json:"status"`
	Version               int32                  `json:"version"`
	Currency              string                 `json:"currency"`
	CurrencyExponent      int32                  `json:"currency_exponent"`
	TotalMinor            string                 `json:"total_minor"`
	OutstandingMinor      string                 `json:"outstanding_minor"`
	TaxAmountMinor        string                 `json:"tax_amount_minor"`
	DiscountMinor         string                 `json:"discount_minor"`
	VarianceMinor         string                 `json:"variance_minor"`
	CreditedMinor         string                 `json:"credited_minor"`
	MatchStatus           string                 `json:"match_status"`
	DisputeReason         *string                `json:"dispute_reason,omitempty"`
	ReversalReason        *string                `json:"reversal_reason,omitempty"`
	GoodsReceiptLinked    bool                   `json:"goods_receipt_linked"`
	BillType              string                 `json:"bill_type"`
	DueDate               *string                `json:"due_date,omitempty"`
	Overdue               bool                   `json:"overdue"`
	Lines                 []SupplierBillLineView `json:"lines,omitempty"`
}

type SupplierBillMatch struct {
	BillID          int64  `json:"bill_id"`
	ReceiptID       int64  `json:"receipt_id"`
	OrderedMinor    string `json:"ordered_minor"`
	ReceivedMinor   string `json:"received_minor"`
	BilledMinor     string `json:"billed_minor"`
	Result          string `json:"result"`
	RequiresReview  bool   `json:"requires_review"`
	OpenToBillMinor string `json:"open_to_bill_minor"`
	VarianceMinor   string `json:"variance_minor"`
}

func billView(b db.SupplierBill) SupplierBillView {
	var receiptID int64
	linked := b.GoodsReceiptID.Valid
	if linked {
		receiptID = b.GoodsReceiptID.Int64
	}
	var due *string
	if b.DueDate.Valid {
		value := b.DueDate.Time.Format("2006-01-02")
		due = &value
	}
	billDate := ""
	if b.BillDate.Valid {
		billDate = b.BillDate.Time.Format("2006-01-02")
	}
	return SupplierBillView{
		ID:                    b.ID,
		GoodsReceiptID:        receiptID,
		SupplierID:            b.SupplierID,
		OutletID:              nullableInt8(b.OutletID),
		SupplierInvoiceNumber: b.SupplierInvoiceNumber,
		BillDate:              billDate,
		GoodsReceiptLinked:    linked,
		BillType:              b.BillType,
		DueDate:               due,
		Overdue:               b.DueDate.Valid && b.DueDate.Time.Before(time.Now().UTC()) && (b.Status == "approved" || b.Status == "partially_paid"),
		Status:                b.Status,
		Version:               b.Version,
		Currency:              b.Currency,
		CurrencyExponent:      b.CurrencyExponent,
		TotalMinor:            fmt.Sprintf("%d", b.TotalMinor),
		OutstandingMinor:      fmt.Sprintf("%d", b.OutstandingMinor),
		TaxAmountMinor:        fmt.Sprintf("%d", b.TaxAmountMinor),
		DiscountMinor:         fmt.Sprintf("%d", b.DiscountMinor),
		VarianceMinor:         fmt.Sprintf("%d", b.VarianceMinor),
		CreditedMinor:         fmt.Sprintf("%d", b.CreditedMinor),
		MatchStatus:           b.MatchStatus,
		DisputeReason:         nullableText(b.DisputeReason),
		ReversalReason:        nullableText(b.ReversalReason),
	}
}

func billDetailView(ctx context.Context, q *db.Queries, b db.SupplierBill) (SupplierBillView, error) {
	view := billView(b)
	lines, err := q.ListSupplierBillLines(ctx, db.ListSupplierBillLinesParams{WorkspaceID: b.WorkspaceID, SupplierBillID: b.ID})
	if err == nil && len(lines) > 0 {
		view.Lines = make([]SupplierBillLineView, 0, len(lines))
		for _, l := range lines {
			view.Lines = append(view.Lines, SupplierBillLineView{
				ID:                  l.ID,
				GoodsReceiptLineID:  nullableInt8(l.GoodsReceiptLineID),
				PurchaseOrderLineID: nullableInt8(l.PurchaseOrderLineID),
				Description:         l.Description,
				Quantity:            l.Quantity.String(),
				UnitCostMinor:       fmt.Sprint(l.UnitCostMinor),
				DiscountMinor:       fmt.Sprint(l.DiscountMinor),
				TaxAmountMinor:      fmt.Sprint(l.TaxAmountMinor),
				LineTotalMinor:      fmt.Sprint(l.LineTotalMinor),
			})
		}
	}
	return view, nil
}

type preparedBillLine struct {
	grLineID       pgtype.Int8
	poLineID       pgtype.Int8
	description    string
	qty            decimal.Decimal
	unitCostMinor  int64
	discountMinor  int64
	taxAmountMinor int64
	lineTotalMinor int64
	grniPortion    int64
}

func (s *Service) GetSupplierBill(ctx context.Context, ws, id int64) (SupplierBillView, error) {
	b, err := s.queries.GetSupplierBill(ctx, db.GetSupplierBillParams{WorkspaceID: ws, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return SupplierBillView{}, ErrNotFound
	}
	if err != nil {
		return SupplierBillView{}, err
	}
	return billDetailView(ctx, s.queries, b)
}

func (s *Service) CreateSupplierBill(ctx context.Context, ws, user int64, in CreateSupplierBillInput) (SupplierBillView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	invoice := strings.TrimSpace(in.SupplierInvoiceNumber)
	date, e := time.Parse("2006-01-02", strings.TrimSpace(in.BillDate))
	if key == "" || invoice == "" || e != nil {
		return SupplierBillView{}, errors.New("supplier invoice number, bill date and idempotency key are required")
	}
	if old, e := s.queries.GetSupplierBillByIdempotency(ctx, db.GetSupplierBillByIdempotencyParams{WorkspaceID: ws, IdempotencyKey: key}); e == nil {
		return billDetailView(ctx, s.queries, old)
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return SupplierBillView{}, e
	}
	var due pgtype.Date
	if strings.TrimSpace(in.DueDate) != "" {
		v, x := time.Parse("2006-01-02", in.DueDate)
		if x != nil {
			return SupplierBillView{}, errors.New("due date must be YYYY-MM-DD")
		}
		due = pgtype.Date{Time: v, Valid: true}
	}

	if in.GoodsReceiptID > 0 {
		source, sourceErr := s.queries.GetReceiptBillSource(ctx, db.GetReceiptBillSourceParams{WorkspaceID: ws, ID: in.GoodsReceiptID})
		if errors.Is(sourceErr, pgx.ErrNoRows) {
			return SupplierBillView{}, ErrNotFound
		}
		if sourceErr != nil || !source.SupplierID.Valid {
			return SupplierBillView{}, errors.New("receipt must have a supplier before billing")
		}
		if _, dupErr := s.queries.FindDuplicateSupplierBill(ctx, db.FindDuplicateSupplierBillParams{
			WorkspaceID: ws,
			SupplierID:  source.SupplierID.Int64,
			Btrim:       invoice,
		}); dupErr == nil {
			return SupplierBillView{}, ErrDuplicateBill
		} else if !errors.Is(dupErr, pgx.ErrNoRows) {
			return SupplierBillView{}, dupErr
		}
		receiptLines, err := s.queries.GetGoodsReceiptLinesByReceipt(ctx, db.GetGoodsReceiptLinesByReceiptParams{
			WorkspaceID:    ws,
			GoodsReceiptID: in.GoodsReceiptID,
		})
		if err != nil {
			return SupplierBillView{}, err
		}
		if len(receiptLines) == 0 {
			return SupplierBillView{}, errors.New("goods receipt has no billable lines")
		}
		byReceiptLine := map[int64]db.GoodsReceiptLine{}
		for _, rl := range receiptLines {
			byReceiptLine[rl.ID] = rl
		}
		exponent := int(source.CurrencyExponent)
		prepared := make([]preparedBillLine, 0)
		var totalMinor, totalTax, totalDiscount, grniExpected int64
		if len(in.Lines) == 0 {
			for _, rl := range receiptLines {
				if rl.AcceptedQuantity.IsZero() {
					continue
				}
				prev, err := s.queries.SumPreviouslyBilledForReceiptLine(ctx, db.SumPreviouslyBilledForReceiptLineParams{
					WorkspaceID:        ws,
					GoodsReceiptLineID: pgtype.Int8{Int64: rl.ID, Valid: true},
				})
				if err != nil {
					return SupplierBillView{}, err
				}
				remQty := rl.AcceptedQuantity.Sub(prev.BilledQuantity)
				if !remQty.GreaterThan(decimal.Zero) {
					continue
				}
				var lineTotal int64
				if remQty.Equal(rl.AcceptedQuantity) {
					lineTotal = rl.LineTotalMinor
				} else {
					lineTotal, err = requestLineTotal(rl.UnitCostMinor, remQty)
					if err != nil {
						return SupplierBillView{}, err
					}
				}
				desc := "Receipt item"
				if rl.Description.Valid && strings.TrimSpace(rl.Description.String) != "" {
					desc = rl.Description.String
				}
				totalMinor += lineTotal
				grniExpected += lineTotal
				prepared = append(prepared, preparedBillLine{
					grLineID:       pgtype.Int8{Int64: rl.ID, Valid: true},
					poLineID:       rl.PurchaseOrderLineID,
					description:    desc,
					qty:            remQty,
					unitCostMinor:  rl.UnitCostMinor,
					lineTotalMinor: lineTotal,
					grniPortion:    lineTotal,
				})
			}
			if len(prepared) == 0 {
				return SupplierBillView{}, errors.New("goods receipt has already been fully billed")
			}
		} else {
			for _, raw := range in.Lines {
				qty, _, err := parseRequestQuantity(raw.Quantity)
				if err != nil {
					return SupplierBillView{}, err
				}
				unitCost, err := parseOptionalNonNegativeMajor(raw.UnitCost, exponent)
				if err != nil || unitCost < 0 {
					return SupplierBillView{}, errors.New("bill line unit cost is invalid")
				}
				gross, err := requestLineTotal(unitCost, qty)
				if err != nil {
					return SupplierBillView{}, err
				}
				disc, err := parseOptionalNonNegativeMajor(raw.Discount, exponent)
				if err != nil || disc < 0 || disc >= gross {
					return SupplierBillView{}, errors.New("bill line discount is invalid")
				}
				tax, err := parseOptionalNonNegativeMajor(raw.TaxAmount, exponent)
				if err != nil || tax < 0 {
					return SupplierBillView{}, errors.New("bill line tax is invalid")
				}
				lineTotal := gross - disc + tax
				if lineTotal <= 0 {
					return SupplierBillView{}, errors.New("bill line total must be positive")
				}
				var grLineID, poLineID pgtype.Int8
				var grniLine int64
				desc := strings.TrimSpace(raw.Description)
				if raw.GoodsReceiptLineID > 0 {
					rl, ok := byReceiptLine[raw.GoodsReceiptLineID]
					if !ok {
						return SupplierBillView{}, errors.New("bill line does not belong to this goods receipt")
					}
					grLineID = pgtype.Int8{Int64: rl.ID, Valid: true}
					poLineID = rl.PurchaseOrderLineID
					if desc == "" && rl.Description.Valid {
						desc = rl.Description.String
					}
					prev, err := s.queries.SumPreviouslyBilledForReceiptLine(ctx, db.SumPreviouslyBilledForReceiptLineParams{
						WorkspaceID:        ws,
						GoodsReceiptLineID: pgtype.Int8{Int64: rl.ID, Valid: true},
					})
					if err != nil {
						return SupplierBillView{}, err
					}
					if prev.BilledQuantity.Add(qty).GreaterThan(rl.AcceptedQuantity) {
						return SupplierBillView{}, errors.New("billed quantity exceeds remaining received quantity")
					}
					grniLine, err = requestLineTotal(rl.UnitCostMinor, qty)
					if err != nil {
						return SupplierBillView{}, err
					}
				} else {
					if raw.PurchaseOrderLineID > 0 {
						poLineID = pgtype.Int8{Int64: raw.PurchaseOrderLineID, Valid: true}
					}
					grniLine = gross - disc
				}
				if desc == "" {
					desc = "Supplier invoice line"
				}
				totalMinor += lineTotal
				totalTax += tax
				totalDiscount += disc
				grniExpected += grniLine
				prepared = append(prepared, preparedBillLine{
					grLineID:       grLineID,
					poLineID:       poLineID,
					description:    desc,
					qty:            qty,
					unitCostMinor:  unitCost,
					discountMinor:  disc,
					taxAmountMinor: tax,
					lineTotalMinor: lineTotal,
					grniPortion:    grniLine,
				})
			}
		}

		// variance = net billed for goods minus GRNI value for those quantities
		netGoodsBilled := totalMinor - totalTax
		varianceMinor := netGoodsBilled - grniExpected
		matchStatus := "exact"
		if varianceMinor > 0 {
			matchStatus = "overbilled"
		} else if varianceMinor < 0 {
			matchStatus = "price_or_quantity_variance"
		}

		outletID := source.OutletID
		if in.OutletID != nil && *in.OutletID > 0 {
			outletID = pgtype.Int8{Int64: *in.OutletID, Valid: true}
		}

		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return SupplierBillView{}, err
		}
		defer func() { _ = tx.Rollback(ctx) }()
		q := s.queries.WithTx(tx)

		b, err := q.CreateSupplierBillWithDetails(ctx, db.CreateSupplierBillWithDetailsParams{
			WorkspaceID:           ws,
			GoodsReceiptID:        pgtype.Int8{Int64: in.GoodsReceiptID, Valid: true},
			SupplierID:            source.SupplierID.Int64,
			OutletID:              outletID,
			SupplierInvoiceNumber: invoice,
			BillDate:              pgtype.Date{Time: date, Valid: true},
			DueDate:               due,
			Currency:              source.Currency,
			CurrencyExponent:      source.CurrencyExponent,
			TotalMinor:            totalMinor,
			TaxAmountMinor:        totalTax,
			DiscountMinor:         totalDiscount,
			VarianceMinor:         varianceMinor,
			MatchStatus:           matchStatus,
			BillType:              "receipt",
			ExpenseAccountClass:   "expense",
			Description:           optionalPgText(in.Description),
			IdempotencyKey:        key,
			CreatedByUserID:       user,
		})
		if err != nil {
			return SupplierBillView{}, err
		}
		for _, pl := range prepared {
			if _, err := q.CreateSupplierBillLine(ctx, db.CreateSupplierBillLineParams{
				WorkspaceID:         ws,
				SupplierBillID:      b.ID,
				GoodsReceiptLineID:  pl.grLineID,
				PurchaseOrderLineID: pl.poLineID,
				Description:         pl.description,
				Quantity:            pl.qty,
				UnitCostMinor:       pl.unitCostMinor,
				DiscountMinor:       pl.discountMinor,
				TaxAmountMinor:      pl.taxAmountMinor,
				LineTotalMinor:      pl.lineTotalMinor,
			}); err != nil {
				return SupplierBillView{}, err
			}
		}
		view, err := billDetailView(ctx, q, b)
		if err != nil {
			return SupplierBillView{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return SupplierBillView{}, err
		}
		return view, nil
	}

	if in.SupplierID <= 0 {
		return SupplierBillView{}, errors.New("direct bill requires a supplier")
	}
	party, partyErr := s.GetCounterparty(ctx, ws, in.SupplierID)
	if partyErr != nil || (party.PartyType != "supplier" && party.PartyType != "both") {
		return SupplierBillView{}, ErrForbiddenParty
	}
	if _, dupErr := s.queries.FindDuplicateSupplierBill(ctx, db.FindDuplicateSupplierBillParams{
		WorkspaceID: ws,
		SupplierID:  party.ID,
		Btrim:       invoice,
	}); dupErr == nil {
		return SupplierBillView{}, ErrDuplicateBill
	} else if !errors.Is(dupErr, pgx.ErrNoRows) {
		return SupplierBillView{}, dupErr
	}
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if len(currency) != 3 {
		return SupplierBillView{}, ErrInvalidCurrency
	}
	exponent := CurrencyExponent(currency)
	amount, amountErr := ParseMajorToMinor(in.Amount, exponent)
	if amountErr != nil || amount <= 0 {
		return SupplierBillView{}, errors.New("bill amount must be positive")
	}
	taxMinor, amountErr := parseOptionalNonNegativeMajor(in.TaxAmount, exponent)
	if amountErr != nil || taxMinor < 0 {
		return SupplierBillView{}, errors.New("invalid tax amount")
	}
	discMinor, amountErr := parseOptionalNonNegativeMajor(in.Discount, exponent)
	if amountErr != nil || discMinor < 0 {
		return SupplierBillView{}, errors.New("invalid discount amount")
	}
	billType := strings.TrimSpace(in.BillType)
	if billType == "" {
		billType = "direct_expense"
	}
	if billType != "direct_expense" && billType != "direct_service" {
		return SupplierBillView{}, errors.New("invalid direct bill type")
	}
	accountClass := strings.TrimSpace(in.ExpenseAccountClass)
	if accountClass == "" {
		accountClass = "expense"
	}
	if accountClass != "expense" && accountClass != "asset" {
		return SupplierBillView{}, errors.New("invalid expense account class")
	}
	var outletID pgtype.Int8
	if in.OutletID != nil && *in.OutletID > 0 {
		outletID = pgtype.Int8{Int64: *in.OutletID, Valid: true}
	}
	b, e := s.queries.CreateSupplierBillWithDetails(ctx, db.CreateSupplierBillWithDetailsParams{
		WorkspaceID:           ws,
		SupplierID:            in.SupplierID,
		OutletID:              outletID,
		SupplierInvoiceNumber: invoice,
		BillDate:              pgtype.Date{Time: date, Valid: true},
		DueDate:               due,
		Currency:              currency,
		CurrencyExponent:      int32(exponent),
		TotalMinor:            amount,
		TaxAmountMinor:        taxMinor,
		DiscountMinor:         discMinor,
		MatchStatus:           "direct_bill",
		BillType:              billType,
		ExpenseAccountClass:   accountClass,
		Description:           optionalPgText(in.Description),
		IdempotencyKey:        key,
		CreatedByUserID:       user,
	})
	if e != nil {
		return SupplierBillView{}, e
	}
	return billDetailView(ctx, s.queries, b)
}

func withinVarianceTolerance(varianceMinor, baseMinor int64, toleranceBps int32) bool {
	if varianceMinor == 0 {
		return true
	}
	absVar := varianceMinor
	if absVar < 0 {
		absVar = -absVar
	}
	if baseMinor <= 0 {
		return false
	}
	// absVar * 10000 <= baseMinor * toleranceBps
	lhs := new(big.Int).Mul(big.NewInt(absVar), big.NewInt(10_000))
	rhs := new(big.Int).Mul(big.NewInt(baseMinor), big.NewInt(int64(toleranceBps)))
	return lhs.Cmp(rhs) <= 0
}

func (s *Service) ApproveSupplierBill(ctx context.Context, ws, user, id int64, in SupplierBillCommandInput) (SupplierBillView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if id < 1 || in.ExpectedVersion < 1 || key == "" {
		return SupplierBillView{}, errors.New("bill, expected version and idempotency key are required")
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return SupplierBillView{}, e
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	b, e := q.GetSupplierBillForUpdate(ctx, db.GetSupplierBillForUpdateParams{WorkspaceID: ws, ID: id})
	if errors.Is(e, pgx.ErrNoRows) {
		return SupplierBillView{}, ErrNotFound
	}
	if e != nil {
		return SupplierBillView{}, e
	}
	if old, e := q.GetSupplierBillCommand(ctx, db.GetSupplierBillCommandParams{WorkspaceID: ws, IdempotencyKey: key}); e == nil {
		if old.SupplierBillID != id || old.Command != "approve" || old.ExpectedVersion != in.ExpectedVersion {
			return SupplierBillView{}, ErrDuplicateIdempotent
		}
		return billDetailView(ctx, q, b)
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return SupplierBillView{}, e
	}
	if b.Version != in.ExpectedVersion || (b.Status != "draft" && b.Status != "disputed") {
		return SupplierBillView{}, ErrPurchaseRequestVersion
	}
	if b.GoodsReceiptID.Valid && b.VarianceMinor != 0 {
		policy, pErr := q.GetProcurementApprovalPolicy(ctx, ws)
		var tolBps int32
		if pErr == nil {
			tolBps = policy.PriceVarianceToleranceBps
		}
		grniBase := b.TotalMinor - b.TaxAmountMinor - b.VarianceMinor
		if !withinVarianceTolerance(b.VarianceMinor, grniBase, tolBps) && !in.AcceptVariance {
			return SupplierBillView{}, errors.New("supplier bill variance exceeds workspace tolerance; explicit variance acceptance required")
		}
	}
	// Approve from draft or disputed
	var updated db.SupplierBill
	if b.Status == "draft" {
		updated, e = q.ApproveSupplierBill(ctx, db.ApproveSupplierBillParams{WorkspaceID: ws, ID: id, Version: b.Version, ApprovedByUserID: pgtype.Int8{Int64: user, Valid: true}})
	} else {
		updated, e = q.UpdateSupplierBillStatusCommand(ctx, db.UpdateSupplierBillStatusCommandParams{WorkspaceID: ws, ID: id, Version: b.Version, Status: "approved", Column5: ""})
	}
	if e != nil {
		return SupplierBillView{}, e
	}
	entry, e := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{WorkspaceID: ws, SourceType: "supplier_bill", SourceID: id, EntryDate: b.BillDate, Currency: b.Currency, CurrencyExponent: b.CurrencyExponent, Description: optionalPgText("Supplier bill approval")})
	if e != nil {
		return SupplierBillView{}, e
	}
	if !b.GoodsReceiptID.Valid {
		debitClass := b.ExpenseAccountClass
		netAmount := b.TotalMinor - b.TaxAmountMinor
		if netAmount > 0 {
			if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: debitClass, DebitMinor: netAmount, Description: optionalPgText("Direct supplier bill expense")}); e != nil {
				return SupplierBillView{}, e
			}
		}
		if b.TaxAmountMinor > 0 {
			if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "asset", DebitMinor: b.TaxAmountMinor, Description: optionalPgText("Input tax recoverable")}); e != nil {
				return SupplierBillView{}, e
			}
		}
		if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "liability", CreditMinor: b.TotalMinor, Description: optionalPgText("Accounts Payable")}); e != nil {
			return SupplierBillView{}, e
		}
	} else {
		grniPortion := b.TotalMinor - b.TaxAmountMinor - b.VarianceMinor
		if grniPortion > 0 {
			if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "liability", DebitMinor: grniPortion, Description: optionalPgText("Clear GRNI")}); e != nil {
				return SupplierBillView{}, e
			}
		}
		if b.TaxAmountMinor > 0 {
			if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "asset", DebitMinor: b.TaxAmountMinor, Description: optionalPgText("Input tax recoverable")}); e != nil {
				return SupplierBillView{}, e
			}
		}
		if b.VarianceMinor > 0 {
			if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "expense", DebitMinor: b.VarianceMinor, Description: optionalPgText("Purchase price variance")}); e != nil {
				return SupplierBillView{}, e
			}
		} else if b.VarianceMinor < 0 {
			if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "expense", CreditMinor: -b.VarianceMinor, Description: optionalPgText("Favorable purchase price variance")}); e != nil {
				return SupplierBillView{}, e
			}
		}
		if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "liability", CreditMinor: b.TotalMinor, Description: optionalPgText("Accounts Payable")}); e != nil {
			return SupplierBillView{}, e
		}
	}
	if e = q.CreateSupplierBillCommand(ctx, db.CreateSupplierBillCommandParams{WorkspaceID: ws, SupplierBillID: id, Command: "approve", ExpectedVersion: b.Version, IdempotencyKey: key, ActorUserID: user}); e != nil {
		return SupplierBillView{}, e
	}
	view, err := billDetailView(ctx, q, updated)
	if err != nil {
		return SupplierBillView{}, err
	}
	if e = tx.Commit(ctx); e != nil {
		return SupplierBillView{}, e
	}
	return view, nil
}

func (s *Service) TransitionSupplierBill(ctx context.Context, ws, user, id int64, command string, in SupplierBillCommandInput) (SupplierBillView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	reason := strings.TrimSpace(in.Reason)
	if id < 1 || in.ExpectedVersion < 1 || key == "" {
		return SupplierBillView{}, errors.New("bill, expected version and idempotency key are required")
	}
	if command != "reject" && command != "dispute" && command != "reverse" {
		return SupplierBillView{}, errors.New("unsupported supplier bill command")
	}
	if len(reason) < 3 {
		return SupplierBillView{}, errors.New("a reason of at least 3 characters is required")
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return SupplierBillView{}, e
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	b, e := q.GetSupplierBillForUpdate(ctx, db.GetSupplierBillForUpdateParams{WorkspaceID: ws, ID: id})
	if errors.Is(e, pgx.ErrNoRows) {
		return SupplierBillView{}, ErrNotFound
	}
	if e != nil {
		return SupplierBillView{}, e
	}
	if old, e := q.GetSupplierBillCommand(ctx, db.GetSupplierBillCommandParams{WorkspaceID: ws, IdempotencyKey: key}); e == nil {
		if old.SupplierBillID != id || old.Command != command || old.ExpectedVersion != in.ExpectedVersion {
			return SupplierBillView{}, ErrDuplicateIdempotent
		}
		return billDetailView(ctx, q, b)
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return SupplierBillView{}, e
	}
	if b.Version != in.ExpectedVersion {
		return SupplierBillView{}, ErrPurchaseRequestVersion
	}
	var nextStatus string
	switch command {
	case "reject":
		if b.Status != "draft" && b.Status != "disputed" {
			return SupplierBillView{}, ErrInvalidPurchaseRequestState
		}
		nextStatus = "rejected"
	case "dispute":
		if b.Status != "draft" && b.Status != "approved" {
			return SupplierBillView{}, ErrInvalidPurchaseRequestState
		}
		nextStatus = "disputed"
	case "reverse":
		if b.Status != "approved" {
			return SupplierBillView{}, ErrInvalidPurchaseRequestState
		}
		if b.OutstandingMinor != b.TotalMinor || b.CreditedMinor > 0 {
			return SupplierBillView{}, errors.New("cannot reverse a supplier bill that has payments or credits applied")
		}
		nextStatus = "reversed"
	}
	updated, e := q.UpdateSupplierBillStatusCommand(ctx, db.UpdateSupplierBillStatusCommandParams{
		WorkspaceID: ws,
		ID:          id,
		Version:     b.Version,
		Status:      nextStatus,
		Column5:     reason,
	})
	if e != nil {
		return SupplierBillView{}, e
	}
	if command == "reverse" {
		entry, e := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
			WorkspaceID:      ws,
			SourceType:       "supplier_bill_reversal",
			SourceID:         id,
			EntryDate:        pgtype.Date{Time: time.Now().UTC(), Valid: true},
			Currency:         b.Currency,
			CurrencyExponent: b.CurrencyExponent,
			Description:      optionalPgText("Reversal of supplier bill: " + reason),
		})
		if e != nil {
			return SupplierBillView{}, e
		}
		if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "liability", DebitMinor: b.TotalMinor, Description: optionalPgText("Reverse Accounts Payable")}); e != nil {
			return SupplierBillView{}, e
		}
		if !b.GoodsReceiptID.Valid {
			netAmount := b.TotalMinor - b.TaxAmountMinor
			if netAmount > 0 {
				if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: b.ExpenseAccountClass, CreditMinor: netAmount, Description: optionalPgText("Reverse direct supplier bill expense")}); e != nil {
					return SupplierBillView{}, e
				}
			}
			if b.TaxAmountMinor > 0 {
				if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "asset", CreditMinor: b.TaxAmountMinor, Description: optionalPgText("Reverse input tax recoverable")}); e != nil {
					return SupplierBillView{}, e
				}
			}
		} else {
			grniPortion := b.TotalMinor - b.TaxAmountMinor - b.VarianceMinor
			if grniPortion > 0 {
				if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "liability", CreditMinor: grniPortion, Description: optionalPgText("Restore GRNI accrual")}); e != nil {
					return SupplierBillView{}, e
				}
			}
			if b.TaxAmountMinor > 0 {
				if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "asset", CreditMinor: b.TaxAmountMinor, Description: optionalPgText("Reverse input tax recoverable")}); e != nil {
					return SupplierBillView{}, e
				}
			}
			if b.VarianceMinor > 0 {
				if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "expense", CreditMinor: b.VarianceMinor, Description: optionalPgText("Reverse purchase price variance")}); e != nil {
					return SupplierBillView{}, e
				}
			} else if b.VarianceMinor < 0 {
				if _, e = q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{LedgerEntryID: entry.ID, WorkspaceID: ws, AccountClass: "expense", DebitMinor: -b.VarianceMinor, Description: optionalPgText("Reverse favorable purchase price variance")}); e != nil {
					return SupplierBillView{}, e
				}
			}
		}
	}
	if e = q.CreateSupplierBillCommand(ctx, db.CreateSupplierBillCommandParams{
		WorkspaceID: ws, SupplierBillID: id, Command: command, ExpectedVersion: b.Version, IdempotencyKey: key, ActorUserID: user,
	}); e != nil {
		return SupplierBillView{}, e
	}
	view, err := billDetailView(ctx, q, updated)
	if err != nil {
		return SupplierBillView{}, err
	}
	if e = tx.Commit(ctx); e != nil {
		return SupplierBillView{}, e
	}
	return view, nil
}

func (s *Service) ApplySupplierCreditToBill(ctx context.Context, ws, user, billID int64, in ApplySupplierCreditToBillInput) (SupplierBillView, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if billID < 1 || in.SupplierCreditID < 1 || in.ExpectedBillVersion < 1 || key == "" {
		return SupplierBillView{}, errors.New("bill, credit, expected version and idempotency key are required")
	}
	if prev, err := s.queries.GetSupplierBillCreditApplicationByIdempotency(ctx, db.GetSupplierBillCreditApplicationByIdempotencyParams{
		WorkspaceID:    ws,
		IdempotencyKey: key,
	}); err == nil {
		if prev.SupplierBillID != billID || prev.SupplierCreditID != in.SupplierCreditID {
			return SupplierBillView{}, ErrDuplicateIdempotent
		}
		return s.GetSupplierBill(ctx, ws, billID)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return SupplierBillView{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SupplierBillView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	bill, err := q.GetSupplierBillForUpdate(ctx, db.GetSupplierBillForUpdateParams{WorkspaceID: ws, ID: billID})
	if errors.Is(err, pgx.ErrNoRows) {
		return SupplierBillView{}, ErrNotFound
	}
	if err != nil {
		return SupplierBillView{}, err
	}
	if bill.Version != in.ExpectedBillVersion {
		return SupplierBillView{}, ErrPurchaseRequestVersion
	}
	if bill.Status != "approved" && bill.Status != "partially_paid" {
		return SupplierBillView{}, ErrInvalidPurchaseRequestState
	}
	credit, err := q.GetSupplierCreditForUpdate(ctx, db.GetSupplierCreditForUpdateParams{WorkspaceID: ws, ID: in.SupplierCreditID})
	if errors.Is(err, pgx.ErrNoRows) {
		return SupplierBillView{}, ErrNotFound
	}
	if err != nil {
		return SupplierBillView{}, err
	}
	if credit.SupplierID != bill.SupplierID || credit.Currency != bill.Currency {
		return SupplierBillView{}, errors.New("supplier credit must match bill supplier and currency")
	}
	amount, err := ParseMajorToMinor(in.Amount, int(bill.CurrencyExponent))
	if err != nil || amount <= 0 {
		return SupplierBillView{}, errors.New("credit application amount must be positive")
	}
	if amount > bill.OutstandingMinor || amount > credit.OutstandingMinor {
		return SupplierBillView{}, errors.New("credit amount exceeds bill outstanding or credit remaining balance")
	}
	updatedBill, err := q.ApplyCreditToSupplierBill(ctx, db.ApplyCreditToSupplierBillParams{
		WorkspaceID:      ws,
		ID:               bill.ID,
		OutstandingMinor: amount,
	})
	if err != nil {
		return SupplierBillView{}, errors.New("supplier bill changed before credit application")
	}
	if _, err := q.ApplySupplierCreditBalance(ctx, db.ApplySupplierCreditBalanceParams{
		WorkspaceID:      ws,
		ID:               credit.ID,
		OutstandingMinor: amount,
	}); err != nil {
		return SupplierBillView{}, errors.New("supplier credit changed before credit application")
	}
	if _, err := q.CreateSupplierBillCreditApplication(ctx, db.CreateSupplierBillCreditApplicationParams{
		WorkspaceID:      ws,
		SupplierBillID:   bill.ID,
		SupplierCreditID: credit.ID,
		AmountMinor:      amount,
		IdempotencyKey:   key,
		AppliedByUserID:  user,
	}); err != nil {
		return SupplierBillView{}, err
	}
	entry, err := q.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      ws,
		SourceType:       "supplier_credit_application",
		SourceID:         bill.ID,
		EntryDate:        pgtype.Date{Time: time.Now().UTC(), Valid: true},
		Currency:         bill.Currency,
		CurrencyExponent: bill.CurrencyExponent,
		Description:      optionalPgText(fmt.Sprintf("Apply supplier credit #%d to bill #%d", credit.ID, bill.ID)),
	})
	if err != nil {
		return SupplierBillView{}, err
	}
	if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
		LedgerEntryID: entry.ID,
		WorkspaceID:   ws,
		AccountClass:  "liability",
		DebitMinor:    amount,
		Description:   optionalPgText("Settle Accounts Payable with supplier credit"),
	}); err != nil {
		return SupplierBillView{}, err
	}
	if _, err := q.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
		LedgerEntryID: entry.ID,
		WorkspaceID:   ws,
		AccountClass:  "asset",
		CreditMinor:   amount,
		Description:   optionalPgText("Clear supplier credit balance"),
	}); err != nil {
		return SupplierBillView{}, err
	}
	view, err := billDetailView(ctx, q, updatedBill)
	if err != nil {
		return SupplierBillView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SupplierBillView{}, err
	}
	return view, nil
}

func (s *Service) ListSupplierBills(ctx context.Context, ws int64) ([]SupplierBillView, error) {
	rows, e := s.queries.ListSupplierBills(ctx, db.ListSupplierBillsParams{WorkspaceID: ws, Limit: 50})
	if e != nil {
		return nil, e
	}
	out := make([]SupplierBillView, 0, len(rows))
	for _, b := range rows {
		out = append(out, billView(b))
	}
	return out, nil
}

func (s *Service) SupplierBillMatch(ctx context.Context, ws, id int64) (SupplierBillMatch, error) {
	b, e := s.queries.GetSupplierBill(ctx, db.GetSupplierBillParams{WorkspaceID: ws, ID: id})
	if errors.Is(e, pgx.ErrNoRows) {
		return SupplierBillMatch{}, ErrNotFound
	}
	if e != nil {
		return SupplierBillMatch{}, e
	}
	if !b.GoodsReceiptID.Valid {
		return SupplierBillMatch{BillID: b.ID, BilledMinor: fmt.Sprintf("%d", b.TotalMinor), Result: "direct_bill", RequiresReview: false}, nil
	}
	totals, e := s.queries.GetThreeWayMatchTotals(ctx, db.GetThreeWayMatchTotalsParams{WorkspaceID: ws, ID: b.GoodsReceiptID.Int64})
	if e != nil {
		return SupplierBillMatch{}, e
	}
	result, review := "exact", false
	if b.VarianceMinor > 0 || totals.BilledMinor > totals.ReceivedMinor {
		result, review = "overbilled", true
	} else if b.VarianceMinor != 0 || totals.BilledMinor != totals.ReceivedMinor {
		result, review = "price_or_quantity_variance", true
	} else if totals.OrderedMinor > 0 && totals.ReceivedMinor != totals.OrderedMinor {
		result, review = "receipt_quantity_variance", true
	}
	openToBill := totals.ReceivedMinor - totals.BilledMinor
	if openToBill < 0 {
		openToBill = 0
	}
	variance := b.VarianceMinor
	if variance == 0 {
		variance = totals.BilledMinor - totals.ReceivedMinor
	}
	return SupplierBillMatch{BillID: b.ID, ReceiptID: b.GoodsReceiptID.Int64, OrderedMinor: fmt.Sprintf("%d", totals.OrderedMinor), ReceivedMinor: fmt.Sprintf("%d", totals.ReceivedMinor), BilledMinor: fmt.Sprintf("%d", totals.BilledMinor), OpenToBillMinor: fmt.Sprintf("%d", openToBill), VarianceMinor: fmt.Sprintf("%d", variance), Result: result, RequiresReview: review}, nil
}
