package finance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

// createPaidStorefrontSale records a paid online order as a Sale. Inventory is
// still issued by the order fulfilment path, so this only writes the sale and
// its lines and cannot move stock a second time.
func (s *Service) createPaidStorefrontSale(ctx context.Context, q *db.Queries, workspaceID, userID, invoiceID int64) error {
	invoice, err := q.GetInvoiceByIDForUpdate(ctx, db.GetInvoiceByIDForUpdateParams{ID: invoiceID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) || err == nil && invoice.PaidAmountMinor < invoice.TotalAmountMinor {
		return nil
	}
	if err != nil {
		return err
	}
	order, err := q.GetStorefrontOrderByInvoiceForUpdate(ctx, db.GetStorefrontOrderByInvoiceForUpdateParams{WorkspaceID: workspaceID, InvoiceID: pgtype.Int8{Int64: invoiceID, Valid: true}})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if order.CommercialStatus != "confirmed" || order.TotalMinor <= 0 || order.Currency != invoice.Currency || invoice.PaidAmountMinor < order.TotalMinor {
		return nil
	}
	if _, err := q.GetSaleByStorefrontOrder(ctx, db.GetSaleByStorefrontOrderParams{WorkspaceID: workspaceID, StorefrontOrderID: pgtype.Int8{Int64: order.ID, Valid: true}}); err == nil {
		return q.UpdateStorefrontOrderPaymentPaid(ctx, db.UpdateStorefrontOrderPaymentPaidParams{WorkspaceID: workspaceID, OrderID: order.ID})
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	date := time.Now().UTC()
	if order.CreatedAt.Valid {
		date = order.CreatedAt.Time.UTC()
	}
	sale, err := q.CreateStorefrontOrderSale(ctx, db.CreateStorefrontOrderSaleParams{
		WorkspaceID: workspaceID, CustomerID: order.CustomerID, CustomerName: order.CustomerName,
		SaleDate: pgtype.Date{Time: date, Valid: true}, TotalAmountMinor: order.TotalMinor,
		PaidAmountMinor: order.TotalMinor, Currency: order.Currency, CurrencyExponent: order.CurrencyExponent,
		Notes:           pgtype.Text{String: "Paid online store order " + order.OrderReference, Valid: true},
		Reference:       pgtype.Text{String: order.OrderReference, Valid: true},
		IdempotencyKey:  pgtype.Text{String: fmt.Sprintf("online-store-order-%d", order.ID), Valid: true},
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: userID > 0}, StorefrontOrderID: pgtype.Int8{Int64: order.ID, Valid: true},
	})
	if err != nil {
		return err
	}
	lines, err := q.ListStorefrontOrderLines(ctx, order.ID)
	if err != nil {
		return err
	}
	for _, line := range lines {
		if line.ConfirmedQuantity.IsZero() {
			continue
		}
		if _, err := q.CreateStorefrontOrderSaleItem(ctx, db.CreateStorefrontOrderSaleItemParams{
			WorkspaceID: workspaceID, SaleID: sale.ID,
			ProductID: pgtype.Int8{Int64: line.ProductID, Valid: line.ProductID > 0}, VariantID: line.VariantID,
			Description: line.TitleSnapshot, Quantity: line.ConfirmedQuantity,
			UnitPriceMinor: line.UnitPriceMinor, AmountMinor: line.LineTotalMinor,
		}); err != nil {
			return err
		}
	}
	return q.UpdateStorefrontOrderPaymentPaid(ctx, db.UpdateStorefrontOrderPaymentPaidParams{WorkspaceID: workspaceID, OrderID: order.ID})
}
