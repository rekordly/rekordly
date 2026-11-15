package finance_test

import (
	"context"
	"errors"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

// Stock follows sales, purchases and invoices, and the manual add/remove commands.
func TestStockFollowsSalesPurchasesAndInvoices(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "stock-records")
	svc := finance.NewService(pool)
	ctx := context.Background()

	product, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name: "Groundnut oil 5L", Kind: "stock_tracked", UnitName: "bottle", SellingPrice: "100.00", Currency: "NGN", IdempotencyKey: "oil-1",
	})
	require.NoError(t, err)
	pid := product.ID

	balance := func() (string, int64) {
		t.Helper()
		var qty string
		var value int64
		err := pool.QueryRow(ctx, `SELECT COALESCE(SUM(quantity_on_hand),0)::numeric(18,4)::text, COALESCE(SUM(value_on_hand_minor),0)
			FROM inventory_balances WHERE workspace_id = $1 AND product_id = $2`, ws, pid).Scan(&qty, &value)
		require.NoError(t, err)
		return qty, value
	}
	line := func(qty, price string) []finance.StockLineInput {
		return []finance.StockLineInput{{ProductID: &pid, Quantity: qty, UnitPrice: price}}
	}

	// Two purchases at different costs: stock adds up and the average cost moves.
	p1, err := svc.CreatePurchase(ctx, ws, user, finance.CreatePurchaseInput{PurchaseDate: "2026-11-01", Currency: "NGN", Items: line("10", "50.00"), IdempotencyKey: "buy-1"})
	require.NoError(t, err)
	require.Equal(t, int64(50000), p1.Purchase.TotalAmountMinor, "total comes from the items")
	require.Len(t, p1.Items, 1)
	_, err = svc.CreatePurchase(ctx, ws, user, finance.CreatePurchaseInput{PurchaseDate: "2026-11-02", Currency: "NGN", Items: line("10", "70.00"), IdempotencyKey: "buy-2"})
	require.NoError(t, err)
	qty, value := balance()
	require.Equal(t, "20.0000", qty)
	require.Equal(t, int64(120000), value) // average 60.00

	// A sale takes stock out at the average cost.
	s1, err := svc.CreateSale(ctx, ws, user, finance.CreateSaleInput{SaleDate: "2026-11-03", Currency: "NGN", Items: line("5", "100.00"), IdempotencyKey: "sell-1"})
	require.NoError(t, err)
	require.Equal(t, int64(50000), s1.Sale.TotalAmountMinor)
	qty, value = balance()
	require.Equal(t, "15.0000", qty)
	require.Equal(t, int64(90000), value)

	// Selling more than is in stock is refused, and nothing is saved.
	var salesBefore int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM sales WHERE workspace_id = $1`, ws).Scan(&salesBefore))
	_, err = svc.CreateSale(ctx, ws, user, finance.CreateSaleInput{SaleDate: "2026-11-03", Currency: "NGN", Items: line("100", "100.00"), IdempotencyKey: "sell-too-many"})
	require.Error(t, err)
	require.True(t, errors.Is(err, finance.ErrInsufficientStock))
	require.Contains(t, err.Error(), "Only 15 bottle of Groundnut oil 5L left")
	var salesAfter int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM sales WHERE workspace_id = $1`, ws).Scan(&salesAfter))
	require.Equal(t, salesBefore, salesAfter)

	// A draft invoice does not move stock; finalizing does; voiding puts it back.
	customer, err := svc.CreateCounterparty(ctx, ws, finance.CreateCounterpartyInput{Name: "Mama Tunde", PartyType: "customer"})
	require.NoError(t, err)
	inv, err := svc.CreateInvoice(ctx, ws, user, finance.CreateInvoiceInput{
		CustomerID: customer.ID, IssueDate: "2026-11-04", DueDate: "2026-11-18", Currency: "NGN",
		Items: []finance.InvoiceItemInput{{Description: "Groundnut oil 5L", Quantity: 3, UnitPrice: "100.00", ProductID: &pid}},
	})
	require.NoError(t, err)
	qty, _ = balance()
	require.Equal(t, "15.0000", qty, "a draft invoice leaves stock alone")
	_, err = svc.FinalizeInvoice(ctx, ws, user, inv.Invoice.ID)
	require.NoError(t, err)
	qty, value = balance()
	require.Equal(t, "12.0000", qty)
	require.Equal(t, int64(72000), value)
	_, err = svc.VoidInvoice(ctx, ws, user, inv.Invoice.ID, "Customer cancelled")
	require.NoError(t, err)
	qty, value = balance()
	require.Equal(t, "15.0000", qty)
	require.Equal(t, int64(90000), value)

	// Removing and adding by hand.
	_, err = svc.ChangeProductStock(ctx, ws, user, pid, finance.ProductStockChangeInput{Direction: "remove", Quantity: "2", Reason: "damage", IdempotencyKey: "rm-1"})
	require.NoError(t, err)
	_, err = svc.ChangeProductStock(ctx, ws, user, pid, finance.ProductStockChangeInput{Direction: "add", Quantity: "1", Reason: "found", IdempotencyKey: "add-1"})
	require.NoError(t, err)
	_, err = svc.ChangeProductStock(ctx, ws, user, pid, finance.ProductStockChangeInput{Direction: "add", Quantity: "4", Reason: "restock", IdempotencyKey: "add-2"})
	require.Error(t, err, "new stock needs a cost")
	qty, _ = balance()
	require.Equal(t, "14.0000", qty)

	// The history reads in plain words, newest first.
	movements, err := svc.ListProductStockMovements(ctx, ws, pid, 0, 50)
	require.NoError(t, err)
	summaries := make([]string, 0, len(movements))
	for _, m := range movements {
		summaries = append(summaries, m.Summary)
	}
	require.Contains(t, summaries, "Bought")
	require.Contains(t, summaries, "Sold")
	require.Contains(t, summaries, "Invoiced")
	require.Contains(t, summaries, "Returned (invoice voided)")
	require.Contains(t, summaries, "Damaged")
	require.Contains(t, summaries, "Found stock")

	// Every stock ledger entry balances.
	var unbalanced int
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT count(*) FROM (
			SELECT le.id FROM ledger_entries le JOIN ledger_lines ll ON ll.ledger_entry_id = le.id
			WHERE le.workspace_id = $1 GROUP BY le.id HAVING SUM(ll.debit_minor) <> SUM(ll.credit_minor)
		) x`, ws).Scan(&unbalanced))
	require.Equal(t, 0, unbalanced)
}

func TestVariantOptionsAndStock(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "variant-stock")
	svc := finance.NewService(pool)
	ctx := context.Background()

	created, err := svc.CreateProductV2(ctx, ws, user, finance.SaveProductInput{
		Name:           "Ankara dress",
		Kind:           "stock_tracked",
		Status:         "active",
		UnitName:       "pc",
		SellingPrice:   "150.00",
		CostPrice:      "80.00",
		Currency:       "NGN",
		IdempotencyKey: "ankara-create-1",
	})
	require.NoError(t, err)
	pid := created.Product.ID
	require.Equal(t, int64(1), created.Product.VariantCount)

	// Configure Colour (Red, Blue) x Size (S, M) = 4 sellable variants.
	configured, err := svc.SaveProductOptions(ctx, ws, user, pid, finance.SaveProductOptionsInput{
		Options: []finance.SaveOptionInput{
			{Name: "Colour", Values: []finance.SaveOptionValueInput{{Value: "Red"}, {Value: "Blue"}}},
			{Name: "Size", Values: []finance.SaveOptionValueInput{{Value: "S"}, {Value: "M"}}},
		},
		Variants: []finance.SaveOptionVariantInput{
			{OptionValues: []string{"Red", "S"}, SellingPrice: "150.00", CostPrice: "80.00", IsActive: true},
			{OptionValues: []string{"Red", "M"}, SellingPrice: "160.00", CostPrice: "85.00", IsActive: true},
			{OptionValues: []string{"Blue", "S"}, SellingPrice: "150.00", CostPrice: "80.00", IsActive: true},
			{OptionValues: []string{"Blue", "M"}, SellingPrice: "160.00", CostPrice: "85.00", IsActive: true},
		},
		IdempotencyKey: "ankara-opts-1",
	})
	require.NoError(t, err)
	require.Len(t, configured.Options, 2)
	require.Equal(t, int64(4), configured.Product.VariantCount)

	variantByName := map[string]finance.VariantView{}
	for _, v := range configured.Variants {
		if !v.IsDefault && v.ArchivedAt == nil {
			variantByName[v.Name] = v
		}
	}
	require.Len(t, variantByName, 4)
	redS := variantByName["Red / S"].ID
	redM := variantByName["Red / M"].ID
	blueS := variantByName["Blue / S"].ID
	blueM := variantByName["Blue / M"].ID

	// Add stock to Red / S (5), Red / M (3), Blue / S (2).
	_, err = svc.ChangeProductStock(ctx, ws, user, pid, finance.ProductStockChangeInput{
		VariantID: &redS, Direction: "add", Quantity: "5", Reason: "restock", UnitCost: "80.00", IdempotencyKey: "v-open-1",
	})
	require.NoError(t, err)
	_, err = svc.ChangeProductStock(ctx, ws, user, pid, finance.ProductStockChangeInput{
		VariantID: &redM, Direction: "add", Quantity: "3", Reason: "restock", UnitCost: "85.00", IdempotencyKey: "v-open-2",
	})
	require.NoError(t, err)
	_, err = svc.ChangeProductStock(ctx, ws, user, pid, finance.ProductStockChangeInput{
		VariantID: &blueS, Direction: "add", Quantity: "2", Reason: "restock", UnitCost: "80.00", IdempotencyKey: "v-open-3",
	})
	require.NoError(t, err)

	detail, err := svc.GetProduct(ctx, ws, pid)
	require.NoError(t, err)
	require.Equal(t, "10", detail.Product.QuantityOnHand)

	// Selling without choosing a variant is refused.
	_, err = svc.CreateSale(ctx, ws, user, finance.CreateSaleInput{
		SaleDate:       "2026-11-05",
		Currency:       "NGN",
		Items:          []finance.StockLineInput{{ProductID: &pid, Quantity: "1", UnitPrice: "150.00"}},
		IdempotencyKey: "v-sale-no-variant",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "choose a variant for Ankara dress")

	// Selling 2 of Red / M reduces only Red / M (from 3 to 1).
	_, err = svc.CreateSale(ctx, ws, user, finance.CreateSaleInput{
		SaleDate:       "2026-11-05",
		Currency:       "NGN",
		Items:          []finance.StockLineInput{{ProductID: &pid, VariantID: &redM, Quantity: "2", UnitPrice: "160.00"}},
		IdempotencyKey: "v-sale-redm",
	})
	require.NoError(t, err)

	// Selling 3 more of Red / M fails naming Red / M even though Red / S has 5 left.
	_, err = svc.CreateSale(ctx, ws, user, finance.CreateSaleInput{
		SaleDate:       "2026-11-05",
		Currency:       "NGN",
		Items:          []finance.StockLineInput{{ProductID: &pid, VariantID: &redM, Quantity: "3", UnitPrice: "160.00"}},
		IdempotencyKey: "v-sale-redm-too-many",
	})
	require.Error(t, err)
	require.True(t, errors.Is(err, finance.ErrInsufficientStock))
	require.Contains(t, err.Error(), "Only 1 pc of Ankara dress (Red / M) left")

	// Buying 4 of Blue / M adds stock only to Blue / M.
	_, err = svc.CreatePurchase(ctx, ws, user, finance.CreatePurchaseInput{
		PurchaseDate:   "2026-11-06",
		Currency:       "NGN",
		Items:          []finance.StockLineInput{{ProductID: &pid, VariantID: &blueM, Quantity: "4", UnitPrice: "90.00"}},
		IdempotencyKey: "v-buy-bluem",
	})
	require.NoError(t, err)

	detail, err = svc.GetProduct(ctx, ws, pid)
	require.NoError(t, err)
	require.Equal(t, "12", detail.Product.QuantityOnHand) // 5 + 1 + 2 + 4

	// Edit options: keep M, add L, remove S. Red / M and Blue / M keep their IDs and stock; S variants are archived.
	var colourOptID, sizeOptID, redValID, blueValID, mValID int64
	for _, opt := range detail.Options {
		if opt.Name == "Colour" {
			colourOptID = opt.ID
			for _, v := range opt.ValueDetails {
				if v.Value == "Red" {
					redValID = v.ID
				}
				if v.Value == "Blue" {
					blueValID = v.ID
				}
			}
		}
		if opt.Name == "Size" {
			sizeOptID = opt.ID
			for _, v := range opt.ValueDetails {
				if v.Value == "M" {
					mValID = v.ID
				}
			}
		}
	}

	updated, err := svc.SaveProductOptions(ctx, ws, user, pid, finance.SaveProductOptionsInput{
		Options: []finance.SaveOptionInput{
			{ID: colourOptID, Name: "Colour", Values: []finance.SaveOptionValueInput{{ID: redValID, Value: "Red"}, {ID: blueValID, Value: "Blue"}}},
			{ID: sizeOptID, Name: "Size", Values: []finance.SaveOptionValueInput{{ID: mValID, Value: "M"}, {Value: "L"}}},
		},
		Variants: []finance.SaveOptionVariantInput{
			{ID: redM, OptionValues: []string{"Red", "M"}, SellingPrice: "160.00", CostPrice: "85.00", IsActive: true},
			{OptionValues: []string{"Red", "L"}, SellingPrice: "170.00", CostPrice: "90.00", IsActive: true},
			{ID: blueM, OptionValues: []string{"Blue", "M"}, SellingPrice: "160.00", CostPrice: "85.00", IsActive: true},
			{OptionValues: []string{"Blue", "L"}, SellingPrice: "170.00", CostPrice: "90.00", IsActive: true},
		},
		IdempotencyKey: "ankara-opts-2",
	})
	require.NoError(t, err)
	require.Equal(t, int64(4), updated.Product.VariantCount)

	var archivedCount int
	for _, v := range updated.Variants {
		if v.ArchivedAt != nil {
			archivedCount++
		}
		if v.ID == redM {
			require.Nil(t, v.ArchivedAt)
			require.Equal(t, "1", v.QuantityOnHand)
		}
		if v.ID == blueM {
			require.Nil(t, v.ArchivedAt)
			require.Equal(t, "4", v.QuantityOnHand)
		}
	}
	require.Equal(t, 2, archivedCount, "removed S variants with stock are archived, not deleted")

	movements, err := svc.ListProductStockMovements(ctx, ws, pid, 0, 50)
	require.NoError(t, err)
	require.NotEmpty(t, movements)
	var sawRedMSale, sawBlueMPurchase bool
	for _, m := range movements {
		if m.Summary == "Sold" && m.VariantName == "Red / M" {
			sawRedMSale = true
		}
		if m.Summary == "Bought" && m.VariantName == "Blue / M" {
			sawBlueMPurchase = true
		}
	}
	require.True(t, sawRedMSale)
	require.True(t, sawBlueMPurchase)

	// Every ledger entry balances.
	var unbalanced int
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT count(*) FROM (
			SELECT le.id FROM ledger_entries le JOIN ledger_lines ll ON ll.ledger_entry_id = le.id
			WHERE le.workspace_id = $1 GROUP BY le.id HAVING SUM(ll.debit_minor) <> SUM(ll.credit_minor)
		) x`, ws).Scan(&unbalanced))
	require.Equal(t, 0, unbalanced)
}
