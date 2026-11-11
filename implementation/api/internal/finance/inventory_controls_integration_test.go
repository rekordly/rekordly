package finance_test

import (
	"context"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestInventoryAdjustmentAndTransferAreAtomicAndIdempotent(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "inventory-controls")
	ctx := context.Background()
	svc := finance.NewService(pool)
	product, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{Name: "Rice", Kind: "stock_tracked", UnitName: "bag", SellingPrice: "100", Currency: "NGN", IdempotencyKey: "inventory-controls-product"})
	require.NoError(t, err)
	opening, err := svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{ProductID: product.ID, Quantity: "10", UnitCost: "100", Currency: "NGN", EffectiveOn: "2026-11-11", Reason: "Initial count", IdempotencyKey: "inventory-controls-opening"})
	require.NoError(t, err)
	adjustment, err := svc.CreateInventoryAdjustment(ctx, ws, user, finance.CreateInventoryAdjustmentInput{LocationID: opening.LocationID, ReasonCode: "damage", EffectiveOn: "2026-11-11", Lines: []finance.InventoryAdjustmentLineInput{{ProductID: product.ID, QuantityDelta: "-2", UnitCost: "100"}}, IdempotencyKey: "inventory-controls-adjustment"})
	require.NoError(t, err)
	require.Equal(t, "20000", adjustment.TotalMinor)
	replay, err := svc.CreateInventoryAdjustment(ctx, ws, user, finance.CreateInventoryAdjustmentInput{LocationID: opening.LocationID, ReasonCode: "damage", EffectiveOn: "2026-11-11", Lines: []finance.InventoryAdjustmentLineInput{{ProductID: product.ID, QuantityDelta: "-2", UnitCost: "100"}}, IdempotencyKey: "inventory-controls-adjustment"})
	require.NoError(t, err)
	require.Equal(t, adjustment.ID, replay.ID)
	var destination int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO inventory_locations(workspace_id,name) VALUES($1,'Back room') RETURNING id`, ws).Scan(&destination))
	transfer, err := svc.CreateInventoryTransfer(ctx, ws, user, finance.CreateInventoryTransferInput{SourceLocationID: opening.LocationID, DestinationLocationID: destination, EffectiveOn: "2026-11-11", Lines: []finance.InventoryTransferLineInput{{ProductID: product.ID, Quantity: "3"}}, IdempotencyKey: "inventory-controls-transfer"})
	require.NoError(t, err)
	require.Equal(t, "received", transfer.Status)
	var source, dest string
	require.NoError(t, pool.QueryRow(ctx, `SELECT quantity_on_hand::text FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3`, ws, opening.LocationID, product.ID).Scan(&source))
	require.NoError(t, pool.QueryRow(ctx, `SELECT quantity_on_hand::text FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3`, ws, destination, product.ID).Scan(&dest))
	require.Equal(t, "5.0000", source)
	require.Equal(t, "3.0000", dest)
}
