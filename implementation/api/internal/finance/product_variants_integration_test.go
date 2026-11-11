package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestProductVariantsAndOptionsMatrix(t *testing.T) {
	pool := testPool(t)
	wsA, userA := createTestWorkspace(t, pool, "variants-ws-a")
	wsB, _ := createTestWorkspace(t, pool, "variants-ws-b")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// 1. Create a product in Workspace A
	prod, err := svc.CreateCatalogueItem(ctx, wsA, userA, finance.CreateCatalogueItemInput{
		Name:           "Classic T-Shirt",
		Kind:           "stock_tracked",
		UnitName:       "piece",
		SellingPrice:   "50.00",
		Currency:       "NGN",
		SKU:            "TSHIRT-BASE",
		IdempotencyKey: "test-idem-prod-1",
	})
	require.NoError(t, err)
	require.Equal(t, "Classic T-Shirt", prod.Name)
	require.Equal(t, int64(5000), prod.SellingPriceMinor)

	// 2. Create Options: Size and Color
	sizeOpt, err := svc.CreateProductOption(ctx, wsA, prod.ID, finance.CreateProductOptionInput{
		Name:   "Size",
		Values: []string{"S", "M", "L", "XL"},
	})
	require.NoError(t, err)
	require.Equal(t, "Size", sizeOpt.Name)
	require.Equal(t, []string{"S", "M", "L", "XL"}, sizeOpt.Values)

	colorOpt, err := svc.CreateProductOption(ctx, wsA, prod.ID, finance.CreateProductOptionInput{
		Name:   "Color",
		Values: []string{"Red", "Blue", "Black"},
	})
	require.NoError(t, err)
	require.Equal(t, "Color", colorOpt.Name)
	require.Len(t, colorOpt.Values, 3)

	// Duplicate option name for same product should fail
	_, err = svc.CreateProductOption(ctx, wsA, prod.ID, finance.CreateProductOptionInput{
		Name:   "size",
		Values: []string{"XXL"},
	})
	require.Error(t, err)

	// 3. List options
	opts, err := svc.ListProductOptions(ctx, wsA, prod.ID)
	require.NoError(t, err)
	require.Len(t, opts, 2)

	// 4. Create variants with pricing & cost
	vRedM, err := svc.CreateProductVariant(ctx, wsA, prod.ID, finance.CreateVariantInput{
		Name:         "Red / M",
		SKU:          "TSHIRT-RED-M",
		Barcode:      "123456789012",
		SellingPrice: "55.00",
		CostPrice:    "30.00",
	})
	require.NoError(t, err)
	require.Equal(t, "Red / M", vRedM.Name)
	require.Equal(t, int64(5500), vRedM.SellingPriceMinor)
	require.Equal(t, int64(3000), vRedM.CostPriceMinor)
	require.False(t, vRedM.IsDefault)
	require.True(t, vRedM.IsActive)

	vBlueL, err := svc.CreateProductVariant(ctx, wsA, prod.ID, finance.CreateVariantInput{
		Name:         "Blue / L",
		SKU:          "TSHIRT-BLUE-L",
		SellingPrice: "58.00",
		CostPrice:    "32.00",
	})
	require.NoError(t, err)
	require.Equal(t, "Blue / L", vBlueL.Name)
	require.Equal(t, int64(5800), vBlueL.SellingPriceMinor)
	require.Equal(t, int64(3200), vBlueL.CostPriceMinor)

	// Duplicate SKU in same workspace should fail
	_, err = svc.CreateProductVariant(ctx, wsA, prod.ID, finance.CreateVariantInput{
		Name:         "Duplicate SKU Variant",
		SKU:          "TSHIRT-RED-M",
		SellingPrice: "50.00",
	})
	require.Error(t, err)

	// 5. List variants (includes default variant + 2 created variants = 3)
	variants, err := svc.ListProductVariants(ctx, wsA, prod.ID)
	require.NoError(t, err)
	require.Len(t, variants, 3)

	// 6. Update variant
	newPrice := "60.00"
	newName := "Red / M (Premium)"
	updatedV, err := svc.UpdateProductVariant(ctx, wsA, prod.ID, vRedM.ID, finance.UpdateVariantInput{
		Name:         &newName,
		SellingPrice: &newPrice,
	})
	require.NoError(t, err)
	require.Equal(t, "Red / M (Premium)", updatedV.Name)
	require.Equal(t, int64(6000), updatedV.SellingPriceMinor)

	// 7. Tenant isolation: Workspace B cannot view or update Workspace A's variants/options
	_, err = svc.ListProductOptions(ctx, wsB, prod.ID)
	require.ErrorIs(t, err, finance.ErrNotFound)

	_, err = svc.ListProductVariants(ctx, wsB, prod.ID)
	require.ErrorIs(t, err, finance.ErrNotFound)

	_, err = svc.UpdateProductVariant(ctx, wsB, prod.ID, vRedM.ID, finance.UpdateVariantInput{
		SellingPrice: &newPrice,
	})
	require.ErrorIs(t, err, finance.ErrNotFound)
}
