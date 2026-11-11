package finance_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestPurchaseOrderLifecycleIsReplaySafeTenantScopedAndNonPosting(t *testing.T) {
	pool := testPool(t)
	workspaceA, userA := createTestWorkspace(t, pool, "purchase-order-a")
	workspaceB, userB := createTestWorkspace(t, pool, "purchase-order-b")
	service := finance.NewService(pool)
	ctx := context.Background()

	request := approvedPurchaseRequestForOrder(t, service, ctx, workspaceA, userA)
	order, err := service.CreatePurchaseOrderFromRequest(ctx, workspaceA, userA, request.ID, "po-create-a")
	require.NoError(t, err)
	require.Equal(t, "draft", order.Status)
	require.Equal(t, int32(1), order.Version)
	require.Nil(t, order.OrderNumber)

	// Creating or issuing a PO is an operational commitment. It must never
	// manufacture stock, a payable, a cash movement or a ledger posting.
	assertPurchaseOrderIsNonPosting(t, pool, workspaceA)

	createReplay, err := service.CreatePurchaseOrderFromRequest(ctx, workspaceA, userA, request.ID, "po-create-a")
	require.NoError(t, err)
	require.Equal(t, order.ID, createReplay.ID)
	_, err = service.CreatePurchaseOrderFromRequest(ctx, workspaceA, userA, request.ID, "different-create-key")
	require.Error(t, err)

	submitted, err := service.AdvancePurchaseOrder(ctx, workspaceA, userA, order.ID, order.Version, "submitted", "po-submit-a")
	require.NoError(t, err)
	require.Equal(t, "submitted", submitted.Status)
	require.Equal(t, int32(2), submitted.Version)
	submittedReplay, err := service.AdvancePurchaseOrder(ctx, workspaceA, userA, order.ID, 1, "submitted", "po-submit-a")
	require.NoError(t, err)
	require.Equal(t, submitted.Version, submittedReplay.Version)

	approved, err := service.AdvancePurchaseOrder(ctx, workspaceA, userA, order.ID, submitted.Version, "approved", "po-approve-a")
	require.NoError(t, err)
	require.Equal(t, "approved", approved.Status)
	issued, err := service.AdvancePurchaseOrder(ctx, workspaceA, userA, order.ID, approved.Version, "issued", "po-issue-a")
	require.NoError(t, err)
	require.Equal(t, "issued", issued.Status)
	require.Equal(t, int32(4), issued.Version)
	require.NotNil(t, issued.OrderNumber)
	require.Equal(t, "PO-000001", *issued.OrderNumber)

	// An issued PO can only resolve its unreceived commitment. Cancelling it
	// remains a non-posting event and preserves the immutable command timeline.
	cancelled, err := service.ResolvePurchaseOrder(ctx, workspaceA, userA, issued.ID, int64(issued.Version), "cancel_remainder", "Supplier cannot deliver before the event", "po-cancel-a")
	require.NoError(t, err)
	require.Equal(t, "cancelled", cancelled.Status)
	require.Equal(t, "Supplier cannot deliver before the event", *cancelled.CancellationReason)
	require.Equal(t, int32(5), cancelled.Version)

	// A key is bound to one document, command and source version; reusing it
	// with a different intent is rejected instead of causing a hidden replay.
	_, err = service.AdvancePurchaseOrder(ctx, workspaceA, userA, order.ID, approved.Version, "issued", "po-approve-a")
	require.ErrorIs(t, err, finance.ErrDuplicateIdempotent)
	_, err = service.AdvancePurchaseOrder(ctx, workspaceB, userB, order.ID, issued.Version, "issued", "foreign-order")
	require.ErrorIs(t, err, finance.ErrNotFound)

	assertPurchaseOrderIsNonPosting(t, pool, workspaceA)
}

func approvedPurchaseRequestForOrder(t *testing.T, service *finance.Service, ctx context.Context, workspaceID, userID int64) finance.PurchaseRequestView {
	t.Helper()
	request, err := service.CreatePurchaseRequest(ctx, workspaceID, userID, finance.CreatePurchaseRequestInput{
		Reason:   "Buy workshop materials",
		Currency: "NGN",
		Lines: []finance.PurchaseRequestLineInput{{
			Description: "Printer paper", Quantity: "2", UnitName: "ream", EstimatedUnitPrice: "2500.50",
		}},
		IdempotencyKey: "po-source-request",
	})
	require.NoError(t, err)
	submitted, err := service.SubmitPurchaseRequest(ctx, workspaceID, userID, request.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: request.Version, IdempotencyKey: "po-source-submit"})
	require.NoError(t, err)
	approved, err := service.ApprovePurchaseRequest(ctx, workspaceID, userID, request.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: submitted.Version, IdempotencyKey: "po-source-approve"})
	require.NoError(t, err)
	return approved
}

func assertPurchaseOrderIsNonPosting(t *testing.T, pool *pgxpool.Pool, workspaceID int64) {
	t.Helper()
	ctx := context.Background()
	for _, table := range []string{"money_transactions", "ledger_entries"} {
		var count int
		err := pool.QueryRow(ctx, "SELECT count(*) FROM "+table+" WHERE workspace_id=$1", workspaceID).Scan(&count)
		require.NoError(t, err)
		require.Zero(t, count, table)
	}
}
