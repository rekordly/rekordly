package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestOutletLifecycleAndTenantIsolation(t *testing.T) {
	pool := testPool(t)
	wsA, userA := createTestWorkspace(t, pool, "outlet-ws-a")
	wsB, userB := createTestWorkspace(t, pool, "outlet-ws-b")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// 1. Create first outlet in Workspace A -> should automatically become default
	out1, err := svc.CreateOutlet(ctx, wsA, userA, finance.CreateOutletInput{
		Name:         "Main Storefront",
		LocationType: "outlet",
		Code:         "MAIN",
		Address:      "123 Commercial Ave, Lagos",
		Phone:        "+2348011112222",
	})
	require.NoError(t, err)
	require.Equal(t, "Main Storefront", out1.Name)
	require.True(t, out1.IsDefault)
	require.True(t, out1.IsActive)
	require.Equal(t, "MAIN", *out1.Code)

	// 2. Create second outlet (Warehouse) in Workspace A -> not default by default
	out2, err := svc.CreateOutlet(ctx, wsA, userA, finance.CreateOutletInput{
		Name:         "Central Warehouse",
		LocationType: "warehouse",
		Code:         "WH-01",
		Address:      "Plot 4 Industrial Estate, Ikeja",
	})
	require.NoError(t, err)
	require.Equal(t, "Central Warehouse", out2.Name)
	require.False(t, out2.IsDefault)

	// 3. Enforce code uniqueness per workspace
	_, err = svc.CreateOutlet(ctx, wsA, userA, finance.CreateOutletInput{
		Name: "Duplicate Code Outlet",
		Code: "main", // case-insensitive check
	})
	require.ErrorIs(t, err, finance.ErrOutletCodeConflict)

	// Workspace B CAN use the same code (tenant isolation)
	outB, err := svc.CreateOutlet(ctx, wsB, userB, finance.CreateOutletInput{
		Name: "Workspace B Main",
		Code: "MAIN",
	})
	require.NoError(t, err)
	require.Equal(t, wsB, outB.WorkspaceID)

	// 4. List outlets in Workspace A -> returns 2 outlets
	listA, err := svc.ListOutlets(ctx, wsA, false)
	require.NoError(t, err)
	require.Len(t, listA, 2)
	require.True(t, listA[0].IsDefault) // default outlet first

	// 5. Update outlet: switch default to Central Warehouse
	isDef := true
	updated, err := svc.UpdateOutlet(ctx, wsA, out2.ID, finance.UpdateOutletInput{
		IsDefault: &isDef,
	})
	require.NoError(t, err)
	require.True(t, updated.IsDefault)

	// Verify old default was cleared atomically
	oldDef, err := svc.GetOutlet(ctx, wsA, out1.ID)
	require.NoError(t, err)
	require.False(t, oldDef.IsDefault)

	// 6. Cannot deactivate the default outlet
	isAct := false
	_, err = svc.UpdateOutlet(ctx, wsA, out2.ID, finance.UpdateOutletInput{
		IsActive: &isAct,
	})
	require.ErrorIs(t, err, finance.ErrCannotDeactivateDefaultLocation)

	// 7. Tenant isolation: Workspace A cannot access Workspace B's outlet
	_, err = svc.GetOutlet(ctx, wsA, outB.ID)
	require.ErrorIs(t, err, finance.ErrNotFound)
}
