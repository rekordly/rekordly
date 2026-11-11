package finance_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestInvoiceLineDiscountsMultiTaxAndProformaConversion(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	wsID, userID := createTestWorkspace(t, pool, "bp0506-inv")
	svc := finance.NewService(pool)

	cust, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name:           "Acme Client Ltd",
		PartyType:      "customer",
		Email:          "client@acme.test",
		OpeningBalance: "250.00",
	})
	require.NoError(t, err)
	require.Equal(t, int64(25000), cust.OpeningBalanceMinor)

	// Check duplicate detection hits by name / email
	q := db.New(pool)
	dups, err := q.FindPossibleDuplicateCounterparties(ctx, db.FindPossibleDuplicateCounterpartiesParams{
		WorkspaceID: wsID,
		Email:       pgtype.Text{String: "client@acme.test", Valid: true},
	})
	require.NoError(t, err)
	require.Len(t, dups, 1)

	// Proforma invoice with line-level discount and compound multi-tax
	// Item: 2 x 100.00 (200.00) - 20.00 line discount = 180.00 subtotal
	// Document discount: 30.00 => taxable base = 150.00
	// Non-compound VAT 10% (1000 bps) on 150.00 = 15.00
	// Compound Levy 10% (1000 bps) on (150.00 + 15.00 = 165.00) = 16.50
	// Delivery fee: 10.00 => Total = 150.00 + 31.50 + 10.00 = 191.50 (19150 minor)
	proforma, err := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID:        cust.ID,
		IssueDate:         "2026-11-11",
		DueDate:           "2026-11-25",
		DiscountAmount:    "30.00",
		DeliveryFeeAmount: "10.00",
		Currency:          "NGN",
		Status:            "finalized",
		DocumentKind:      "proforma",
		TaxLines: []finance.TaxLineInput{
			{Name: "VAT", RateBps: 1000, IsCompound: false},
			{Name: "Hospitality Levy", RateBps: 1000, IsCompound: true},
		},
		Items: []finance.InvoiceItemInput{
			{Description: "Consulting Package", Quantity: 2, UnitPrice: "100.00", DiscountAmount: "20.00"},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "proforma", proforma.Invoice.DocumentKind)
	require.Equal(t, int64(18000), proforma.Invoice.SubtotalMinor)
	require.Equal(t, int64(3150), proforma.Invoice.TaxAmountMinor)
	require.Equal(t, int64(19150), proforma.Invoice.TotalAmountMinor)
	require.Len(t, proforma.TaxLines, 2)

	// Convert Proforma -> Finalized Standard Invoice (which posts balanced ledger entries)
	converted, err := svc.ConvertProformaToInvoice(ctx, wsID, userID, proforma.Invoice.ID, true, "conv-proforma-1")
	require.NoError(t, err)
	require.Equal(t, "invoice", converted.Invoice.DocumentKind)
	require.Equal(t, "finalized", converted.Invoice.Status)
	require.True(t, converted.Invoice.ConvertedFromProformaID.Valid)
	require.Equal(t, proforma.Invoice.ID, converted.Invoice.ConvertedFromProformaID.Int64)
	require.Equal(t, int64(19150), converted.Invoice.TotalAmountMinor)

	// Document version history recorded
	versions, err := svc.ListDocumentVersions(ctx, wsID, "invoice", converted.Invoice.ID)
	require.NoError(t, err)
	require.NotEmpty(t, versions)
}

func TestDebitNotePortalEvidenceAndRBACHelpers(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	wsID, userID := createTestWorkspace(t, pool, "bp0506-dn")
	svc := finance.NewService(pool)

	cust, err := svc.CreateCounterparty(ctx, wsID, finance.CreateCounterpartyInput{
		Name: "Portal Buyer", PartyType: "customer", Email: "buyer@portal.test",
	})
	require.NoError(t, err)

	inv, err := svc.CreateInvoice(ctx, wsID, userID, finance.CreateInvoiceInput{
		CustomerID: cust.ID,
		IssueDate:  "2026-11-11",
		DueDate:    "2026-11-25",
		Status:     "finalized",
		Currency:   "NGN",
		Items:      []finance.InvoiceItemInput{{Description: "Hardware", Quantity: 1, UnitPrice: "500.00"}},
	})
	require.NoError(t, err)

	// Debit note increasing balance owed
	dn, err := svc.CreateDebitNote(ctx, wsID, userID, finance.CreateDebitNoteInput{
		InvoiceID:  inv.Invoice.ID,
		CustomerID: cust.ID,
		IssueDate:  "2026-11-11",
		Reason:     "Additional shipping surcharge",
		Items:      []finance.DebitNoteItemInput{{Description: "Express freight", Quantity: 1, UnitPrice: "50.00"}},
	})
	require.NoError(t, err)
	require.Equal(t, int64(5000), dn.DebitNote.TotalAmountMinor)

	// Share invoice + submit payment evidence + post guest message + claim party link
	token, _, err := svc.CreateInvoiceShare(ctx, wsID, inv.Invoice.ID, 7)
	require.NoError(t, err)

	ev, err := svc.SubmitPublicPaymentEvidence(ctx, token, finance.SubmitPaymentEvidenceInput{
		PayerName:     "Portal Buyer",
		PayerEmail:    "buyer@portal.test",
		Amount:        "500.00",
		PaymentDate:   "2026-11-11",
		PaymentMethod: "bank_transfer",
		Reference:     "NIP-998877",
	})
	require.NoError(t, err)
	require.Equal(t, "pending", ev.Status)

	msg, err := svc.PostPublicMessage(ctx, "invoice", token, finance.PostExternalMessageInput{
		SenderName: "Portal Buyer",
		Message:    "Transfer completed, receipt uploaded.",
	})
	require.NoError(t, err)
	require.Equal(t, "guest", msg.SenderType)

	link, err := svc.ClaimExternalPartyLink(ctx, userID, "invoice", token)
	require.NoError(t, err)
	require.Equal(t, cust.ID, link.CounterpartyID)

	// Verify WorkspaceContext RBAC & OutletScope evaluation
	restricted := finance.WorkspaceContext{
		WorkspaceID: wsID,
		UserID:      userID,
		RoleCode:    "cashier",
		IsOwner:     false,
		Permissions: []string{"sales.view", "sales.create"},
		OutletScope: map[string]any{"outlet_ids": []any{float64(7)}},
	}
	require.True(t, restricted.HasPermission("sales.create"))
	require.False(t, restricted.HasPermission("money.void"))
	require.True(t, restricted.IsOutletAllowed(7))
	require.False(t, restricted.IsOutletAllowed(99))
}
