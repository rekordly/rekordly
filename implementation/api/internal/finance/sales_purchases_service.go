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
)

var (
	ErrOverpayment           = errors.New("payment exceeds outstanding balance")
	ErrForbiddenRecord       = errors.New("linked record does not belong to workspace")
	ErrForbiddenParty        = errors.New("counterparty does not belong to workspace")
	ErrLegsSumMismatch       = errors.New("sum of payment legs does not match payment total")
	ErrNoPaymentLegs         = errors.New("at least one payment leg is required")
	ErrNegativeLegAmount     = errors.New("payment leg amount must be greater than zero")
	ErrAlreadyFullyPaid      = errors.New("record is already fully paid")
	ErrCannotPayVoidedRecord = errors.New("cannot record payment against a voided record")
)

// ---------------- Counterparties (External Customers / Suppliers) ----------------

type CreateCounterpartyInput struct {
	Name      string `json:"name" binding:"required"`
	PartyType string `json:"party_type" binding:"required"` // customer, supplier, both
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	Notes     string `json:"notes"`
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

	return s.queries.CreateCounterparty(ctx, db.CreateCounterpartyParams{
		WorkspaceID: workspaceID,
		Name:        name,
		PartyType:   pType,
		Email:       optionalPgText(in.Email),
		Phone:       optionalPgText(in.Phone),
		Notes:       optionalPgText(in.Notes),
		IsActive:    true,
	})
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
}

type SaleDetail struct {
	Sale     db.Sale         `json:"sale"`
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

	var payments []PaymentDetail
	// If immediate payment legs provided, record payment
	if len(in.PaymentLegs) > 0 {
		pmt, err := s.createPaymentInternal(ctx, qtx, workspaceID, userID, CreatePaymentInput{
			Direction:        "incoming",
			PaymentDate:      in.SaleDate,
			TotalAmountMinor: totalMinor,
			Currency:         currency,
			CounterpartyID:   in.CustomerID,
			CounterpartyName: customerName,
			LinkedRecordType: "sale",
			LinkedRecordID:   &saleRecord.ID,
			PaymentLegs:      in.PaymentLegs,
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

	return SaleDetail{
		Sale:     sale,
		Payments: payments,
	}, nil
}

type ListSalesFilter struct {
	FromDate   string `form:"from"`
	ToDate     string `form:"to"`
	Status     string `form:"status"`
	CustomerID int64  `form:"customer_id"`
	BeforeID   int64  `form:"before_id"`
	Limit      int32  `form:"limit"`
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

	var customerIDParam pgtype.Int8
	if f.CustomerID > 0 {
		customerIDParam = pgtype.Int8{Int64: f.CustomerID, Valid: true}
	}

	var beforeIDParam pgtype.Int8
	if f.BeforeID > 0 {
		beforeIDParam = pgtype.Int8{Int64: f.BeforeID, Valid: true}
	}

	return s.queries.ListSales(ctx, db.ListSalesParams{
		WorkspaceID: workspaceID,
		Limit:       limit,
		FromDate:    fromDateParam,
		ToDate:      toDateParam,
		Status:      statusParam,
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
}

type PurchaseDetail struct {
	Purchase db.Purchase     `json:"purchase"`
	Payments []PaymentDetail `json:"payments,omitempty"`
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

	var payments []PaymentDetail
	if len(in.PaymentLegs) > 0 {
		pmt, err := s.createPaymentInternal(ctx, qtx, workspaceID, userID, CreatePaymentInput{
			Direction:        "outgoing",
			PaymentDate:      in.PurchaseDate,
			TotalAmountMinor: totalMinor,
			Currency:         currency,
			CounterpartyID:   in.SupplierID,
			CounterpartyName: supplierName,
			LinkedRecordType: "purchase",
			LinkedRecordID:   &purchaseRecord.ID,
			PaymentLegs:      in.PaymentLegs,
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

	return PurchaseDetail{
		Purchase: purchase,
		Payments: payments,
	}, nil
}

type ListPurchasesFilter struct {
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

type CreatePaymentInput struct {
	Direction        string            `json:"direction" binding:"required"` // incoming (customer), outgoing (supplier)
	PaymentDate      string            `json:"payment_date" binding:"required"`
	TotalAmountMinor int64             `json:"total_amount_minor"`
	TotalAmount      string            `json:"amount"` // optional
	Currency         string            `json:"currency"`
	CounterpartyID   *int64            `json:"counterparty_id"`
	CounterpartyName string            `json:"counterparty_name"`
	LinkedRecordType string            `json:"linked_record_type"` // sale, purchase
	LinkedRecordID   *int64            `json:"linked_record_id"`
	PaymentLegs      []PaymentLegInput `json:"payment_legs" binding:"required"`
	Notes            string            `json:"notes"`
	Reference        string            `json:"reference"`
	IdempotencyKey   string            `json:"idempotency_key"`
}

type PaymentDetail struct {
	Payment db.Payment      `json:"payment"`
	Legs    []db.PaymentLeg `json:"payment_legs"`
	Ledger  *db.LedgerEntry `json:"ledger_entry,omitempty"`
	Lines   []db.LedgerLine `json:"ledger_lines,omitempty"`
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

	// Linked Record and Overpayment Protection!
	var linkedTypeParam pgtype.Text
	var linkedIDParam pgtype.Int8

	linkedType := strings.ToLower(strings.TrimSpace(in.LinkedRecordType))
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
	entry, err := qtx.CreateLedgerEntry(ctx, db.CreateLedgerEntryParams{
		WorkspaceID:      workspaceID,
		SourceType:       "sale",
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

		// Credit: Accounts Receivable / Revenue
		creditLine, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "revenue",
			DebitMinor:    0,
			CreditMinor:   totalMinor,
			Description:   optionalPgText("Payment received from " + cpName),
		})
		if err != nil {
			return PaymentDetail{}, err
		}
		ledgerLines = append(ledgerLines, creditLine)
	} else {
		// Outgoing payment:
		// Debit: Accounts Payable / Expense
		debitLine, err := qtx.CreateLedgerLine(ctx, db.CreateLedgerLineParams{
			LedgerEntryID: entry.ID,
			WorkspaceID:   workspaceID,
			AccountID:     pgtype.Int8{Valid: false},
			AccountClass:  "expense",
			DebitMinor:    totalMinor,
			CreditMinor:   0,
			Description:   optionalPgText("Payment to " + cpName),
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
		Payment: paymentRecord,
		Legs:    createdLegs,
		Ledger:  &entry,
		Lines:   ledgerLines,
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

	return PaymentDetail{
		Payment: pmt,
		Legs:    legs,
	}, nil
}

type ListPaymentsFilter struct {
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
