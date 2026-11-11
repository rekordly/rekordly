package finance_test

import (
	"context"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestEstimateLifecycle_CreateStatusAndConvertToInvoice(t *testing.T) {
	pool := testPool(t)
	wsID, userID := createTestWorkspace(t, pool, "est-test")
	svc := finance.NewService(pool)
	ctx := context.Background()

	cust, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:      "Prospective Client Ltd",
		PartyType: "customer",
	})
	require.NoError(t, err)

	// 1. Create Draft Estimate
	estDetail, err := svc.CreateEstimate(ctx, wsID, userID, finance.CreateEstimateInput{
		CustomerID: cust.ID,
		IssueDate:  "2026-11-10",
		ExpiryDate: "2026-11-24",
		Currency:   "NGN",
		Status:     "draft",
		Items: []finance.EstimateItemInput{
			{Description: "Enterprise Cloud Setup", Quantity: "2", UnitPriceMinor: 5000000}, // 2 * ₦50,000.00 = ₦100,000.00
			{Description: "Security Audit", Quantity: "1", UnitPriceMinor: 2500000},          // 1 * ₦25,000.00 = ₦25,000.00
		},
		TaxAmountMinor: 937500, // ₦9,375.00
		Notes:          "Valid for 14 days from date of quote.",
	})
	require.NoError(t, err)
	require.Equal(t, "draft", estDetail.Estimate.Status)
	require.Equal(t, int64(12500000), estDetail.Estimate.SubtotalMinor)
	require.Equal(t, int64(13437500), estDetail.Estimate.TotalAmountMinor)
	require.Len(t, estDetail.Items, 2)

	// 2. Update Status to Sent and then Accepted
	updated, err := svc.UpdateEstimateStatus(ctx, wsID, estDetail.Estimate.ID, "sent")
	require.NoError(t, err)
	require.Equal(t, "sent", updated.Estimate.Status)

	accepted, err := svc.UpdateEstimateStatus(ctx, wsID, estDetail.Estimate.ID, "accepted")
	require.NoError(t, err)
	require.Equal(t, "accepted", accepted.Estimate.Status)

	// 3. Convert Estimate to Invoice
	invDetail, err := svc.ConvertEstimateToInvoice(ctx, wsID, userID, estDetail.Estimate.ID, "idemp-convert-est-1")
	require.NoError(t, err)
	require.Equal(t, "draft", invDetail.Invoice.Status)
	require.Equal(t, int64(13437500), invDetail.Invoice.TotalAmountMinor)
	require.Equal(t, cust.ID, invDetail.Invoice.CustomerID)
	require.Len(t, invDetail.Items, 2)

	// 4. Verify Estimate is marked as converted and references the new invoice
	afterConvert, err := svc.GetEstimate(ctx, wsID, estDetail.Estimate.ID)
	require.NoError(t, err)
	require.Equal(t, "converted", afterConvert.Estimate.Status)
	require.True(t, afterConvert.Estimate.ConvertedInvoiceID.Valid)
	require.Equal(t, invDetail.Invoice.ID, afterConvert.Estimate.ConvertedInvoiceID.Int64)

	// 5. Converting again should fail safely
	_, err = svc.ConvertEstimateToInvoice(ctx, wsID, userID, estDetail.Estimate.ID, "idemp-convert-est-2")
	require.ErrorIs(t, err, finance.ErrEstimateAlreadyConverted)
}
