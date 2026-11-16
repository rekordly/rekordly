package finance_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestProductPriceChangesIntegration(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := finance.NewService(pool)

	suffix := time.Now().UnixNano() % 1000000000
	wsA, userA := createTestWorkspace(t, pool, fmt.Sprintf("price-change-a-%d", suffix))
	wsB, userB := createTestWorkspace(t, pool, fmt.Sprintf("price-change-b-%d", suffix))

	// Create a product in wsA
	p1, err := svc.CreateProductV2(ctx, wsA, userA, finance.SaveProductInput{
		Name:           "Widget A",
		Kind:           "stock_tracked",
		Status:         "active",
		UnitName:       "pc",
		SellingPrice:   "1000",
		CostPrice:      "800",
		CompareAtPrice: "1200",
		Currency:       "NGN",
		IdempotencyKey: fmt.Sprintf("p1-create-%d", suffix),
	})
	require.NoError(t, err)

	// Save options on p1
	optDetail, err := svc.SaveProductOptions(ctx, wsA, userA, p1.Product.ID, finance.SaveProductOptionsInput{
		IdempotencyKey: fmt.Sprintf("p1-opts-%d", suffix),
		Options: []finance.SaveOptionInput{
			{
				Name: "Size",
				Values: []finance.SaveOptionValueInput{
					{Value: "Small"},
					{Value: "Large"},
				},
			},
		},
		Variants: []finance.SaveOptionVariantInput{
			{
				OptionValues:   []string{"Small"},
				SellingPrice:   "1000",
				CostPrice:      "800",
				CompareAtPrice: "1200",
				IsActive:       true,
			},
			{
				OptionValues:   []string{"Large"},
				SellingPrice:   "1500",
				CostPrice:      "1000",
				CompareAtPrice: "1800",
				IsActive:       true,
			},
		},
	})
	require.NoError(t, err)
	require.Len(t, optDetail.Variants, 3) // 1 default + 2 options

	var smallVar, largeVar finance.VariantView
	for _, v := range optDetail.Variants {
		if !v.IsDefault {
			if v.Name == "Small" {
				smallVar = v
			} else if v.Name == "Large" {
				largeVar = v
			}
		}
	}
	require.NotZero(t, smallVar.ID)
	require.NotZero(t, largeVar.ID)

	t.Run("Single price change validates compare-at", func(t *testing.T) {
		_, err := svc.ChangeProductPrices(ctx, wsA, userA, p1.Product.ID, finance.ChangeProductPricesInput{
			IdempotencyKey: fmt.Sprintf("bad-comp-%d", suffix),
			Product: &finance.ProductPriceChangeInput{
				SellingPrice:   "2000",
				CompareAtPrice: "1500", // compare-at <= selling!
			},
		})
		require.Error(t, err)
		require.Contains(t, err.Error(), "must be higher than selling price")
	})

	t.Run("Single price change updates product and variants atomically with idempotency", func(t *testing.T) {
		idempKey := fmt.Sprintf("single-change-%d", suffix)
		detail, err := svc.ChangeProductPrices(ctx, wsA, userA, p1.Product.ID, finance.ChangeProductPricesInput{
			IdempotencyKey: idempKey,
			Product: &finance.ProductPriceChangeInput{
				SellingPrice:   "1200",
				CompareAtPrice: "1500",
			},
			Variants: []finance.VariantPriceChangeInput{
				{
					ID:             smallVar.ID,
					SellingPrice:   "1100",
					CompareAtPrice: "1300",
				},
			},
		})
		require.NoError(t, err)
		require.Equal(t, int64(120000), detail.Product.SellingPriceMinor)
		require.NotNil(t, detail.Product.CompareAtPriceMinor)
		require.Equal(t, int64(150000), *detail.Product.CompareAtPriceMinor)

		// Replay returns identical result
		replay, err := svc.ChangeProductPrices(ctx, wsA, userA, p1.Product.ID, finance.ChangeProductPricesInput{
			IdempotencyKey: idempKey,
			Product: &finance.ProductPriceChangeInput{
				SellingPrice: "9999",
			},
		})
		require.NoError(t, err)
		require.Equal(t, int64(120000), replay.Product.SellingPriceMinor)

		// Verify price history source
		hist, err := svc.ListProductPriceHistory(ctx, wsA, p1.Product.ID)
		require.NoError(t, err)
		require.NotEmpty(t, hist)
		require.Equal(t, "quick_change", hist[0].Source)
	})

	t.Run("Single price change workspace isolation", func(t *testing.T) {
		_, err := svc.ChangeProductPrices(ctx, wsB, userB, p1.Product.ID, finance.ChangeProductPricesInput{
			IdempotencyKey: fmt.Sprintf("cross-ws-%d", suffix),
			Product: &finance.ProductPriceChangeInput{
				SellingPrice: "3000",
			},
		})
		require.Error(t, err)
	})

	t.Run("Bulk price change updates multiple products and variants atomically", func(t *testing.T) {
		// Create a second product
		p2, err := svc.CreateProductV2(ctx, wsA, userA, finance.SaveProductInput{
			Name:           "Widget B",
			Kind:           "non_stock",
			SellingPrice:   "500",
			CostPrice:      "300",
			Currency:       "NGN",
			IdempotencyKey: fmt.Sprintf("p2-create-%d", suffix),
		})
		require.NoError(t, err)

		idempKey := fmt.Sprintf("bulk-change-%d", suffix)
		res, failed, err := svc.BulkChangeProductPrices(ctx, wsA, userA, finance.BulkChangeProductPricesInput{
			IdempotencyKey: idempKey,
			ProductIDs:     []int64{p1.Product.ID, p2.Product.ID},
			Rule: finance.BulkPriceRuleInput{
				Direction: "increase",
				By:        "percent",
				Value:     "10",
			},
			IncludeVariants: true,
		})
		require.NoError(t, err)
		require.Empty(t, failed)
		require.Equal(t, 2, res.UpdatedProducts)
		require.Equal(t, 2, res.UpdatedVariants)

		// P2 was 500.00 (50000 minor) + 10% = 550.00 (55000 minor)
		p2Updated, err := svc.GetProduct(ctx, wsA, p2.Product.ID)
		require.NoError(t, err)
		require.Equal(t, int64(55000), p2Updated.Product.SellingPriceMinor)

		// Replay returns identical result
		replay, replayFailed, err := svc.BulkChangeProductPrices(ctx, wsA, userA, finance.BulkChangeProductPricesInput{
			IdempotencyKey: idempKey,
			ProductIDs:     []int64{p1.Product.ID, p2.Product.ID},
			Rule: finance.BulkPriceRuleInput{
				Direction: "decrease",
				By:        "percent",
				Value:     "50",
			},
			IncludeVariants: true,
		})
		require.NoError(t, err)
		require.Empty(t, replayFailed)
		require.Equal(t, 2, replay.UpdatedProducts)
	})

	t.Run("Bulk price change cross-workspace rollback", func(t *testing.T) {
		// Attempting to bulk change including p1 from wsA while calling with wsB fails completely
		_, failed, err := svc.BulkChangeProductPrices(ctx, wsB, userB, finance.BulkChangeProductPricesInput{
			IdempotencyKey: fmt.Sprintf("bulk-cross-%d", suffix),
			ProductIDs:     []int64{p1.Product.ID},
			Rule: finance.BulkPriceRuleInput{
				Direction: "increase",
				By:        "amount",
				Value:     "100",
			},
		})
		require.Error(t, err)
		require.NotEmpty(t, failed)
	})
}
