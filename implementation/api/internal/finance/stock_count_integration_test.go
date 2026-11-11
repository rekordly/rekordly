package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestStockCountAndAuditVariance(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "count-ws")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// 1. Create product and opening stock: 25 units @ 20.00 NGN = 50,000 minor
	prod, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name:           "Stainless Steel Tumbler",
		Kind:           "stock_tracked",
		UnitName:       "piece",
		SellingPrice:   "35.00",
		Currency:       "NGN",
		IdempotencyKey: "prod-tumb-1",
	})
	require.NoError(t, err)

	bal, err := svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{
		ProductID:      prod.ID,
		Quantity:       "25.0000",
		UnitCost:       "20.00",
		Currency:       "NGN",
		EffectiveOn:    "2026-11-01",
		Reason:         "Opening Stock",
		IdempotencyKey: "open-tumb-1",
	})
	require.NoError(t, err)

	// 2. Start Stock Count
	cnt, err := svc.StartStockCount(ctx, ws, user, finance.StartStockCountInput{
		LocationID:     bal.LocationID,
		Scope:          "full",
		Notes:          "Q4 Physical Stock Audit",
		IdempotencyKey: "cnt-tumb-1",
	})
	require.NoError(t, err)
	require.Equal(t, "in_progress", cnt.Status)
	require.Len(t, cnt.Lines, 1)
	require.Equal(t, "25.0000", cnt.Lines[0].ExpectedQuantity)

	// 3. Record physical count: physically found 23 units (variance = -2 units shrinkage)
	lineID := cnt.Lines[0].ID
	recCnt, err := svc.RecordStockCountLines(ctx, ws, user, cnt.ID, finance.RecordCountLinesInput{
		Lines: []finance.RecordCountLineInput{
			{
				LineID:          lineID,
				CountedQuantity: "23.0000",
			},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "-2.0000", recCnt.Lines[0].VarianceQuantity)

	// 4. Approve and post count
	approved, err := svc.ApproveAndPostStockCount(ctx, ws, user, cnt.ID, "2026-11-05")
	require.NoError(t, err)
	require.Equal(t, "completed", approved.Status)

	// 5. Verify inventory balance updated to 23 units
	balances, err := svc.ListInventoryBalances(ctx, ws)
	require.NoError(t, err)
	require.Equal(t, "23.0000", balances[0].QuantityOnHand)
	require.Equal(t, "46000", balances[0].ValueOnHandMinor) // 23 * 20.00 NGN = 46,000 minor
}
