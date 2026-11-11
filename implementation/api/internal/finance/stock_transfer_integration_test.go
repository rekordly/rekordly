package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestStockTransferLifecycleAndVariance(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "transfer-ws")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// 1. Create two outlets: Central Warehouse & Victoria Island Outlet
	wh, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
		Name:         "Central Warehouse",
		LocationType: "warehouse",
		Code:         "WH-MAIN",
	})
	require.NoError(t, err)

	outlet, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
		Name:         "VI Outlet",
		LocationType: "outlet",
		Code:         "VI-01",
	})
	require.NoError(t, err)

	// 2. Create product & opening stock in Warehouse: 50 units @ 40.00 NGN = 200,000 minor
	prod, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name:           "Ceramic Mug",
		Kind:           "stock_tracked",
		UnitName:       "piece",
		SellingPrice:   "75.00",
		Currency:       "NGN",
		IdempotencyKey: "prod-mug-1",
	})
	require.NoError(t, err)

	_, err = svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{
		ProductID:      prod.ID,
		LocationID:     wh.ID,
		Quantity:       "50.0000",
		UnitCost:       "40.00",
		Currency:       "NGN",
		EffectiveOn:    "2026-11-01",
		Reason:         "Warehouse Opening",
		IdempotencyKey: "open-mug-wh",
	})
	require.NoError(t, err)

	// 3. Create Transfer Draft from Warehouse to VI Outlet (request 20 units)
	trf, err := svc.CreateStockTransfer(ctx, ws, user, finance.CreateTransferInput{
		SourceLocationID:      wh.ID,
		DestinationLocationID: outlet.ID,
		Notes:                 "Stock replenishment for VI store",
		IdempotencyKey:        "trf-mug-1",
		Lines: []finance.CreateTransferLineInput{
			{
				ProductID:         prod.ID,
				QuantityRequested: "20.0000",
			},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "draft", trf.Status)
	require.Len(t, trf.Lines, 1)

	// 4. Dispatch Transfer (20 units)
	dispatched, err := svc.DispatchStockTransfer(ctx, ws, user, trf.ID, "2026-11-02")
	require.NoError(t, err)
	require.Equal(t, "dispatched", dispatched.Status)

	// Verify WH has 30 on hand, 0 in transit. VI Outlet has 0 on hand, 20 in transit
	whBal, err := svc.ListInventoryBalances(ctx, ws)
	require.NoError(t, err)

	var whFound, viFound bool
	for _, b := range whBal {
		if b.LocationID == wh.ID && b.ProductID == prod.ID {
			whFound = true
			require.Equal(t, "30.0000", b.QuantityOnHand)
			require.Equal(t, "0.0000", b.InTransitQuantity)
		}
		if b.LocationID == outlet.ID && b.ProductID == prod.ID {
			viFound = true
			require.Equal(t, "0.0000", b.QuantityOnHand)
			require.Equal(t, "20.0000", b.InTransitQuantity)
		}
	}
	require.True(t, whFound)
	require.True(t, viFound)

	// 5. Receive Transfer with variance: 18 received (2 damaged/lost in transit)
	lineID := dispatched.Lines[0].ID
	received, err := svc.ReceiveStockTransfer(ctx, ws, user, trf.ID, finance.ReceiveTransferInput{
		OccurredOn: "2026-11-03",
		Lines: []finance.ReceiveTransferLineInput{
			{
				LineID:           lineID,
				QuantityReceived: "18.0000",
			},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "received", received.Status)

	// Verify VI Outlet has 18 on hand, 0 in transit
	balances, err := svc.ListInventoryBalances(ctx, ws)
	require.NoError(t, err)
	for _, b := range balances {
		if b.LocationID == outlet.ID && b.ProductID == prod.ID {
			require.Equal(t, "18.0000", b.QuantityOnHand)
			require.Equal(t, "0.0000", b.InTransitQuantity)
			require.Equal(t, "72000", b.ValueOnHandMinor) // 18 * 40.00 NGN = 72,000 minor
		}
	}
}
