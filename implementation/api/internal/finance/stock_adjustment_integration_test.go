package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestStockAdjustmentAndDamageWriteOff(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "adj-ws")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// 1. Create product & opening stock: 30 units @ 15.00 NGN = 45,000 minor
	prod, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name:           "Glass Jar",
		Kind:           "stock_tracked",
		UnitName:       "piece",
		SellingPrice:   "25.00",
		Currency:       "NGN",
		IdempotencyKey: "prod-jar-1",
	})
	require.NoError(t, err)

	bal, err := svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{
		ProductID:      prod.ID,
		Quantity:       "30.0000",
		UnitCost:       "15.00",
		Currency:       "NGN",
		EffectiveOn:    "2026-11-01",
		Reason:         "Opening Glass Stock",
		IdempotencyKey: "open-jar-1",
	})
	require.NoError(t, err)

	// 2. Damage write-off: 3 units broken in showroom
	adj, err := svc.CreateStockAdjustment(ctx, ws, user, finance.CreateStockAdjustmentInput{
		LocationID:     bal.LocationID,
		ReasonCode:     "damage",
		Notes:          "Cracked during display shelf setup",
		OccurredOn:     "2026-11-04",
		IdempotencyKey: "adj-jar-damage",
		Lines: []finance.CreateAdjustmentLineInput{
			{
				ProductID:     prod.ID,
				QuantityDelta: "-3.0000",
			},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "damage", adj.ReasonCode)
	require.Len(t, adj.Lines, 1)
	require.Equal(t, "-3.0000", adj.Lines[0].QuantityDelta)
	require.Equal(t, int64(4500), adj.Lines[0].TotalCostMinor) // 3 * 15.00 NGN = 4,500 minor

	// 3. Verify balance: 27 units on hand, 40,500 minor value
	balances, err := svc.ListInventoryBalances(ctx, ws)
	require.NoError(t, err)
	require.Equal(t, "27.0000", balances[0].QuantityOnHand)
	require.Equal(t, "40500", balances[0].ValueOnHandMinor)

	// 4. Positive adjustment: found 2 units during inventory reorganization
	adjGain, err := svc.CreateStockAdjustment(ctx, ws, user, finance.CreateStockAdjustmentInput{
		LocationID:     bal.LocationID,
		ReasonCode:     "correction",
		Notes:          "Unrecorded surplus found in backroom",
		OccurredOn:     "2026-11-04",
		IdempotencyKey: "adj-jar-found",
		Lines: []finance.CreateAdjustmentLineInput{
			{
				ProductID:     prod.ID,
				QuantityDelta: "2.0000",
			},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "2.0000", adjGain.Lines[0].QuantityDelta)

	// Balance should now be 29 units
	balances, err = svc.ListInventoryBalances(ctx, ws)
	require.NoError(t, err)
	require.Equal(t, "29.0000", balances[0].QuantityOnHand)
}
