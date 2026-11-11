package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestStockReservationLifecycle(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "res-ws")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// 1. Create stock-tracked product
	prod, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name:           "Canvas Backpack",
		Kind:           "stock_tracked",
		UnitName:       "piece",
		SellingPrice:   "120.00",
		Currency:       "NGN",
		IdempotencyKey: "prod-res-1",
	})
	require.NoError(t, err)

	// 2. Put 10 units in opening stock
	bal, err := svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{
		ProductID:      prod.ID,
		Quantity:       "10.0000",
		UnitCost:       "60.00",
		Currency:       "NGN",
		EffectiveOn:    "2026-11-01",
		Reason:         "Initial Stock",
		IdempotencyKey: "open-res-1",
	})
	require.NoError(t, err)
	require.Equal(t, "10.0000", bal.QuantityOnHand)
	require.Equal(t, "10.0000", bal.AvailableQuantity)
	require.Equal(t, "0.0000", bal.ReservedQuantity)

	// 3. Reserve 4 units -> Available becomes 6
	res, err := svc.ReserveStock(ctx, ws, user, finance.ReserveStockInput{
		ProductID:      prod.ID,
		Quantity:       "4.0000",
		IdempotencyKey: "res-item-1",
	})
	require.NoError(t, err)
	require.Equal(t, "active", res.Status)
	require.Equal(t, "4.0000", res.Quantity)

	// Verify balance view
	balances, err := svc.ListInventoryBalances(ctx, ws)
	require.NoError(t, err)
	require.Len(t, balances, 1)
	require.Equal(t, "10.0000", balances[0].QuantityOnHand)
	require.Equal(t, "4.0000", balances[0].ReservedQuantity)
	require.Equal(t, "6.0000", balances[0].AvailableQuantity)

	// 4. Over-reservation should fail (requesting 7 when only 6 available)
	_, err = svc.ReserveStock(ctx, ws, user, finance.ReserveStockInput{
		ProductID:      prod.ID,
		Quantity:       "7.0000",
		IdempotencyKey: "res-item-over",
	})
	require.ErrorIs(t, err, finance.ErrInsufficientStock)

	// 5. Release reservation -> Reserved returns to 0, Available to 10
	rel, err := svc.ReleaseStockReservation(ctx, ws, user, res.ID)
	require.NoError(t, err)
	require.Equal(t, "released", rel.Status)

	balances, err = svc.ListInventoryBalances(ctx, ws)
	require.NoError(t, err)
	require.Equal(t, "0.0000", balances[0].ReservedQuantity)
	require.Equal(t, "10.0000", balances[0].AvailableQuantity)
}
