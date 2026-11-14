package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
)

// recordSaleItems saves a sale's lines and takes stock products out of stock.
func recordSaleItems(ctx context.Context, q *db.Queries, workspaceID, saleID, outletID int64, items []preparedStockLine, date time.Time, currency string) ([]db.SaleItem, error) {
	saved := make([]db.SaleItem, 0, len(items))
	var location *db.InventoryLocation
	for _, item := range items {
		row, err := q.CreateSaleItem(ctx, db.CreateSaleItemParams{
			WorkspaceID: workspaceID, SaleID: saleID, ProductID: item.productParam(), VariantID: item.variantID,
			Description: item.description, Quantity: item.quantity, UnitPriceMinor: item.unitMinor, AmountMinor: item.amountMinor,
		})
		if err != nil {
			return nil, fmt.Errorf("save sale item: %w", err)
		}
		saved = append(saved, row)
		if !item.movesStock() {
			continue
		}
		if location == nil {
			found, err := inventoryLocationFor(ctx, q, workspaceID, outletID)
			if err != nil {
				return nil, err
			}
			location = &found
			if err := q.SetSaleLocation(ctx, db.SetSaleLocationParams{WorkspaceID: workspaceID, ID: saleID, LocationID: pgtype.Int8{Int64: found.ID, Valid: true}}); err != nil {
				return nil, err
			}
		}
		if err := issueStockTx(ctx, q, workspaceID, *item.product, *location, item.quantity, date, "sale", saleID, currency); err != nil {
			return nil, err
		}
	}
	return saved, nil
}

// recordPurchaseItems saves a purchase's lines and adds stock products to stock.
func recordPurchaseItems(ctx context.Context, q *db.Queries, workspaceID, purchaseID, outletID int64, items []preparedStockLine, date time.Time, currency string) ([]db.PurchaseItem, error) {
	saved := make([]db.PurchaseItem, 0, len(items))
	var location *db.InventoryLocation
	for _, item := range items {
		row, err := q.CreatePurchaseItem(ctx, db.CreatePurchaseItemParams{
			WorkspaceID: workspaceID, PurchaseID: purchaseID, ProductID: item.productParam(), VariantID: item.variantID,
			Description: item.description, Quantity: item.quantity, UnitCostMinor: item.unitMinor, AmountMinor: item.amountMinor,
		})
		if err != nil {
			return nil, fmt.Errorf("save purchase item: %w", err)
		}
		saved = append(saved, row)
		if !item.movesStock() {
			continue
		}
		if location == nil {
			found, err := inventoryLocationFor(ctx, q, workspaceID, outletID)
			if err != nil {
				return nil, err
			}
			location = &found
			if err := q.SetPurchaseLocation(ctx, db.SetPurchaseLocationParams{WorkspaceID: workspaceID, ID: purchaseID, LocationID: pgtype.Int8{Int64: found.ID, Valid: true}}); err != nil {
				return nil, err
			}
		}
		if err := receiveStockTx(ctx, q, workspaceID, *item.product, *location, item.quantity, item.amountMinor, date, "purchase", purchaseID, currency); err != nil {
			return nil, err
		}
	}
	return saved, nil
}

// invoiceItemProduct checks an invoice line's product and variant belong to this workspace.
func invoiceItemProduct(ctx context.Context, q *db.Queries, workspaceID int64, item InvoiceItemInput) (pgtype.Int8, pgtype.Int8, error) {
	if item.ProductID == nil || *item.ProductID <= 0 {
		return pgtype.Int8{}, pgtype.Int8{}, nil
	}
	product, err := q.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: *item.ProductID})
	if err != nil {
		return pgtype.Int8{}, pgtype.Int8{}, fmt.Errorf("item %q: product not found", item.Description)
	}
	productID := pgtype.Int8{Int64: product.ID, Valid: true}
	if item.VariantID == nil || *item.VariantID <= 0 {
		return productID, pgtype.Int8{}, nil
	}
	variant, err := q.GetVariantByID(ctx, db.GetVariantByIDParams{WorkspaceID: workspaceID, ID: *item.VariantID})
	if err != nil || variant.ProductID != product.ID {
		return pgtype.Int8{}, pgtype.Int8{}, fmt.Errorf("item %q: this variant does not belong to %s", item.Description, product.Name)
	}
	return productID, pgtype.Int8{Int64: variant.ID, Valid: true}, nil
}

// issueInvoiceStock takes an invoice's stock products out of stock when it is finalized.
func issueInvoiceStock(ctx context.Context, q *db.Queries, workspaceID int64, inv db.Invoice) error {
	items, err := q.ListInvoiceItemsByInvoiceID(ctx, db.ListInvoiceItemsByInvoiceIDParams{InvoiceID: inv.ID, WorkspaceID: workspaceID})
	if err != nil {
		return err
	}
	var location *db.InventoryLocation
	for _, item := range items {
		if !item.ProductID.Valid {
			continue
		}
		product, err := q.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: item.ProductID.Int64})
		if err != nil {
			return err
		}
		if product.Kind != "stock_tracked" {
			continue
		}
		if location == nil {
			found, err := inventoryLocationFor(ctx, q, workspaceID, inv.OutletID.Int64)
			if err != nil {
				return err
			}
			location = &found
		}
		date := time.Now().UTC()
		if inv.IssueDate.Valid {
			date = inv.IssueDate.Time
		}
		if err := issueStockTx(ctx, q, workspaceID, product, *location, decimal.NewFromInt32(item.Quantity), date, "invoice", inv.ID, inv.Currency); err != nil {
			return err
		}
	}
	return nil
}
