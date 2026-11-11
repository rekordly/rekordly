package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestSalesStockIssueAndCOGSRecognition(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "issue-ws")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// 1. Create product and opening stock: 20 units @ 50.00 NGN = 1,000.00 NGN (100,000 minor)
	prod, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name:           "Leather Belt",
		Kind:           "stock_tracked",
		UnitName:       "piece",
		SellingPrice:   "90.00",
		Currency:       "NGN",
		IdempotencyKey: "prod-belt-1",
	})
	require.NoError(t, err)

	_, err = svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{
		ProductID:      prod.ID,
		Quantity:       "20.0000",
		UnitCost:       "50.00",
		Currency:       "NGN",
		EffectiveOn:    "2026-11-01",
		Reason:         "Opening Belt Stock",
		IdempotencyKey: "open-belt-1",
	})
	require.NoError(t, err)

	// 2. Reserve 5 units
	res, err := svc.ReserveStock(ctx, ws, user, finance.ReserveStockInput{
		ProductID:      prod.ID,
		Quantity:       "5.0000",
		IdempotencyKey: "res-belt-1",
	})
	require.NoError(t, err)

	// 3. Fulfill the reservation via sales stock issue (5 units)
	// COGS should be 5 * 50.00 NGN = 250.00 NGN = 25,000 minor
	issueRes, err := svc.IssueSaleStock(ctx, ws, user, finance.IssueSaleStockInput{
		ProductID:      prod.ID,
		Quantity:       "5.0000",
		ReservationID:  &res.ID,
		OccurredOn:     "2026-11-02",
		Reason:         "Order Fulfillment #101",
		IdempotencyKey: "issue-belt-1",
	})
	require.NoError(t, err)
	require.Equal(t, int64(25000), issueRes.COGSMinor)
	require.Equal(t, "15.0000", issueRes.Balance.QuantityOnHand)
	require.Equal(t, "0.0000", issueRes.Balance.ReservedQuantity)
	require.Equal(t, "15.0000", issueRes.Balance.AvailableQuantity)
	require.Equal(t, "75000", issueRes.Balance.ValueOnHandMinor) // 750.00 NGN remaining

	// 4. Verify balanced ledger entry
	var debitMinor, creditMinor int64
	err = pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(debit_minor), 0), COALESCE(SUM(credit_minor), 0)
		FROM ledger_lines
		WHERE ledger_entry_id = $1 AND workspace_id = $2
	`, issueRes.LedgerEntryID, ws).Scan(&debitMinor, &creditMinor)
	require.NoError(t, err)
	require.Equal(t, int64(25000), debitMinor)
	require.Equal(t, int64(25000), creditMinor)

	// 5. Direct issue without reservation (10 units)
	issue2, err := svc.IssueSaleStock(ctx, ws, user, finance.IssueSaleStockInput{
		ProductID:      prod.ID,
		Quantity:       "10.0000",
		OccurredOn:     "2026-11-03",
		Reason:         "Walk-in POS Sale",
		IdempotencyKey: "issue-belt-direct",
	})
	require.NoError(t, err)
	require.Equal(t, int64(50000), issue2.COGSMinor)
	require.Equal(t, "5.0000", issue2.Balance.QuantityOnHand)
	require.Equal(t, "5.0000", issue2.Balance.AvailableQuantity)

	// 6. Over-issuance should fail
	_, err = svc.IssueSaleStock(ctx, ws, user, finance.IssueSaleStockInput{
		ProductID:  prod.ID,
		Quantity:   "10.0000", // only 5 available
		OccurredOn: "2026-11-03",
	})
	require.ErrorIs(t, err, finance.ErrInsufficientStock)
}
