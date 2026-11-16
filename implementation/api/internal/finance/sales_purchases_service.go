package finance

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrOverpayment           = errors.New("payment exceeds outstanding balance")
	ErrForbiddenRecord       = errors.New("linked record does not belong to workspace")
	ErrForbiddenParty        = errors.New("counterparty does not belong to workspace")
	ErrLegsSumMismatch       = errors.New("sum of payment legs does not match payment total")
	ErrPaidExceedsTotal      = errors.New("amount paid cannot be more than the total")
	ErrNoPaymentLegs         = errors.New("at least one payment leg is required")
	ErrNegativeLegAmount     = errors.New("payment leg amount must be greater than zero")
	ErrAlreadyFullyPaid      = errors.New("record is already fully paid")
	ErrCannotPayVoidedRecord = errors.New("cannot record payment against a voided record")
	ErrInvalidAllocation     = errors.New("invalid payment allocation")
)

// ---------------- Counterparties (External Customers / Suppliers) ----------------

type CreateCounterpartyInput struct {
	Name                string `json:"name" binding:"required"`
	PartyType           string `json:"party_type"` // customer, supplier, both
	Email               string `json:"email"`
	Phone               string `json:"phone"`
	Notes               string `json:"notes"`
	OpeningBalanceMinor int64  `json:"opening_balance_minor"`
	OpeningBalance      string `json:"opening_balance"` // optional major decimal string (positive = owes business / owed to supplier)
}

func (s *Service) resolveCounterpartyOpeningBalance(ctx context.Context, workspaceID int64, rawMinor int64, rawMajor string) (int64, error) {
	if strings.TrimSpace(rawMajor) == "" {
		return rawMinor, nil
	}
	currency := "NGN"
	if profile, err := s.queries.GetWorkspaceProfile(ctx, workspaceID); err == nil && profile.BaseCurrency != "" {
		currency = profile.BaseCurrency
	}
	parsed, err := ParseMajorToMinor(rawMajor, CurrencyExponent(currency))
	if err != nil {
		return 0, fmt.Errorf("invalid opening_balance: %w", err)
	}
	return parsed, nil
}

func (s *Service) CreateCounterparty(ctx context.Context, workspaceID int64, in CreateCounterpartyInput) (db.Counterparty, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return db.Counterparty{}, errors.New("counterparty name is required")
	}

	pType := strings.ToLower(strings.TrimSpace(in.PartyType))
	switch pType {
	case "customer", "supplier", "both":
	default:
		return db.Counterparty{}, errors.New("invalid party type: must be customer, supplier, or both")
	}

	openMinor, err := s.resolveCounterpartyOpeningBalance(ctx, workspaceID, in.OpeningBalanceMinor, in.OpeningBalance)
	if err != nil {
		return db.Counterparty{}, err
	}

	return s.queries.CreateCounterparty(ctx, db.CreateCounterpartyParams{
		WorkspaceID:         workspaceID,
		Name:                name,
		PartyType:           pType,
		Email:               optionalPgText(in.Email),
		Phone:               optionalPgText(in.Phone),
		Notes:               optionalPgText(in.Notes),
		OpeningBalanceMinor: openMinor,
		IsActive:            true,
	})
}

func (s *Service) UpdateCounterparty(ctx context.Context, workspaceID, partyID int64, in CreateCounterpartyInput) (db.Counterparty, error) {
	existing, err := s.GetCounterparty(ctx, workspaceID, partyID)
	if err != nil {
		return db.Counterparty{}, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return db.Counterparty{}, errors.New("counterparty name is required")
	}
	pType := strings.ToLower(strings.TrimSpace(in.PartyType))
	if pType == "" {
		pType = existing.PartyType
	}
	if pType != "customer" && pType != "supplier" && pType != "both" {
		return db.Counterparty{}, errors.New("invalid party type")
	}

	openMinor := existing.OpeningBalanceMinor
	if strings.TrimSpace(in.OpeningBalance) != "" || in.OpeningBalanceMinor != 0 {
		parsed, err := s.resolveCounterpartyOpeningBalance(ctx, workspaceID, in.OpeningBalanceMinor, in.OpeningBalance)
		if err != nil {
			return db.Counterparty{}, err
		}
		openMinor = parsed
	}

	updated, err := s.queries.UpdateCounterparty(ctx, db.UpdateCounterpartyParams{
		ID:                  partyID,
		WorkspaceID:         workspaceID,
		Name:                name,
		PartyType:           pType,
		Email:               optionalPgText(in.Email),
		Phone:               optionalPgText(in.Phone),
		Notes:               optionalPgText(in.Notes),
		OpeningBalanceMinor: openMinor,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Counterparty{}, ErrNotFound
	}
	return updated, err
}

func (s *Service) MergeCounterparties(ctx context.Context, workspaceID, sourceID, targetID int64) (db.Counterparty, error) {
	if sourceID == targetID {
		return db.Counterparty{}, errors.New("cannot merge a counterparty into itself")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.Counterparty{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	src, err := qtx.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{ID: sourceID, WorkspaceID: workspaceID})
	if err != nil {
		return db.Counterparty{}, ErrNotFound
	}
	tgt, err := qtx.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{ID: targetID, WorkspaceID: workspaceID})
	if err != nil {
		return db.Counterparty{}, ErrNotFound
	}
	if src.MergedIntoID.Valid || tgt.MergedIntoID.Valid {
		return db.Counterparty{}, errors.New("cannot merge already merged records")
	}

	// Reassign tenant-owned references cleanly from source to target
	updates := []string{
		`UPDATE sales SET customer_id = $3 WHERE workspace_id = $1 AND customer_id = $2`,
		`UPDATE purchases SET supplier_id = $3 WHERE workspace_id = $1 AND supplier_id = $2`,
		`UPDATE invoices SET customer_id = $3 WHERE workspace_id = $1 AND customer_id = $2`,
		`UPDATE estimates SET customer_id = $3 WHERE workspace_id = $1 AND customer_id = $2`,
		`UPDATE sales_returns SET customer_id = $3 WHERE workspace_id = $1 AND customer_id = $2`,
		`UPDATE payments SET counterparty_id = $3 WHERE workspace_id = $1 AND counterparty_id = $2`,
		`UPDATE money_record_drafts SET counterparty_id = $3 WHERE workspace_id = $1 AND counterparty_id = $2`,
		`UPDATE money_records SET counterparty_id = $3 WHERE workspace_id = $1 AND counterparty_id = $2`,
		`UPDATE wallet_transactions SET customer_id = $3 WHERE workspace_id = $1 AND customer_id = $2`,
	}
	for _, stmt := range updates {
		if _, err := tx.Exec(ctx, stmt, workspaceID, sourceID, targetID); err != nil {
			return db.Counterparty{}, fmt.Errorf("merge references: %w", err)
		}
	}

	if _, err := qtx.MarkCounterpartyMerged(ctx, db.MarkCounterpartyMergedParams{
		ID:           sourceID,
		WorkspaceID:  workspaceID,
		MergedIntoID: pgtype.Int8{Int64: targetID, Valid: true},
	}); err != nil {
		return db.Counterparty{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return db.Counterparty{}, err
	}
	return tgt, nil
}

func (s *Service) ListCounterparties(ctx context.Context, workspaceID int64, partyType string) ([]db.Counterparty, error) {
	var pTypeParam pgtype.Text
	if partyType != "" {
		pTypeParam = pgtype.Text{String: strings.ToLower(strings.TrimSpace(partyType)), Valid: true}
	}
	return s.queries.ListCounterparties(ctx, db.ListCounterpartiesParams{
		WorkspaceID: workspaceID,
		PartyType:   pTypeParam,
		IsActive:    pgtype.Bool{Bool: true, Valid: true},
	})
}

func (s *Service) GetCounterparty(ctx context.Context, workspaceID, partyID int64) (db.Counterparty, error) {
	party, err := s.queries.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{
		ID:          partyID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Counterparty{}, ErrNotFound
	}
	return party, err
}

// ---------------- Sales ----------------

type CreateSaleInput struct {
	CustomerID       *int64            `json:"customer_id"`
	CustomerName     string            `json:"customer_name"`
	SaleDate         string            `json:"sale_date" binding:"required"` // YYYY-MM-DD
	TotalAmountMinor int64             `json:"total_amount_minor"`
	TotalAmount      string            `json:"amount"` // optional major decimal string
	Currency         string            `json:"currency"`
	Notes            string            `json:"notes"`
	Reference        string            `json:"reference"`
	IdempotencyKey   string            `json:"idempotency_key"`
	PaymentLegs      []PaymentLegInput `json:"payment_legs"` // optional immediate settlement
	// Items are optional. Stock products in them leave stock from OutletID (or the main outlet).
	Items    []StockLineInput `json:"items"`
	OutletID int64            `json:"outlet_id"`
}

type SaleDetail struct {
	Sale     db.Sale         `json:"sale"`
	Items    []db.SaleItem   `json:"items"`
	Payments []PaymentDetail `json:"payments,omitempty"`
}

func (s *Service) CreateSale(ctx context.Context, workspaceID, userID int64, in CreateSaleInput) (SaleDetail, error) {
	idempKey := strings.TrimSpace(in.IdempotencyKey)
	if idempKey != "" {
		existing, err := s.queries.GetSaleByIdempotency(ctx, db.GetSaleByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			return s.GetSale(ctx, workspaceID, existing.ID)
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return SaleDetail{}, err
		}
	}

	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := CurrencyExponent(currency)

	totalMinor := in.TotalAmountMinor
	if in.TotalAmount != "" {
		parsed, err := ParseMajorToMinor(in.TotalAmount, exponent)
		if err != nil {
			return SaleDetail{}, err
		}
		totalMinor = parsed
	}
	items, itemsTotal, err := prepareStockLines(ctx, s.queries, workspaceID, in.Items, exponent)
	if err != nil {
		return SaleDetail{}, err
	}
	if totalMinor <= 0 {
		totalMinor = itemsTotal
	}
	if totalMinor <= 0 {
		return SaleDetail{}, ErrNegativeAmount
	}

	saleDate, err := time.Parse("2006-01-02", strings.TrimSpace(in.SaleDate))
	if err != nil {
		return SaleDetail{}, fmt.Errorf("invalid sale date (expected YYYY-MM-DD): %w", err)
	}

	// Validate customer
	customerName := strings.TrimSpace(in.CustomerName)
	var customerIDParam pgtype.Int8
	if in.CustomerID != nil && *in.CustomerID > 0 {
		party, err := s.queries.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{
			ID:          *in.CustomerID,
			WorkspaceID: workspaceID,
		})
		if err != nil {
			return SaleDetail{}, ErrForbiddenParty
		}
		customerIDParam = pgtype.Int8{Int64: party.ID, Valid: true}
		if customerName == "" {
			customerName = party.Name
		}
	}
	if customerName == "" {
		customerName = "Walk-in Customer"
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SaleDetail{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := s.queries.WithTx(tx)

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	saleRecord, err := qtx.CreateSale(ctx, db.CreateSaleParams{
		WorkspaceID:      workspaceID,
		CustomerID:       customerIDParam,
		CustomerName:     customerName,
		SaleDate:         pgtype.Date{Time: saleDate, Valid: true},
		TotalAmountMinor: totalMinor,
		PaidAmountMinor:  0,
		Currency:         currency,
		CurrencyExponent: int32(exponent),
		Status:           "unpaid",
		Notes:            optionalPgText(in.Notes),
		Reference:        optionalPgText(in.Reference),
		IdempotencyKey:   idempParam,
		CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return SaleDetail{}, fmt.Errorf("create sale record: %w", err)
	}
	savedItems, err := recordSaleItems(ctx, qtx, workspaceID, saleRecord.ID, in.OutletID, items, saleDate, currency)
	if err != nil {
		return SaleDetail{}, err
	}

	var payments []PaymentDetail
	// If immediate payment legs provided, record payment
	if len(in.PaymentLegs) > 0 {
		paidMinor, legs, err := settlementLegs(in.PaymentLegs, totalMinor, exponent)
		if err != nil {
			return SaleDetail{}, err
		}
		pmt, err := s.createPaymentInternal(ctx, qtx, workspaceID, userID, CreatePaymentInput{
			Direction:        "incoming",
			PaymentDate:      in.SaleDate,
			TotalAmountMinor: paidMinor,
			Currency:         currency,
			CounterpartyID:   in.CustomerID,
			CounterpartyName: customerName,
			LinkedRecordType: "sale",
			LinkedRecordID:   &saleRecord.ID,
			PaymentLegs:      legs,
			Reference:        in.Reference,
			Notes:            "Immediate settlement for sale #" + fmt.Sprint(saleRecord.ID),
		})
		if err != nil {
			return SaleDetail{}, err
		}
		payments = append(payments, pmt)

		// Refetch updated sale
		saleRecord, err = qtx.GetSaleByID(ctx, db.GetSaleByIDParams{
			ID:          saleRecord.ID,
			WorkspaceID: workspaceID,
		})
		if err != nil {
			return SaleDetail{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return SaleDetail{}, fmt.Errorf("commit sale: %w", err)
	}

	return SaleDetail{
		Sale:     saleRecord,
		Items:    savedItems,
		Payments: payments,
	}, nil
}

func (s *Service) GetSale(ctx context.Context, workspaceID, saleID int64) (SaleDetail, error) {
	sale, err := s.queries.GetSaleByID(ctx, db.GetSaleByIDParams{
		ID:          saleID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return SaleDetail{}, ErrNotFound
	} else if err != nil {
		return SaleDetail{}, err
	}

	paymentsList, err := s.queries.ListPayments(ctx, db.ListPaymentsParams{
		WorkspaceID:      workspaceID,
		LinkedRecordType: pgtype.Text{String: "sale", Valid: true},
		LinkedRecordID:   pgtype.Int8{Int64: saleID, Valid: true},
		Limit:            100,
	})
	if err != nil {
		return SaleDetail{}, err
	}

	var payments []PaymentDetail
	for _, p := range paymentsList {
		legs, _ := s.queries.ListPaymentLegsByPaymentID(ctx, db.ListPaymentLegsByPaymentIDParams{
			PaymentID:   p.ID,
			WorkspaceID: workspaceID,
		})
		payments = append(payments, PaymentDetail{
			Payment: p,
			Legs:    legs,
		})
	}

	items, err := s.queries.ListSaleItems(ctx, db.ListSaleItemsParams{WorkspaceID: workspaceID, SaleID: saleID})
	if err != nil {
		return SaleDetail{}, err
	}
	return SaleDetail{
		Sale:     sale,
		Items:    items,
		Payments: payments,
	}, nil
}

type ListSalesFilter struct {
	Search     string `form:"search"`
	FromDate   string `form:"from"`
	ToDate     string `form:"to"`
	Status     string `form:"status"`
	CustomerID int64  `form:"customer_id"`
	BeforeID   int64  `form:"before_id"`
	Limit      int32  `form:"limit"`
	Source     string `form:"source"`
}

func (s *Service) ListSales(ctx context.Context, workspaceID int64, f ListSalesFilter) ([]db.Sale, error) {
	limit := f.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var fromDateParam, toDateParam pgtype.Date
	if f.FromDate != "" {
		if t, err := time.Parse("2006-01-02", f.FromDate); err == nil {
			fromDateParam = pgtype.Date{Time: t, Valid: true}
		}
	}
	if f.ToDate != "" {
		if t, err := time.Parse("2006-01-02", f.ToDate); err == nil {
			toDateParam = pgtype.Date{Time: t, Valid: true}
		}
	}

	var statusParam pgtype.Text
	if f.Status != "" {
		statusParam = pgtype.Text{String: f.Status, Valid: true}
	}
	var sourceParam pgtype.Text
	if f.Source == "in_person" || f.Source == "online_store" {
		sourceParam = pgtype.Text{String: f.Source, Valid: true}
	}

	var customerIDParam pgtype.Int8
	if f.CustomerID > 0 {
		customerIDParam = pgtype.Int8{Int64: f.CustomerID, Valid: true}
	}

	var beforeIDParam pgtype.Int8
	if f.BeforeID > 0 {
		beforeIDParam = pgtype.Int8{Int64: f.BeforeID, Valid: true}
	}

	return s.queries.ListSales(ctx, db.ListSalesParams{
		Search:      searchParam(f.Search),
		WorkspaceID: workspaceID,
		Limit:       limit,
		FromDate:    fromDateParam,
		ToDate:      toDateParam,
		Status:      statusParam,
		Source:      sourceParam,
		CustomerID:  customerIDParam,
		BeforeID:    beforeIDParam,
	})
}

// ---------------- Purchases ----------------

type CreatePurchaseInput struct {
	SupplierID       *int64            `json:"supplier_id"`
	SupplierName     string            `json:"supplier_name"`
	PurchaseDate     string            `json:"purchase_date" binding:"required"` // YYYY-MM-DD
	TotalAmountMinor int64             `json:"total_amount_minor"`
	TotalAmount      string            `json:"amount"` // optional major decimal string
	Currency         string            `json:"currency"`
	CategoryID       *int64            `json:"category_id"`
	Notes            string            `json:"notes"`
	Reference        string            `json:"reference"`
	IdempotencyKey   string            `json:"idempotency_key"`
	PaymentLegs      []PaymentLegInput `json:"payment_legs"` // optional immediate settlement
	// Items are optional. Stock products in them are added to OutletID (or the main outlet)
	// at the price paid, which also updates their average cost.
	Items    []StockLineInput `json:"items"`
	OutletID int64            `json:"outlet_id"`
}

type PurchaseDetail struct {
	Purchase db.Purchase        `json:"purchase"`
	Items    []db.PurchaseItem  `json:"items"`
	Payments []PaymentDetail    `json:"payments,omitempty"`
	Files    []DocumentFileView `json:"files,omitempty"`
}

func (s *Service) CreatePurchase(ctx context.Context, workspaceID, userID int64, in CreatePurchaseInput) (PurchaseDetail, error) {
	idempKey := strings.TrimSpace(in.IdempotencyKey)
	if idempKey != "" {
		existing, err := s.queries.GetPurchaseByIdempotency(ctx, db.GetPurchaseByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			return s.GetPurchase(ctx, workspaceID, existing.ID)
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return PurchaseDetail{}, err
		}
	}

	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := CurrencyExponent(currency)

	totalMinor := in.TotalAmountMinor
	if in.TotalAmount != "" {
		parsed, err := ParseMajorToMinor(in.TotalAmount, exponent)
		if err != nil {
			return PurchaseDetail{}, err
		}
		totalMinor = parsed
	}
	items, itemsTotal, err := prepareStockLines(ctx, s.queries, workspaceID, in.Items, exponent)
	if err != nil {
		return PurchaseDetail{}, err
	}
	if totalMinor <= 0 {
		totalMinor = itemsTotal
	}
	if totalMinor <= 0 {
		return PurchaseDetail{}, ErrNegativeAmount
	}

	purchaseDate, err := time.Parse("2006-01-02", strings.TrimSpace(in.PurchaseDate))
	if err != nil {
		return PurchaseDetail{}, fmt.Errorf("invalid purchase date (expected YYYY-MM-DD): %w", err)
	}

	// Validate supplier
	supplierName := strings.TrimSpace(in.SupplierName)
	var supplierIDParam pgtype.Int8
	if in.SupplierID != nil && *in.SupplierID > 0 {
		party, err := s.queries.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{
			ID:          *in.SupplierID,
			WorkspaceID: workspaceID,
		})
		if err != nil {
			return PurchaseDetail{}, ErrForbiddenParty
		}
		supplierIDParam = pgtype.Int8{Int64: party.ID, Valid: true}
		if supplierName == "" {
			supplierName = party.Name
		}
	}
	if supplierName == "" {
		supplierName = "General Supplier"
	}

	var catID pgtype.Int8
	if in.CategoryID != nil && *in.CategoryID > 0 {
		cat, err := s.queries.GetCategoryByID(ctx, db.GetCategoryByIDParams{
			ID:          *in.CategoryID,
			WorkspaceID: workspaceID,
		})
		if err != nil {
			return PurchaseDetail{}, ErrForbiddenCategory
		}
		catID = pgtype.Int8{Int64: cat.ID, Valid: true}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PurchaseDetail{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := s.queries.WithTx(tx)

	var idempParam pgtype.Text
	if idempKey != "" {
		idempParam = pgtype.Text{String: idempKey, Valid: true}
	}

	purchaseRecord, err := qtx.CreatePurchase(ctx, db.CreatePurchaseParams{
		WorkspaceID:      workspaceID,
		SupplierID:       supplierIDParam,
		SupplierName:     supplierName,
		PurchaseDate:     pgtype.Date{Time: purchaseDate, Valid: true},
		TotalAmountMinor: totalMinor,
		PaidAmountMinor:  0,
		Currency:         currency,
		CurrencyExponent: int32(exponent),
		Status:           "unpaid",
		CategoryID:       catID,
		Notes:            optionalPgText(in.Notes),
		Reference:        optionalPgText(in.Reference),
		IdempotencyKey:   idempParam,
		CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return PurchaseDetail{}, fmt.Errorf("create purchase record: %w", err)
	}
	savedItems, err := recordPurchaseItems(ctx, qtx, workspaceID, purchaseRecord.ID, in.OutletID, items, purchaseDate, currency)
	if err != nil {
		return PurchaseDetail{}, err
	}

	var payments []PaymentDetail
	if len(in.PaymentLegs) > 0 {
		paidMinor, legs, err := settlementLegs(in.PaymentLegs, totalMinor, exponent)
		if err != nil {
			return PurchaseDetail{}, err
		}
		pmt, err := s.createPaymentInternal(ctx, qtx, workspaceID, userID, CreatePaymentInput{
			Direction:        "outgoing",
			PaymentDate:      in.PurchaseDate,
			TotalAmountMinor: paidMinor,
			Currency:         currency,
			CounterpartyID:   in.SupplierID,
			CounterpartyName: supplierName,
			LinkedRecordType: "purchase",
			LinkedRecordID:   &purchaseRecord.ID,
			PaymentLegs:      legs,
			Reference:        in.Reference,
			Notes:            "Immediate settlement for purchase #" + fmt.Sprint(purchaseRecord.ID),
		})
		if err != nil {
			return PurchaseDetail{}, err
		}
		payments = append(payments, pmt)

		purchaseRecord, err = qtx.GetPurchaseByID(ctx, db.GetPurchaseByIDParams{
			ID:          purchaseRecord.ID,
			WorkspaceID: workspaceID,
		})
		if err != nil {
			return PurchaseDetail{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return PurchaseDetail{}, fmt.Errorf("commit purchase: %w", err)
	}

	return PurchaseDetail{
		Purchase: purchaseRecord,
		Items:    savedItems,
		Payments: payments,
	}, nil
}

func (s *Service) GetPurchase(ctx context.Context, workspaceID, purchaseID int64) (PurchaseDetail, error) {
	purchase, err := s.queries.GetPurchaseByID(ctx, db.GetPurchaseByIDParams{
		ID:          purchaseID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return PurchaseDetail{}, ErrNotFound
	} else if err != nil {
		return PurchaseDetail{}, err
	}

	paymentsList, err := s.queries.ListPayments(ctx, db.ListPaymentsParams{
		WorkspaceID:      workspaceID,
		LinkedRecordType: pgtype.Text{String: "purchase", Valid: true},
		LinkedRecordID:   pgtype.Int8{Int64: purchaseID, Valid: true},
		Limit:            100,
	})
	if err != nil {
		return PurchaseDetail{}, err
	}

	var payments []PaymentDetail
	for _, p := range paymentsList {
		legs, _ := s.queries.ListPaymentLegsByPaymentID(ctx, db.ListPaymentLegsByPaymentIDParams{
			PaymentID:   p.ID,
			WorkspaceID: workspaceID,
		})
		payments = append(payments, PaymentDetail{
			Payment: p,
			Legs:    legs,
		})
	}

	items, err := s.queries.ListPurchaseItems(ctx, db.ListPurchaseItemsParams{WorkspaceID: workspaceID, PurchaseID: purchaseID})
	if err != nil {
		return PurchaseDetail{}, err
	}

	files, err := s.queries.ListDocumentFiles(ctx, db.ListDocumentFilesParams{
		WorkspaceID:  workspaceID,
		DocumentType: "purchase",
		DocumentID:   purchaseID,
	})
	var filesView []DocumentFileView
	if err == nil && len(files) > 0 {
		filesView = make([]DocumentFileView, 0, len(files))
		for _, f := range files {
			uploader := "Team"
			if f.UploadedByName != "" {
				uploader = f.UploadedByName
			}
			filesView = append(filesView, DocumentFileView{
				ID:             f.ID,
				EvidenceID:     f.EvidenceID,
				FileName:       f.FileName,
				MimeType:       f.MimeType,
				SizeBytes:      f.SizeBytes,
				CreatedAt:      f.CreatedAt.Time,
				UploadedByName: uploader,
			})
		}
	}

	return PurchaseDetail{
		Purchase: purchase,
		Items:    items,
		Payments: payments,
		Files:    filesView,
	}, nil
}

type ListPurchasesFilter struct {
	Search     string `form:"search"`
	FromDate   string `form:"from"`
	ToDate     string `form:"to"`
	Status     string `form:"status"`
	SupplierID int64  `form:"supplier_id"`
	BeforeID   int64  `form:"before_id"`
	Limit      int32  `form:"limit"`
}

func (s *Service) ListPurchases(ctx context.Context, workspaceID int64, f ListPurchasesFilter) ([]db.Purchase, error) {
	limit := f.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var fromDateParam, toDateParam pgtype.Date
	if f.FromDate != "" {
		if t, err := time.Parse("2006-01-02", f.FromDate); err == nil {
			fromDateParam = pgtype.Date{Time: t, Valid: true}
		}
	}
	if f.ToDate != "" {
		if t, err := time.Parse("2006-01-02", f.ToDate); err == nil {
			toDateParam = pgtype.Date{Time: t, Valid: true}
		}
	}

	var statusParam pgtype.Text
	if f.Status != "" {
		statusParam = pgtype.Text{String: f.Status, Valid: true}
	}

	var supplierIDParam pgtype.Int8
	if f.SupplierID > 0 {
		supplierIDParam = pgtype.Int8{Int64: f.SupplierID, Valid: true}
	}

	var beforeIDParam pgtype.Int8
	if f.BeforeID > 0 {
		beforeIDParam = pgtype.Int8{Int64: f.BeforeID, Valid: true}
	}

	return s.queries.ListPurchases(ctx, db.ListPurchasesParams{
		Search:      searchParam(f.Search),
		WorkspaceID: workspaceID,
		Limit:       limit,
		FromDate:    fromDateParam,
		ToDate:      toDateParam,
		Status:      statusParam,
		SupplierID:  supplierIDParam,
		BeforeID:    beforeIDParam,
	})
}

// ---------------- Payments and Split Payments ----------------

type PaymentLegInput struct {
	MoneyAccountID int64  `json:"money_account_id" binding:"required"`
	AmountMinor    int64  `json:"amount_minor"`
	AmountMajor    string `json:"amount"` // optional
}

// PaymentAllocationInput is intentionally document-specific. A payment leg says
// where cash moved; an allocation says which obligation it settles.
type PaymentAllocationInput struct {
	DocumentType string `json:"document_type" binding:"required"`
	DocumentID   int64  `json:"document_id" binding:"required"`
	AmountMinor  int64  `json:"amount_minor"`
	Amount       string `json:"amount"`
}

type CreatePaymentInput struct {
	Direction        string                   `json:"direction" binding:"required"` // incoming (customer), outgoing (supplier)
	PaymentDate      string                   `json:"payment_date" binding:"required"`
	TotalAmountMinor int64                    `json:"total_amount_minor"`
	TotalAmount      string                   `json:"amount"` // optional
	Currency         string                   `json:"currency"`
	CounterpartyID   *int64                   `json:"counterparty_id"`
	CounterpartyName string                   `json:"counterparty_name"`
	LinkedRecordType string                   `json:"linked_record_type"` // sale, purchase, invoice
	LinkedRecordID   *int64                   `json:"linked_record_id"`
	Allocations      []PaymentAllocationInput `json:"allocations"`
	PaymentLegs      []PaymentLegInput        `json:"payment_legs" binding:"required"`
	Notes            string                   `json:"notes"`
	Reference        string                   `json:"reference"`
	IdempotencyKey   string                   `json:"idempotency_key"`
	// SupplierAdvance is only set by CreateSupplierAdvance. Keeping it out of
	// the public JSON shape prevents the general payment endpoint from quietly
	// changing a cash expense into a supplier prepayment.
	SupplierAdvance bool `json:"-"`
}

type PaymentDetail struct {
	Payment     db.Payment             `json:"payment"`
	Legs        []db.PaymentLeg        `json:"payment_legs"`
	Allocations []db.PaymentAllocation `json:"allocations,omitempty"`
	Ledger      *db.LedgerEntry        `json:"ledger_entry,omitempty"`
	Lines       []db.LedgerLine        `json:"ledger_lines,omitempty"`
}

func (s *Service) CreatePayment(ctx context.Context, workspaceID, userID int64, in CreatePaymentInput) (PaymentDetail, error) {
	// Idempotency check
	idempKey := strings.TrimSpace(in.IdempotencyKey)
	if idempKey != "" {
		existing, err := s.queries.GetPaymentByIdempotency(ctx, db.GetPaymentByIdempotencyParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: pgtype.Text{String: idempKey, Valid: true},
		})
		if err == nil {
			return s.GetPayment(ctx, workspaceID, existing.ID)
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return PaymentDetail{}, err
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PaymentDetail{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := s.queries.WithTx(tx)

	detail, err := s.createPaymentInternal(ctx, qtx, workspaceID, userID, in)
	if err != nil {
		return PaymentDetail{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return PaymentDetail{}, fmt.Errorf("commit payment: %w", err)
	}

	return detail, nil
}

func (s *Service) createPaymentInternal(ctx context.Context, qtx *db.Queries, workspaceID, userID int64, in CreatePaymentInput) (PaymentDetail, error) {
	dir := strings.ToLower(strings.TrimSpace(in.Direction))
	if dir != "incoming" && dir != "outgoing" {
		return PaymentDetail{}, errors.New("payment direction must be incoming or outgoing")
	}

	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := CurrencyExponent(currency)

	totalMinor := in.TotalAmountMinor
	if in.TotalAmount != "" {
		parsed, err := ParseMajorToMinor(in.TotalAmount, exponent)
		if err != nil {
			return PaymentDetail{}, err
		}
		totalMinor = parsed
	}
	if totalMinor <= 0 {
		return PaymentDetail{}, ErrNegativeAmount
	}

	if len(in.PaymentLegs) == 0 {
		return PaymentDetail{}, ErrNoPaymentLegs
	}

	// Validate payment legs sum
	var legsSum int64
	type validatedLeg struct {
		accountID   int64
		amountMinor int64
		account     db.MoneyAccount
	}
	var validatedLegs []validatedLeg

	for _, leg := range in.PaymentLegs {
		legAmount := leg.AmountMinor
		if leg.AmountMajor != "" {
			parsed, err := ParseMajorToMinor(leg.AmountMajor, exponent)
			if err != nil {
				return PaymentDetail{}, err
			}
			legAmount = parsed
		}
		if legAmount <= 0 {
			return PaymentDetail{}, ErrNegativeLegAmount
		}
		legsSum += legAmount

		acc, err := qtx.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{
			ID:          leg.MoneyAccountID,
			WorkspaceID: workspaceID,
		})
		if err != nil {
			return PaymentDetail{}, ErrForbiddenAccount
		}

		validatedLegs = append(validatedLegs, validatedLeg{
			accountID:   acc.ID,
			amountMinor: legAmount,
			account:     acc,
		})
	}

	if legsSum != totalMinor {
		return PaymentDetail{}, fmt.Errorf("%w: legs sum %d != payment total %d", ErrLegsSumMismatch, legsSum, totalMinor)
	}

	pmtDate, err := time.Parse("2006-01-02", strings.TrimSpace(in.PaymentDate))
	if err != nil {
		return PaymentDetail{}, fmt.Errorf("invalid payment date: %w", err)
	}

	// Counterparty
	var cpIDParam pgtype.Int8
	cpName := strings.TrimSpace(in.CounterpartyName)
	if in.CounterpartyID != nil && *in.CounterpartyID > 0 {
		party, err := qtx.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{
			ID:          *in.CounterpartyID,
			WorkspaceID: workspaceID,
		})
		if err != nil {
			return PaymentDetail{}, ErrForbiddenParty
		}
		cpIDParam = pgtype.Int8{Int64: party.ID, Valid: true}
		if cpName == "" {
			cpName = party.Name
		}
	}
	if cpName == "" {
		if dir == "incoming" {
			cpName = "Customer"
		} else {
			cpName = "Supplier"
		}
	}

	// Linked record and allocation validation. A legacy linked record remains
	// supported for one-document payments; allocations are the extensible form.
	var linkedTypeParam pgtype.Text
	var linkedIDParam pgtype.Int8
	type validatedAllocation struct {
		documentType string
		documentID   int64
		amountMinor  int64
	}
	validatedAllocations := make([]validatedAllocation, 0, len(in.Allocations)+1)
	settlesSupplierBill := false
	createsSupplierAdvance := in.SupplierAdvance
	if createsSupplierAdvance {
		if dir != "outgoing" || !cpIDParam.Valid || len(in.Allocations) > 0 || strings.TrimSpace(in.LinkedRecordType) != "" || in.LinkedRecordID != nil {
			return PaymentDetail{}, fmt.Errorf("%w: supplier advance must be an unallocated outgoing supplier payment", ErrInvalidAllocation)
		}
	}

	linkedType := strings.ToLower(strings.TrimSpace(in.LinkedRecordType))
	if len(in.Allocations) > 0 && (linkedType != "" || in.LinkedRecordID != nil) {
		return PaymentDetail{}, fmt.Errorf("%w: use either a linked record or allocations, not both", ErrInvalidAllocation)
	}
	if linkedType != "" && in.LinkedRecordID != nil && *in.LinkedRecordID > 0 {
		linkedTypeParam = pgtype.Text{String: linkedType, Valid: true}
		linkedIDParam = pgtype.Int8{Int64: *in.LinkedRecordID, Valid: true}

		switch linkedType {
		case "sale":
			sale, err := qtx.GetSaleByID(ctx, db.GetSaleByIDParams{
				ID:          *in.LinkedRecordID,
				WorkspaceID: workspaceID,
			})
			if err != nil {
				return PaymentDetail{}, ErrForbiddenRecord
			}
			if sale.Status == "voided" {
				return PaymentDetail{}, ErrCannotPayVoidedRecord
			}
			outstanding := sale.TotalAmountMinor - sale.PaidAmountMinor
			if outstanding <= 0 {
				return PaymentDetail{}, ErrAlreadyFullyPaid
			}
			// OVERPAYMENT PROTECTION
			if totalMinor > outstanding {
				return PaymentDetail{}, fmt.Errorf("%w: payment %d exceeds outstanding %d", ErrOverpayment, totalMinor, outstanding)
			}
			// Update paid amount on sale
			_, err = qtx.UpdateSalePaidAmount(ctx, db.UpdateSalePaidAmountParams{
				ID:              sale.ID,
				WorkspaceID:     workspaceID,
				PaidAmountMinor: totalMinor,
			})
			if err != nil {
				return PaymentDetail{}, fmt.Errorf("update sale paid amount: %w", err)
			}

		case "purchase":
			purchase, err := qtx.GetPurchaseByID(ctx, db.GetPurchaseByIDParams{
				ID:          *in.LinkedRecordID,
				WorkspaceID: workspaceID,
			})
			if err != nil {
				return PaymentDetail{}, ErrForbiddenRecord
			}
			if purchase.Status == "voided" {
				return PaymentDetail{}, ErrCannotPayVoidedRecord
			}
			outstanding := purchase.TotalAmountMinor - purchase.PaidAmountMinor
			if outstanding <= 0 {
				return PaymentDetail{}, ErrAlreadyFullyPaid
			}
			// OVERPAYMENT PROTECTION
			if totalMinor > outstanding {
				return PaymentDetail{}, fmt.Errorf("%w: payment %d exceeds outstanding %d", ErrOverpayment, totalMinor, outstanding)
			}
			// Update paid amount on purchase
			_, err = qtx.UpdatePurchasePaidAmount(ctx, db.UpdatePurchasePaidAmountParams{
				ID:              purchase.ID,
				WorkspaceID:     workspaceID,
				PaidAmountMinor: totalMinor,
			})
			if err != nil {
				return PaymentDetail{}, fmt.Errorf("update purchase paid amount: %w", err)
			}

		case "invoice":
			if dir != "incoming" {
				return PaymentDetail{}, ErrForbiddenRecord
			}
			invoice, err := qtx.GetInvoiceByIDForUpdate(ctx, db.GetInvoiceByIDForUpdateParams{
				ID:          *in.LinkedRecordID,
				WorkspaceID: workspaceID,
			})
			if err != nil {
				return PaymentDetail{}, ErrForbiddenRecord
			}
			if invoice.Status == "voided" || invoice.Status == "draft" {
				return PaymentDetail{}, ErrCannotPayVoidedRecord
			}
			if invoice.Currency != currency {
				return PaymentDetail{}, fmt.Errorf("%w: invoice and payment currencies must match", ErrInvalidCurrency)
			}
			if cpIDParam.Valid && cpIDParam.Int64 != invoice.CustomerID {
				return PaymentDetail{}, ErrForbiddenParty
			}
			outstanding := invoice.TotalAmountMinor - invoice.PaidAmountMinor
			if outstanding <= 0 {
				return PaymentDetail{}, ErrAlreadyFullyPaid
			}
			if totalMinor > outstanding {
				return PaymentDetail{}, fmt.Errorf("%w: payment %d exceeds invoice outstanding %d", ErrOverpayment, totalMinor, outstanding)
			}
			cpIDParam = pgtype.Int8{Int64: invoice.CustomerID, Valid: true}
			cpName = invoice.CustomerName
			if _, err = qtx.UpdateInvoicePaidAmount(ctx, db.UpdateInvoicePaidAmountParams{
				ID:              invoice.ID,
				WorkspaceID:     workspaceID,
				PaidAmountMinor: totalMinor,
			}); err != nil {
				return PaymentDetail{}, fmt.Errorf("update invoice paid amount: %w", err)
			}
			if err := s.createPaidStorefrontSale(ctx, qtx, workspaceID, userID, invoice.ID); err != nil {
				return PaymentDetail{}, fmt.Errorf("record paid online store order: %w", err)
			}
			validatedAllocations = append(validatedAllocations, validatedAllocation{
				documentType: "invoice", documentID: invoice.ID, amountMinor: totalMinor,
			})

		case "supplier_bill":
			if dir != "outgoing" {
				return PaymentDetail{}, ErrForbiddenRecord
			}
			bill, billErr := qtx.GetSupplierBillForUpdate(ctx, db.GetSupplierBillForUpdateParams{ID: *in.LinkedRecordID, WorkspaceID: workspaceID})
			if billErr != nil {
				return PaymentDetail{}, ErrForbiddenRecord
			}
			if bill.Status == "paid" {
				return PaymentDetail{}, ErrAlreadyFullyPaid
			}
			if bill.Status != "approved" && bill.Status != "partially_paid" {
				return PaymentDetail{}, ErrForbiddenRecord
			}
			if bill.Currency != currency || totalMinor > bill.OutstandingMinor {
				return PaymentDetail{}, ErrOverpayment
			}
			if cpIDParam.Valid && cpIDParam.Int64 != bill.SupplierID {
				return PaymentDetail{}, ErrForbiddenParty
			}
			party, partyErr := qtx.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{ID: bill.SupplierID, WorkspaceID: workspaceID})
			if partyErr != nil {
				return PaymentDetail{}, ErrForbiddenParty
			}
			cpIDParam, cpName = pgtype.Int8{Int64: bill.SupplierID, Valid: true}, party.Name
			if _, billErr = qtx.SettleSupplierBill(ctx, db.SettleSupplierBillParams{WorkspaceID: workspaceID, ID: bill.ID, OutstandingMinor: totalMinor}); billErr != nil {
				return PaymentDetail{}, ErrOverpayment
			}
			validatedAllocations = append(validatedAllocations, validatedAllocation{documentType: "supplier_bill", documentID: bill.ID, amountMinor: totalMinor})
			settlesSupplierBill = true

		default:
			return PaymentDetail{}, ErrForbiddenRecord
		}
	}

	if len(in.Allocations) > 0 {
		requested := append([]PaymentAllocationInput(nil), in.Allocations...)
		sort.Slice(requested, func(i, j int) bool {
			if requested[i].DocumentType == requested[j].DocumentType {
				return requested[i].DocumentID < requested[j].DocumentID
			}
			return requested[i].DocumentType < requested[j].DocumentType
		})

		var allocatedTotal int64
		if dir == "outgoing" {
			var allocationSupplierID int64
			for index, allocation := range requested {
				if strings.ToLower(strings.TrimSpace(allocation.DocumentType)) != "supplier_bill" || allocation.DocumentID <= 0 {
					return PaymentDetail{}, fmt.Errorf("%w: outgoing allocations must be supplier bills", ErrInvalidAllocation)
				}
				if index > 0 && allocation.DocumentID == requested[index-1].DocumentID {
					return PaymentDetail{}, fmt.Errorf("%w: a bill may appear only once", ErrInvalidAllocation)
				}
				amount := allocation.AmountMinor
				if strings.TrimSpace(allocation.Amount) != "" {
					parsed, parseErr := ParseMajorToMinor(allocation.Amount, exponent)
					if parseErr != nil {
						return PaymentDetail{}, parseErr
					}
					amount = parsed
				}
				if amount <= 0 {
					return PaymentDetail{}, fmt.Errorf("%w: allocation amount must be greater than zero", ErrInvalidAllocation)
				}
				bill, billErr := qtx.GetSupplierBillForUpdate(ctx, db.GetSupplierBillForUpdateParams{ID: allocation.DocumentID, WorkspaceID: workspaceID})
				if billErr != nil || (bill.Status != "approved" && bill.Status != "partially_paid") || bill.Currency != currency {
					return PaymentDetail{}, ErrForbiddenRecord
				}
				if index == 0 {
					allocationSupplierID = bill.SupplierID
					if cpIDParam.Valid && cpIDParam.Int64 != bill.SupplierID {
						return PaymentDetail{}, ErrForbiddenParty
					}
					cpIDParam = pgtype.Int8{Int64: bill.SupplierID, Valid: true}
					party, partyErr := qtx.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{ID: bill.SupplierID, WorkspaceID: workspaceID})
					if partyErr != nil {
						return PaymentDetail{}, ErrForbiddenParty
					}
					cpName = party.Name
				} else if bill.SupplierID != allocationSupplierID {
					return PaymentDetail{}, fmt.Errorf("%w: all allocated bills must belong to one supplier", ErrInvalidAllocation)
				}
				if amount > bill.OutstandingMinor || allocatedTotal > totalMinor-amount {
					return PaymentDetail{}, ErrOverpayment
				}
				if _, billErr = qtx.SettleSupplierBill(ctx, db.SettleSupplierBillParams{WorkspaceID: workspaceID, ID: bill.ID, OutstandingMinor: amount}); billErr != nil {
					return PaymentDetail{}, ErrOverpayment
				}
				allocatedTotal += amount
				validatedAllocations = append(validatedAllocations, validatedAllocation{documentType: "supplier_bill", documentID: bill.ID, amountMinor: amount})
			}
			if allocatedTotal != totalMinor {
				return PaymentDetail{}, fmt.Errorf("%w: allocation total must equal payment total", ErrInvalidAllocation)
			}
			settlesSupplierBill = true
		} else {
			if dir != "incoming" {
				return PaymentDetail{}, fmt.Errorf("%w: unsupported allocation direction", ErrInvalidAllocation)
			}
			var allocationCustomerID int64
			for index, allocation := range requested {
				if strings.ToLower(strings.TrimSpace(allocation.DocumentType)) != "invoice" || allocation.DocumentID <= 0 {
					return PaymentDetail{}, fmt.Errorf("%w: only invoice allocations are currently supported", ErrInvalidAllocation)
				}
				if index > 0 && allocation.DocumentID == requested[index-1].DocumentID {
					return PaymentDetail{}, fmt.Errorf("%w: an invoice may appear only once", ErrInvalidAllocation)
				}
				amount := allocation.AmountMinor
				if strings.TrimSpace(allocation.Amount) != "" {
					parsed, parseErr := ParseMajorToMinor(allocation.Amount, exponent)
					if parseErr != nil {
						return PaymentDetail{}, parseErr
					}
					amount = parsed
				}
				if amount <= 0 {
					return PaymentDetail{}, fmt.Errorf("%w: allocation amount must be greater than zero", ErrInvalidAllocation)
				}

				invoice, invoiceErr := qtx.GetInvoiceByIDForUpdate(ctx, db.GetInvoiceByIDForUpdateParams{ID: allocation.DocumentID, WorkspaceID: workspaceID})
				if invoiceErr != nil {
					return PaymentDetail{}, ErrForbiddenRecord
				}
				if invoice.Status == "voided" || invoice.Status == "draft" {
					return PaymentDetail{}, ErrCannotPayVoidedRecord
				}
				if invoice.Currency != currency {
					return PaymentDetail{}, fmt.Errorf("%w: invoice and payment currencies must match", ErrInvalidCurrency)
				}
				if index == 0 {
					allocationCustomerID = invoice.CustomerID
					if cpIDParam.Valid && cpIDParam.Int64 != allocationCustomerID {
						return PaymentDetail{}, ErrForbiddenParty
					}
					cpIDParam = pgtype.Int8{Int64: allocationCustomerID, Valid: true}
					cpName = invoice.CustomerName
				} else if invoice.CustomerID != allocationCustomerID {
					return PaymentDetail{}, fmt.Errorf("%w: all allocated invoices must belong to one customer", ErrInvalidAllocation)
				}
				outstanding := invoice.TotalAmountMinor - invoice.PaidAmountMinor
				if outstanding <= 0 {
					return PaymentDetail{}, ErrAlreadyFullyPaid
				}
				if amount > outstanding {
					return PaymentDetail{}, fmt.Errorf("%w: allocation %d exceeds invoice outstanding %d", ErrOverpayment, amount, outstanding)
				}
				if allocatedTotal > totalMinor-amount {
					return PaymentDetail{}, fmt.Errorf("%w: allocations exceed payment total", ErrInvalidAllocation)
				}
				if _, invoiceErr = qtx.UpdateInvoicePaidAmount(ctx, db.UpdateInvoicePaidAmountParams{ID: invoice.ID, WorkspaceID: workspaceID, PaidAmountMinor: amount}); invoiceErr != nil {
					return PaymentDetail{}, fmt.Errorf("update invoice paid amount: %w", invoiceErr)
				}
				if invoiceErr = s.createPaidStorefrontSale(ctx, qtx, workspaceID, userID, invoice.ID); invoiceErr != nil {
					return PaymentDetail{}, fmt.Errorf("record paid online store order: %w", invoiceErr)
				}
				allocatedTotal += amount
				validatedAllocations = append(validatedAllocations, validatedAllocation{documentType: "invoice", documentID: invoice.ID, amountMinor: amount})
			}
			if allocatedTotal != totalMinor {
				return PaymentDetail{}, fmt.Errorf("%w: allocation total must equal payment total", ErrInvalidAllocation)
			}
		}
	}

	var idempParam pgtype.Text
	if strings.TrimSpace(in.IdempotencyKey) != "" {
		idempParam = pgtype.Text{String: strings.TrimSpace(in.IdempotencyKey), Valid: true}
	}

	paymentRecord, err := qtx.CreatePayment(ctx, db.CreatePaymentParams{
		WorkspaceID:      workspaceID,
		Direction:        dir,
		PaymentDate:      pgtype.Date{Time: pmtDate, Valid: true},
		TotalAmountMinor: totalMinor,
		Currency:         currency,
		CurrencyExponent: int32(exponent),
		CounterpartyID:   cpIDParam,
		CounterpartyName: cpName,
		LinkedRecordType: linkedTypeParam,
		LinkedRecordID:   linkedIDParam,
		Status:           "posted",
		Notes:            optionalPgText(in.Notes),
		Reference:        optionalPgText(in.Reference),
		IdempotencyKey:   idempParam,
		CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return PaymentDetail{}, fmt.Errorf("create payment record: %w", err)
	}

	createdAllocations := make([]db.PaymentAllocation, 0, len(validatedAllocations))
	for _, allocation := range validatedAllocations {
		created, createErr := qtx.CreatePaymentAllocation(ctx, db.CreatePaymentAllocationParams{
			PaymentID: paymentRecord.ID, WorkspaceID: workspaceID, DocumentType: allocation.documentType,
			DocumentID: allocation.documentID, AmountMinor: allocation.amountMinor,
		})
		if createErr != nil {
			return PaymentDetail{}, fmt.Errorf("create payment allocation: %w", createErr)
		}
		createdAllocations = append(createdAllocations, created)
	}

	// Create payment legs and update money account balances
	var createdLegs []db.PaymentLeg
	for _, leg := range validatedLegs {
		savedLeg, err := qtx.CreatePaymentLeg(ctx, db.CreatePaymentLegParams{
			PaymentID:      paymentRecord.ID,
			WorkspaceID:    workspaceID,
			MoneyAccountID: leg.accountID,
			AmountMinor:    leg.amountMinor,
		})
		if err != nil {
			return PaymentDetail{}, fmt.Errorf("create payment leg: %w", err)
		}
		createdLegs = append(createdLegs, savedLeg)

		// Update money account balance
		balanceDelta := leg.amountMinor
		if dir == "outgoing" {
			balanceDelta = -leg.amountMinor
		}
		_, err = qtx.UpdateMoneyAccountBalance(ctx, db.UpdateMoneyAccountBalanceParams{
			ID:                  leg.accountID,
			WorkspaceID:         workspaceID,
			CurrentBalanceMinor: balanceDelta,
		})
		if err != nil {
			return PaymentDetail{}, fmt.Errorf("update account balance: %w", err)
		}
	}

	// Create balanced double-entry ledger entry
	ledgerSourceType := "sale"
	if createsSupplierAdvance {
		ledgerSourceType = "supplier_advance"
	}
	entry, err := qtx.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      workspaceID,
		SourceType:       ledgerSourceType,
		SourceID:         paymentRecord.ID,
		EntryDate:        paymentRecord.PaymentDate,
		Currency:         paymentRecord.Currency,
		CurrencyExponent: paymentRecord.CurrencyExponent,
		Description:      optionalPgText(paymentRecord.Notes.String),
	})
	if err != nil {
		return PaymentDetail{}, fmt.Errorf("create payment ledger entry: %w", err)
	}

	var ledgerLines []db.LedgerLine

	if dir == "incoming" {
		// Incoming payment:
		// Debits: Each payment leg (Cash / Bank Asset)
		for _, leg := range validatedLegs {
			l, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
				LedgerEntryID: entry.ID,
				WorkspaceID:   workspaceID,
				AccountID:     pgtype.Int8{Int64: leg.accountID, Valid: true},
				AccountClass:  "asset",
				DebitMinor:    leg.amountMinor,
				CreditMinor:   0,
				Description:   optionalPgText("Receipt into " + leg.account.Name),
			})
			if err != nil {
				return PaymentDetail{}, err
			}
			ledgerLines = append(ledgerLines, l)
		}

		// A settlement of an already-finalized invoice clears Accounts
		// Receivable. It may never create revenue for a second time.
		creditClass := "revenue"
		creditDescription := "Payment received from " + cpName
		if linkedType == "invoice" || len(validatedAllocations) > 0 {
			creditClass = "asset"
			creditDescription = "Settlement of Accounts Receivable: " + cpName
		}
		creditLine, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  creditClass,
			DebitMinor:    0,
			CreditMinor:   totalMinor,
			Description:   optionalPgText(creditDescription),
		})
		if err != nil {
			return PaymentDetail{}, err
		}
		ledgerLines = append(ledgerLines, creditLine)
	} else {
		// Outgoing payment:
		// A supplier-bill settlement clears Accounts Payable. Other outgoing
		// payments keep the historic expense treatment.
		debitClass := "expense"
		debitDescription := "Payment to " + cpName
		if settlesSupplierBill {
			debitClass = "liability"
			debitDescription = "Settlement of Accounts Payable: " + cpName
		} else if createsSupplierAdvance {
			debitClass = "asset"
			debitDescription = "Supplier advance: " + cpName
		}
		debitLine, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  debitClass,
			DebitMinor:    totalMinor,
			CreditMinor:   0,
			Description:   optionalPgText(debitDescription),
		})
		if err != nil {
			return PaymentDetail{}, err
		}
		ledgerLines = append(ledgerLines, debitLine)

		// Credits: Each payment leg (Cash / Bank Asset)
		for _, leg := range validatedLegs {
			l, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
				LedgerEntryID: entry.ID,
				WorkspaceID:   workspaceID,
				AccountID:     pgtype.Int8{Int64: leg.accountID, Valid: true},
				AccountClass:  "asset",
				DebitMinor:    0,
				CreditMinor:   leg.amountMinor,
				Description:   optionalPgText("Disbursement from " + leg.account.Name),
			})
			if err != nil {
				return PaymentDetail{}, err
			}
			ledgerLines = append(ledgerLines, l)
		}
	}

	// Verify exact balance
	var totalDebit, totalCredit int64
	for _, l := range ledgerLines {
		totalDebit += l.DebitMinor
		totalCredit += l.CreditMinor
	}
	if totalDebit != totalCredit || totalDebit != totalMinor {
		return PaymentDetail{}, fmt.Errorf("%w: debit %d != credit %d", ErrLedgerUnbalanced, totalDebit, totalCredit)
	}

	return PaymentDetail{
		Payment:     paymentRecord,
		Legs:        createdLegs,
		Allocations: createdAllocations,
		Ledger:      &entry,
		Lines:       ledgerLines,
	}, nil
}

func (s *Service) GetPayment(ctx context.Context, workspaceID, paymentID int64) (PaymentDetail, error) {
	pmt, err := s.queries.GetPaymentByID(ctx, db.GetPaymentByIDParams{
		ID:          paymentID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return PaymentDetail{}, ErrNotFound
	} else if err != nil {
		return PaymentDetail{}, err
	}

	legs, err := s.queries.ListPaymentLegsByPaymentID(ctx, db.ListPaymentLegsByPaymentIDParams{
		PaymentID:   pmt.ID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return PaymentDetail{}, err
	}
	allocations, err := s.queries.ListPaymentAllocationsByPaymentID(ctx, db.ListPaymentAllocationsByPaymentIDParams{
		PaymentID:   pmt.ID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return PaymentDetail{}, err
	}

	return PaymentDetail{
		Payment:     pmt,
		Legs:        legs,
		Allocations: allocations,
	}, nil
}

type ListPaymentsFilter struct {
	Search           string `form:"search"`
	FromDate         string `form:"from"`
	ToDate           string `form:"to"`
	Direction        string `form:"direction"`
	Status           string `form:"status"`
	LinkedRecordType string `form:"linked_record_type"`
	LinkedRecordID   int64  `form:"linked_record_id"`
	BeforeID         int64  `form:"before_id"`
	Limit            int32  `form:"limit"`
}

func (s *Service) ListPayments(ctx context.Context, workspaceID int64, f ListPaymentsFilter) ([]db.Payment, error) {
	limit := f.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var fromDateParam, toDateParam pgtype.Date
	if f.FromDate != "" {
		if t, err := time.Parse("2006-01-02", f.FromDate); err == nil {
			fromDateParam = pgtype.Date{Time: t, Valid: true}
		}
	}
	if f.ToDate != "" {
		if t, err := time.Parse("2006-01-02", f.ToDate); err == nil {
			toDateParam = pgtype.Date{Time: t, Valid: true}
		}
	}

	var dirParam, statusParam, linkedTypeParam pgtype.Text
	if f.Direction != "" {
		dirParam = pgtype.Text{String: f.Direction, Valid: true}
	}
	if f.Status != "" {
		statusParam = pgtype.Text{String: f.Status, Valid: true}
	}
	if f.LinkedRecordType != "" {
		linkedTypeParam = pgtype.Text{String: f.LinkedRecordType, Valid: true}
	}

	var linkedIDParam, beforeIDParam pgtype.Int8
	if f.LinkedRecordID > 0 {
		linkedIDParam = pgtype.Int8{Int64: f.LinkedRecordID, Valid: true}
	}
	if f.BeforeID > 0 {
		beforeIDParam = pgtype.Int8{Int64: f.BeforeID, Valid: true}
	}

	return s.queries.ListPayments(ctx, db.ListPaymentsParams{
		Search:           searchParam(f.Search),
		WorkspaceID:      workspaceID,
		Limit:            limit,
		FromDate:         fromDateParam,
		ToDate:           toDateParam,
		Direction:        dirParam,
		Status:           statusParam,
		LinkedRecordType: linkedTypeParam,
		LinkedRecordID:   linkedIDParam,
		BeforeID:         beforeIDParam,
	})
}

// settlementLegs prepares the payment taken when a sale or purchase is recorded.
// It may cover the whole total or only part of it (part payment), never more.
// A single leg with no amount means "paid in full".
func settlementLegs(legs []PaymentLegInput, totalMinor int64, exponent int) (int64, []PaymentLegInput, error) {
	out := make([]PaymentLegInput, len(legs))
	var paid int64
	for i, leg := range legs {
		amount := leg.AmountMinor
		if leg.AmountMajor != "" {
			parsed, err := ParseMajorToMinor(leg.AmountMajor, exponent)
			if err != nil {
				return 0, nil, err
			}
			amount = parsed
		}
		if amount == 0 && len(legs) == 1 {
			amount = totalMinor
		}
		if amount <= 0 {
			return 0, nil, ErrNegativeAmount
		}
		out[i] = PaymentLegInput{MoneyAccountID: leg.MoneyAccountID, AmountMinor: amount}
		paid += amount
	}
	if paid > totalMinor {
		return 0, nil, ErrPaidExceedsTotal
	}
	return paid, out, nil
}
