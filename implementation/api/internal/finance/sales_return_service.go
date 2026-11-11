package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
)

var (
	ErrInsufficientCustomerCredit = errors.New("insufficient customer credit balance")
	ErrNoReturnItems              = errors.New("sales return must have at least one line item")
)

type SalesReturnItemInput struct {
	Description      string `json:"description" binding:"required"`
	CatalogueItemID  int64  `json:"catalogue_item_id"` // optional
	Quantity         string `json:"quantity"`          // decimal string e.g. "1"
	UnitPriceMinor   int64  `json:"unit_price_minor"`
	UnitPrice        string `json:"unit_price"` // optional major string
	RestockInventory bool   `json:"restock_inventory"`
	OutletID         int64  `json:"outlet_id"` // required if RestockInventory is true
}

type CreateSalesReturnInput struct {
	ReturnNumber   string                 `json:"return_number"` // optional
	SaleID         int64                  `json:"sale_id"`       // optional linked sale
	InvoiceID      int64                  `json:"invoice_id"`    // optional linked invoice
	CustomerID     int64                  `json:"customer_id"`
	CustomerName   string                 `json:"customer_name"`
	ReturnDate     string                 `json:"return_date" binding:"required"` // YYYY-MM-DD
	Currency       string                 `json:"currency"`
	TaxAmountMinor int64                  `json:"tax_amount_minor"`
	TaxAmount      string                 `json:"tax_amount"`
	Reason         string                 `json:"reason" binding:"required"`
	ActionTaken    string                 `json:"action_taken"` // customer_credit, refund, invoice_reduction
	Items          []SalesReturnItemInput `json:"items" binding:"required"`
	IdempotencyKey string                 `json:"idempotency_key"`
}

type SalesReturnDetail struct {
	SalesReturn db.SalesReturn        `json:"sales_return"`
	Items       []db.SalesReturnItem  `json:"items"`
}

type CustomerCreditDetail struct {
	Credit       *db.CustomerCredit             `json:"credit"`
	Transactions []db.CustomerCreditTransaction `json:"transactions"`
}

func (s *Service) CreateSalesReturn(ctx context.Context, workspaceID, userID int64, in CreateSalesReturnInput) (SalesReturnDetail, error) {
	if len(in.Items) == 0 {
		return SalesReturnDetail{}, ErrNoReturnItems
	}

	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	exponent := CurrencyExponent(currency)

	var custID pgtype.Int8
	custName := strings.TrimSpace(in.CustomerName)
	if in.CustomerID > 0 {
		party, err := s.queries.GetCounterpartyByID(ctx, db.GetCounterpartyByIDParams{
			ID:          in.CustomerID,
			WorkspaceID: workspaceID,
		})
		if err != nil {
			return SalesReturnDetail{}, ErrForbiddenParty
		}
		custID = pgtype.Int8{Int64: in.CustomerID, Valid: true}
		if custName == "" {
			custName = party.Name
		}
	}
	if custName == "" {
		custName = "Customer"
	}

	retDate, err := time.Parse("2006-01-02", in.ReturnDate)
	if err != nil {
		return SalesReturnDetail{}, fmt.Errorf("invalid return_date: %w", err)
	}

	retNumber := strings.TrimSpace(in.ReturnNumber)
	if retNumber == "" {
		count, _ := s.countSalesReturns(ctx, workspaceID)
		retNumber = fmt.Sprintf("CRN-%04d", count+1)
	}

	actionTaken := strings.ToLower(strings.TrimSpace(in.ActionTaken))
	if actionTaken == "" {
		actionTaken = "customer_credit"
	}

	type lineCalc struct {
		description      string
		catalogueItemID  int64
		quantity         decimal.Decimal
		unitPrice        int64
		amount           int64
		restockInventory bool
		outletID         int64
	}

	var lines []lineCalc
	var subtotal int64

	for _, it := range in.Items {
		desc := strings.TrimSpace(it.Description)
		if desc == "" {
			return SalesReturnDetail{}, errors.New("item description cannot be empty")
		}

		qtyStr := strings.TrimSpace(it.Quantity)
		if qtyStr == "" {
			qtyStr = "1"
		}
		qty, err := decimal.NewFromString(qtyStr)
		if err != nil || qty.LessThanOrEqual(decimal.Zero) {
			return SalesReturnDetail{}, errors.New("quantity must be greater than zero")
		}

		unitPrice := it.UnitPriceMinor
		if unitPrice == 0 && it.UnitPrice != "" {
			parsed, err := ParseMajorToMinor(it.UnitPrice, exponent)
			if err != nil {
				return SalesReturnDetail{}, fmt.Errorf("invalid unit_price: %w", err)
			}
			unitPrice = parsed
		}
		if unitPrice < 0 {
			return SalesReturnDetail{}, errors.New("unit price cannot be negative")
		}

		lineAmount := qty.Mul(decimal.NewFromInt(unitPrice)).Round(0).IntPart()
		subtotal += lineAmount

		lines = append(lines, lineCalc{
			description:      desc,
			catalogueItemID:  it.CatalogueItemID,
			quantity:         qty,
			unitPrice:        unitPrice,
			amount:           lineAmount,
			restockInventory: it.RestockInventory,
			outletID:         it.OutletID,
		})
	}

	tax := in.TaxAmountMinor
	if tax == 0 && in.TaxAmount != "" {
		parsed, err := ParseMajorToMinor(in.TaxAmount, exponent)
		if err != nil {
			return SalesReturnDetail{}, fmt.Errorf("invalid tax_amount: %w", err)
		}
		tax = parsed
	}
	total := subtotal + tax

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SalesReturnDetail{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	var saleID pgtype.Int8
	if in.SaleID > 0 {
		saleID = pgtype.Int8{Int64: in.SaleID, Valid: true}
	}
	var invoiceID pgtype.Int8
	if in.InvoiceID > 0 {
		invoiceID = pgtype.Int8{Int64: in.InvoiceID, Valid: true}
	}

	ret, err := qtx.CreateSalesReturn(ctx, db.CreateSalesReturnParams{
		WorkspaceID:      workspaceID,
		ReturnNumber:     retNumber,
		SaleID:           saleID,
		InvoiceID:        invoiceID,
		CustomerID:       custID,
		CustomerName:     custName,
		ReturnDate:       pgtype.Date{Time: retDate, Valid: true},
		Currency:         currency,
		CurrencyExponent: int32(exponent),
		SubtotalMinor:    subtotal,
		TaxAmountMinor:   tax,
		TotalAmountMinor: total,
		Reason:           in.Reason,
		Status:           "issued",
		ActionTaken:      actionTaken,
		CreatedByUserID:  pgtype.Int8{Int64: userID, Valid: userID > 0},
		IdempotencyKey:   pgtype.Text{String: in.IdempotencyKey, Valid: in.IdempotencyKey != ""},
	})
	if err != nil {
		return SalesReturnDetail{}, fmt.Errorf("failed to create sales return: %w", err)
	}

	var insertedItems []db.SalesReturnItem
	for _, l := range lines {
		var catID pgtype.Int8
		if l.catalogueItemID > 0 {
			catID = pgtype.Int8{Int64: l.catalogueItemID, Valid: true}
		}
		var outID pgtype.Int8
		if l.outletID > 0 {
			outID = pgtype.Int8{Int64: l.outletID, Valid: true}
		}

		item, err := qtx.CreateSalesReturnItem(ctx, db.CreateSalesReturnItemParams{
			SalesReturnID:    ret.ID,
			WorkspaceID:      workspaceID,
			Description:      l.description,
			CatalogueItemID:  catID,
			Quantity:         l.quantity,
			UnitPriceMinor:   l.unitPrice,
			AmountMinor:      l.amount,
			RestockInventory: l.restockInventory,
			OutletID:         outID,
		})
		if err != nil {
			return SalesReturnDetail{}, fmt.Errorf("failed to insert return item: %w", err)
		}
		insertedItems = append(insertedItems, item)

		// Restock inventory if requested
		if l.restockInventory && l.catalogueItemID > 0 && l.outletID > 0 {
			qtyInt := l.quantity.Round(0).IntPart()
			_, _ = tx.Exec(ctx, `
				INSERT INTO inventory_balances (workspace_id, outlet_id, item_id, quantity_on_hand, quantity_reserved)
				VALUES ($1, $2, $3, $4, 0)
				ON CONFLICT (workspace_id, outlet_id, item_id)
				DO UPDATE SET quantity_on_hand = inventory_balances.quantity_on_hand + $4, updated_at = now()
			`, workspaceID, l.outletID, l.catalogueItemID, qtyInt)
		}
	}

	// If customer credit was chosen and customer is known, credit the customer
	if actionTaken == "customer_credit" && in.CustomerID > 0 {
		credit, err := qtx.UpsertCustomerCredit(ctx, db.UpsertCustomerCreditParams{
			WorkspaceID:  workspaceID,
			CustomerID:   in.CustomerID,
			Currency:     currency,
			BalanceMinor: total,
		})
		if err == nil {
			_, _ = qtx.CreateCustomerCreditTransaction(ctx, db.CreateCustomerCreditTransactionParams{
				WorkspaceID: workspaceID,
				CreditID:    credit.ID,
				Direction:   "credit",
				AmountMinor: total,
				SourceType:  "sales_return",
				SourceID:    pgtype.Int8{Int64: ret.ID, Valid: true},
				Notes:       pgtype.Text{String: fmt.Sprintf("Credit from %s: %s", retNumber, in.Reason), Valid: true},
			})
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return SalesReturnDetail{}, err
	}

	return SalesReturnDetail{
		SalesReturn: ret,
		Items:       insertedItems,
	}, nil
}

func (s *Service) GetSalesReturn(ctx context.Context, workspaceID, returnID int64) (SalesReturnDetail, error) {
	ret, err := s.queries.GetSalesReturnByID(ctx, db.GetSalesReturnByIDParams{
		ID:          returnID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return SalesReturnDetail{}, err
	}

	items, err := s.queries.ListSalesReturnItems(ctx, db.ListSalesReturnItemsParams{
		SalesReturnID: returnID,
		WorkspaceID:   workspaceID,
	})
	if err != nil {
		return SalesReturnDetail{}, err
	}

	return SalesReturnDetail{
		SalesReturn: ret,
		Items:       items,
	}, nil
}

func (s *Service) ListSalesReturns(ctx context.Context, workspaceID int64, params db.ListSalesReturnsParams) ([]db.SalesReturn, error) {
	params.WorkspaceID = workspaceID
	if params.Limit <= 0 {
		params.Limit = 50
	}
	return s.queries.ListSalesReturns(ctx, params)
}

func (s *Service) GetCustomerCredit(ctx context.Context, workspaceID, customerID int64, currency string) (CustomerCreditDetail, error) {
	if currency == "" {
		currency = "NGN"
	}
	credit, err := s.queries.GetCustomerCredit(ctx, db.GetCustomerCreditParams{
		WorkspaceID: workspaceID,
		CustomerID:  customerID,
		Currency:    currency,
	})
	if err != nil {
		return CustomerCreditDetail{Credit: nil, Transactions: nil}, nil
	}

	txs, err := s.queries.ListCustomerCreditTransactions(ctx, db.ListCustomerCreditTransactionsParams{
		WorkspaceID: workspaceID,
		CreditID:    credit.ID,
		Limit:       20,
	})
	if err != nil {
		txs = nil
	}

	return CustomerCreditDetail{
		Credit:       &credit,
		Transactions: txs,
	}, nil
}

func (s *Service) ApplyCustomerCreditToInvoice(ctx context.Context, workspaceID, userID, customerID, invoiceID, amountMinor int64) (InvoiceDetail, error) {
	if amountMinor <= 0 {
		return InvoiceDetail{}, errors.New("amount to apply must be greater than zero")
	}

	inv, err := s.queries.GetInvoiceByID(ctx, db.GetInvoiceByIDParams{
		ID:          invoiceID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return InvoiceDetail{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return InvoiceDetail{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	credit, err := qtx.GetCustomerCreditForUpdate(ctx, db.GetCustomerCreditForUpdateParams{
		WorkspaceID: workspaceID,
		CustomerID:  customerID,
		Currency:    inv.Currency,
	})
	if err != nil || credit.BalanceMinor < amountMinor {
		return InvoiceDetail{}, ErrInsufficientCustomerCredit
	}

	newBalance := credit.BalanceMinor - amountMinor
	_, err = qtx.UpdateCustomerCreditBalance(ctx, db.UpdateCustomerCreditBalanceParams{
		ID:           credit.ID,
		WorkspaceID:  workspaceID,
		CustomerID:   customerID,
		BalanceMinor: newBalance,
	})
	if err != nil {
		return InvoiceDetail{}, err
	}

	_, _ = qtx.CreateCustomerCreditTransaction(ctx, db.CreateCustomerCreditTransactionParams{
		WorkspaceID: workspaceID,
		CreditID:    credit.ID,
		Direction:   "debit",
		AmountMinor: amountMinor,
		SourceType:  "invoice_application",
		SourceID:    pgtype.Int8{Int64: inv.ID, Valid: true},
		Notes:       pgtype.Text{String: fmt.Sprintf("Applied to %s", inv.InvoiceNumber), Valid: true},
	})

	if err := tx.Commit(ctx); err != nil {
		return InvoiceDetail{}, err
	}

	// Record payment on invoice using service
	return s.PayInvoiceWithWallet(ctx, workspaceID, userID, inv.ID, amountMinor)
}

func (s *Service) countSalesReturns(ctx context.Context, workspaceID int64) (int64, error) {
	var count int64
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM sales_returns WHERE workspace_id = $1`, workspaceID).Scan(&count)
	return count, err
}

func formatMinorString(amountMinor int64, exponent int32) string {
	d := decimal.NewFromInt(amountMinor).Div(decimal.NewFromInt(10).Pow(decimal.NewFromInt(int64(exponent))))
	return d.StringFixed(exponent)
}
