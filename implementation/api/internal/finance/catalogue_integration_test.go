package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestCatalogue_CreateListIdempotencyAndTenantIsolation(t *testing.T) {
	pool := testPool(t)
	workspaceA, userA := createTestWorkspace(t, pool, "catalogue-a")
	workspaceB, userB := createTestWorkspace(t, pool, "catalogue-b")
	service := finance.NewService(pool)
	ctx := context.Background()

	created, err := service.CreateCatalogueItem(ctx, workspaceA, userA, finance.CreateCatalogueItemInput{
		Name: "Website audit", Kind: "service", UnitName: "session", SellingPrice: "2500.50", Currency: "NGN", IdempotencyKey: "catalogue-create-a",
	})
	require.NoError(t, err)
	require.Equal(t, int64(250050), created.SellingPriceMinor)
	require.Equal(t, "service", created.Kind)
	require.Equal(t, "session", created.UnitName)

	// Retrying a completed write returns the same resource, never a second item.
	retry, err := service.CreateCatalogueItem(ctx, workspaceA, userA, finance.CreateCatalogueItemInput{
		Name: "Website audit", Kind: "service", UnitName: "session", SellingPrice: "2500.50", Currency: "NGN", IdempotencyKey: "catalogue-create-a",
	})
	require.NoError(t, err)
	require.Equal(t, created.ID, retry.ID)

	_, err = service.CreateCatalogueItem(ctx, workspaceB, userB, finance.CreateCatalogueItemInput{
		Name: "Other workspace item", Kind: "stock_tracked", SellingPrice: "10", Currency: "NGN", IdempotencyKey: "catalogue-create-b",
	})
	require.NoError(t, err)

	itemsA, err := service.ListCatalogueItems(ctx, workspaceA, finance.ListCatalogueItemsFilter{Limit: 50})
	require.NoError(t, err)
	require.Len(t, itemsA, 1)
	require.Equal(t, created.ID, itemsA[0].ID)
	require.Equal(t, "NGN", itemsA[0].Currency)

	itemsB, err := service.ListCatalogueItems(ctx, workspaceB, finance.ListCatalogueItemsFilter{Limit: 50})
	require.NoError(t, err)
	require.Len(t, itemsB, 1)
	require.NotEqual(t, created.ID, itemsB[0].ID)
}

func TestCatalogue_RejectsInvalidCurrencyAndPrice(t *testing.T) {
	pool := testPool(t)
	workspaceID, userID := createTestWorkspace(t, pool, "catalogue-validation")
	service := finance.NewService(pool)

	_, err := service.CreateCatalogueItem(context.Background(), workspaceID, userID, finance.CreateCatalogueItemInput{
		Name: "Bad price", Kind: "service", SellingPrice: "12.345", Currency: "NGN", IdempotencyKey: "bad-price",
	})
	require.Error(t, err)

	_, err = service.CreateCatalogueItem(context.Background(), workspaceID, userID, finance.CreateCatalogueItemInput{
		Name: "Bad currency", Kind: "service", SellingPrice: "12", Currency: "NG", IdempotencyKey: "bad-currency",
	})
	require.ErrorIs(t, err, finance.ErrInvalidCurrency)
}
