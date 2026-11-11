package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestInventoryOpeningStockIsWeightedAverageAndIdempotent(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "inventory-opening")
	svc := finance.NewService(pool)
	ctx := context.Background()
	product, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{Name: "Rice", Kind: "stock_tracked", UnitName: "bag", SellingPrice: "5000", Currency: "NGN", IdempotencyKey: "inventory-product"})
	require.NoError(t, err)
	first, err := svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{ProductID: product.ID, Quantity: "10", UnitCost: "1000", Currency: "NGN", EffectiveOn: "2026-11-11", Reason: "Opening count", IdempotencyKey: "inventory-opening-one"})
	require.NoError(t, err)
	require.Equal(t, "10.0000", first.QuantityOnHand)
	require.Equal(t, "1000000", first.ValueOnHandMinor)
	replay, err := svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{ProductID: product.ID, Quantity: "10", UnitCost: "1000", Currency: "NGN", EffectiveOn: "2026-11-11", Reason: "Opening count", IdempotencyKey: "inventory-opening-one"})
	require.NoError(t, err)
	require.Equal(t, first.ID, replay.ID)
	balances, err := svc.ListInventoryBalances(ctx, ws)
	require.NoError(t, err)
	require.Len(t, balances, 1)
	var debit, credit int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT COALESCE(sum(debit_minor),0), COALESCE(sum(credit_minor),0) FROM ledger_lines ll JOIN ledger_entries le ON le.id=ll.ledger_entry_id WHERE le.workspace_id=$1 AND le.source_type='inventory_opening'`, ws).Scan(&debit, &credit))
	require.Equal(t, debit, credit)
}
