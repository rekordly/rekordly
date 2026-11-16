package finance_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestProductsC4C5B3B4B5Integration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := finance.NewService(pool)

	suffix := time.Now().UnixNano() % 1000000000
	wsA, userA := createTestWorkspace(t, pool, fmt.Sprintf("prod-c45-a-%d", suffix))
	wsB, _ := createTestWorkspace(t, pool, fmt.Sprintf("prod-c45-b-%d", suffix))

	// Create two outlets in wsA
	outletA1Res, err := svc.CreateOutlet(ctx, wsA, userA, finance.CreateOutletInput{
		Name: fmt.Sprintf("Main Outlet %d", suffix),
		Code: fmt.Sprintf("O1-%d", suffix%10000),
	})
	require.NoError(t, err)
	outletA1 := outletA1Res.ID

	// Create second outlet in wsA
	outletA2Res, err := svc.CreateOutlet(ctx, wsA, userA, finance.CreateOutletInput{
		Name: fmt.Sprintf("Outlet 2 %d", suffix),
		Code: fmt.Sprintf("O2-%d", suffix%10000),
	})
	require.NoError(t, err)
	outletA2 := outletA2Res.ID

	// C5: CreateProductV2 with options and variant opening stock in 1 transaction
	prodRes, err := svc.CreateProductV2(ctx, wsA, userA, finance.SaveProductInput{
		Name:            "Atomic Widget",
		Kind:            "stock_tracked",
		Status:          "active",
		UnitName:        "unit",
		SellingPrice:    "5000",
		CostPrice:       "3000",
		Currency:        "NGN",
		IdempotencyKey:  fmt.Sprintf("atomic-p-%d", suffix),
		OpeningStock:    "10",
		OpeningUnitCost: "3000",
		OpeningOutletID: outletA1,
		Options: []finance.SaveOptionInput{
			{
				Name: "Color",
				Values: []finance.SaveOptionValueInput{
					{Value: "Red"},
					{Value: "Blue"},
				},
			},
		},
		Variants: []finance.SaveOptionVariantInput{
			{
				OptionValues:    []string{"Red"},
				SellingPrice:    "5200",
				CostPrice:       "3100",
				IsActive:        true,
				OpeningStock:    "20",
				OpeningUnitCost: "3100",
				OutletID:        outletA1,
			},
			{
				OptionValues:    []string{"Blue"},
				SellingPrice:    "5400",
				CostPrice:       "3200",
				IsActive:        true,
				OpeningStock:    "15",
				OpeningUnitCost: "3200",
				OutletID:        outletA1,
			},
		},
	})
	require.NoError(t, err)
	require.NotEmpty(t, prodRes.Product.ID)
	require.Len(t, prodRes.Variants, 3) // 1 default + 2 options

	// Check stock balance of first option variant at outletA1
	var redVariantID int64
	for _, v := range prodRes.Variants {
		if !v.IsDefault && v.OptionValues["Color"] == "Red" {
			redVariantID = v.ID
		}
	}
	require.NotZero(t, redVariantID)
	var balRed string
	require.NoError(t, pool.QueryRow(ctx, `SELECT coalesce(sum(quantity_on_hand),0)::numeric(18,0)::text FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND variant_id=$3`, wsA, outletA1, redVariantID).Scan(&balRed))
	require.Equal(t, "20", balRed)

	// C4: MoveProductStock between outletA1 and outletA2 in 1 transaction
	moveRes, err := svc.MoveProductStock(ctx, wsA, userA, prodRes.Product.ID, finance.MoveProductStockInput{
		VariantID:      &redVariantID,
		FromOutletID:   outletA1,
		ToOutletID:     outletA2,
		Quantity:       "5",
		Note:           "Restocking Outlet 2",
		IdempotencyKey: fmt.Sprintf("move-%d", suffix),
	})
	require.NoError(t, err)
	require.NotZero(t, moveRes.ID)
	require.Equal(t, "received", moveRes.Status)

	// Check balances after move
	var balRed1After, balRed2After string
	require.NoError(t, pool.QueryRow(ctx, `SELECT coalesce(sum(quantity_on_hand),0)::numeric(18,0)::text FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND variant_id=$3`, wsA, outletA1, redVariantID).Scan(&balRed1After))
	require.Equal(t, "15", balRed1After)

	require.NoError(t, pool.QueryRow(ctx, `SELECT coalesce(sum(quantity_on_hand),0)::numeric(18,0)::text FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND variant_id=$3`, wsA, outletA2, redVariantID).Scan(&balRed2After))
	require.Equal(t, "5", balRed2After)

	// Workspace B cannot move stock for Workspace A product
	_, err = svc.MoveProductStock(ctx, wsB, userA, prodRes.Product.ID, finance.MoveProductStockInput{
		VariantID:      &redVariantID,
		FromOutletID:   outletA1,
		ToOutletID:     outletA2,
		Quantity:       "2",
		IdempotencyKey: fmt.Sprintf("move-fail-%d", suffix),
	})
	require.Error(t, err)

	// B3: Combined history
	history, err := svc.GetProductCombinedHistory(ctx, wsA, prodRes.Product.ID)
	require.NoError(t, err)
	require.NotEmpty(t, history)

	// Workspace B cannot access history for Workspace A
	_, err = svc.GetProductCombinedHistory(ctx, wsB, prodRes.Product.ID)
	require.Error(t, err)

	// B3: Embedded collections and outlets on detail
	detail, err := svc.GetProduct(ctx, wsA, prodRes.Product.ID)
	require.NoError(t, err)
	require.NotNil(t, detail.Collections)
	require.NotNil(t, detail.Outlets)

	// B4: ListProducts returns CollectionIDs
	listRes, err := svc.ListProducts(ctx, wsA, finance.ListProductsFilter{})
	require.NoError(t, err)
	require.NotEmpty(t, listRes)
	found := false
	for _, p := range listRes {
		if p.ID == prodRes.Product.ID {
			found = true
			require.NotNil(t, p.CollectionIDs)
		}
	}
	require.True(t, found)

	// B5: Inventory overview
	overview, err := svc.GetInventoryOverview(ctx, wsA)
	require.NoError(t, err)
	require.NotEmpty(t, overview.Products)
	require.NotEmpty(t, overview.Outlets)

	// C5: UpdateProductV2 with options: [] removes variants
	updated, err := svc.UpdateProductV2(ctx, wsA, userA, prodRes.Product.ID, finance.SaveProductInput{
		Name:         "Atomic Widget Renamed",
		Kind:         "stock_tracked",
		Status:       "active",
		UnitName:     "unit",
		SellingPrice: "5000",
		Options:      []finance.SaveOptionInput{},
	})
	require.NoError(t, err)
	require.Equal(t, "Atomic Widget Renamed", updated.Product.Name)
	activeCount := 0
	for _, v := range updated.Variants {
		if v.IsActive {
			activeCount++
			require.True(t, v.IsDefault)
		}
	}
	require.Equal(t, 1, activeCount)
	require.Empty(t, updated.Options)
}
