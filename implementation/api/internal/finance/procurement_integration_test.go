package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestPurchaseRequestLifecycleIsIdempotentTenantScopedAndNonPosting(t *testing.T) {
	pool := testPool(t)
	workspaceA, userA := createTestWorkspace(t, pool, "procurement-a")
	workspaceB, _ := createTestWorkspace(t, pool, "procurement-b")
	service := finance.NewService(pool)
	ctx := context.Background()

	supplier, err := service.CreateCounterparty(ctx, workspaceA, finance.CreateCounterpartyInput{Name: "Paper supplier", PartyType: "supplier"})
	require.NoError(t, err)
	product, err := service.CreateCatalogueItem(ctx, workspaceA, userA, finance.CreateCatalogueItemInput{
		Name: "A4 paper", Kind: "stock_tracked", SellingPrice: "2500.50", Currency: "NGN", IdempotencyKey: "procurement-product",
	})
	require.NoError(t, err)

	requestInput := finance.CreatePurchaseRequestInput{
		SupplierID: &supplier.ID,
		Reason:     "Restock the office before the workshop",
		Currency:   "NGN",
		Lines: []finance.PurchaseRequestLineInput{{
			ProductID:          &product.ID,
			Description:        "A4 paper",
			Quantity:           "2.5",
			UnitName:           "ream",
			EstimatedUnitPrice: "2500.50",
		}},
		IdempotencyKey: "purchase-request-a",
	}
	created, err := service.CreatePurchaseRequest(ctx, workspaceA, userA, requestInput)
	require.NoError(t, err)
	require.Equal(t, "draft", created.Status)
	require.Equal(t, int32(1), created.Version)
	require.Equal(t, "625125", created.EstimatedTotalMinor)
	require.Len(t, created.Lines, 1)
	require.Equal(t, "2.5000", created.Lines[0].Quantity)
	require.Equal(t, "625125", created.Lines[0].EstimatedLineTotalMinor)

	// Retrying the same request does not create another draft or another line.
	replayed, err := service.CreatePurchaseRequest(ctx, workspaceA, userA, requestInput)
	require.NoError(t, err)
	require.Equal(t, created.ID, replayed.ID)
	changed := requestInput
	changed.Reason = "Different request with a reused key"
	_, err = service.CreatePurchaseRequest(ctx, workspaceA, userA, changed)
	require.ErrorIs(t, err, finance.ErrDuplicateIdempotent)

	// A request and its approval are operational only: neither writes cash,
	// ledger nor any other financial record.
	var moneyRecords, ledgerEntries int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM money_transactions WHERE workspace_id = $1`, workspaceA).Scan(&moneyRecords))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM ledger_entries WHERE workspace_id = $1`, workspaceA).Scan(&ledgerEntries))
	require.Zero(t, moneyRecords)
	require.Zero(t, ledgerEntries)

	submitted, err := service.SubmitPurchaseRequest(ctx, workspaceA, userA, created.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: 1, IdempotencyKey: "purchase-request-submit"})
	require.NoError(t, err)
	require.Equal(t, "submitted", submitted.Status)
	require.Equal(t, int32(2), submitted.Version)
	submittedReplay, err := service.SubmitPurchaseRequest(ctx, workspaceA, userA, created.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: 1, IdempotencyKey: "purchase-request-submit"})
	require.NoError(t, err)
	require.Equal(t, submitted.Version, submittedReplay.Version)

	approved, err := service.ApprovePurchaseRequest(ctx, workspaceA, userA, created.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: 2, IdempotencyKey: "purchase-request-approve"})
	require.NoError(t, err)
	require.Equal(t, "approved", approved.Status)
	require.Equal(t, int32(3), approved.Version)

	listB, _, err := service.ListPurchaseRequests(ctx, workspaceB, finance.ListPurchaseRequestsFilter{Limit: 50})
	require.NoError(t, err)
	require.Empty(t, listB)
	_, err = service.SubmitPurchaseRequest(ctx, workspaceB, userA, created.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: 3, IdempotencyKey: "foreign-submit"})
	require.ErrorIs(t, err, finance.ErrNotFound)

	rejectedSource := requestInput
	rejectedSource.Priority = "high"
	rejectedSource.IdempotencyKey = "purchase-request-rejectable"
	rejected, err := service.CreatePurchaseRequest(ctx, workspaceA, userA, rejectedSource)
	require.NoError(t, err)
	require.Equal(t, "high", rejected.Priority)
	rejected, err = service.SubmitPurchaseRequest(ctx, workspaceA, userA, rejected.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: rejected.Version, IdempotencyKey: "purchase-request-rejectable-submit"})
	require.NoError(t, err)
	changes, err := service.RequestPurchaseRequestChanges(ctx, workspaceA, userA, rejected.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: rejected.Version, IdempotencyKey: "purchase-request-changes", Reason: "Attach the supplier quotation"})
	require.NoError(t, err)
	require.Equal(t, "changes_requested", changes.Status)
	require.Equal(t, "Attach the supplier quotation", *changes.LatestDecisionReason)
	require.Len(t, changes.Decisions, 2)
	require.Equal(t, "request_changes", changes.Decisions[1].Command)
	require.Equal(t, "Attach the supplier quotation", *changes.Decisions[1].Reason)

	rejected, err = service.SubmitPurchaseRequest(ctx, workspaceA, userA, rejected.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: changes.Version, IdempotencyKey: "purchase-request-resubmit"})
	require.NoError(t, err)
	rejected, err = service.RejectPurchaseRequest(ctx, workspaceA, userA, rejected.ID, finance.PurchaseRequestCommandInput{ExpectedVersion: rejected.Version, IdempotencyKey: "purchase-request-reject", Reason: "Not within the approved budget"})
	require.NoError(t, err)
	require.Equal(t, "rejected", rejected.Status)
	require.Len(t, rejected.Decisions, 4)
	require.Equal(t, "reject", rejected.Decisions[3].Command)
	require.Equal(t, "Not within the approved budget", *rejected.Decisions[3].Reason)
}
