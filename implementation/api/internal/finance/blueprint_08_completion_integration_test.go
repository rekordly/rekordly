package finance_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/auth"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestDirectPurchaseOrderEditDuplicateReviseAndReceiptGuard(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "bp08-po")
	svc := finance.NewService(pool)
	ctx := context.Background()

	supplier, err := svc.CreateCounterparty(ctx, ws, finance.CreateCounterpartyInput{Name: "Direct PO Supplier", PartyType: "supplier"})
	require.NoError(t, err)
	product, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{Name: "Stainless Bolt", Kind: "stock_tracked", SellingPrice: "100", Currency: "NGN", IdempotencyKey: "bp08-po-prod"})
	require.NoError(t, err)

	var outletID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO inventory_locations(workspace_id, name, is_default, is_active) VALUES($1, 'Main Warehouse', true, true) RETURNING id`, ws).Scan(&outletID))

	// 1. Direct PO creation (no PR)
	po, err := svc.CreateDirectPurchaseOrder(ctx, ws, user, finance.CreatePurchaseOrderInput{
		SupplierID:     supplier.ID,
		OutletID:       &outletID,
		ExpectedDate:   "2026-12-01",
		PaymentTerms:   "Net 30",
		Notes:          "Urgent batch",
		Currency:       "NGN",
		IdempotencyKey: "bp08-direct-po-1",
		Lines: []finance.PurchaseOrderLineInput{
			{ProductID: &product.ID, Description: "Stainless Bolt Box", Quantity: "10", UnitName: "box", ExpectedUnitCost: "50", Discount: "10", TaxAmount: "15"},
		},
	})
	require.NoError(t, err)
	require.Equal(t, int64(0), po.SourcePurchaseRequestID)
	require.Equal(t, "50500", po.TotalMinor) // 10*5000 - 1000 + 1500 = 50500
	require.Len(t, po.Lines, 1)

	// 2. Edit draft PO
	edited, err := svc.UpdatePurchaseOrderDraft(ctx, ws, user, po.ID, finance.UpdatePurchaseOrderDraftInput{
		ExpectedVersion: po.Version,
		PaymentTerms:    "Net 45",
		Notes:           "Updated terms",
		Lines: []finance.PurchaseOrderLineInput{
			{ProductID: &product.ID, Description: "Stainless Bolt Box", Quantity: "12", UnitName: "box", ExpectedUnitCost: "50", Discount: "0", TaxAmount: "0"},
		},
	})
	require.NoError(t, err)
	require.Equal(t, int32(2), edited.Version)
	require.Equal(t, "60000", edited.TotalMinor)

	// 3. Duplicate PO
	dup, err := svc.DuplicatePurchaseOrder(ctx, ws, user, edited.ID, "bp08-po-dup-1")
	require.NoError(t, err)
	require.NotEqual(t, edited.ID, dup.ID)
	require.Equal(t, "draft", dup.Status)
	require.Equal(t, "60000", dup.TotalMinor)

	// 4. Advance & Issue, then partial receive 4 units
	sub, err := svc.AdvancePurchaseOrder(ctx, ws, user, edited.ID, edited.Version, "submitted", "bp08-po-sub")
	require.NoError(t, err)
	app, err := svc.AdvancePurchaseOrder(ctx, ws, user, edited.ID, sub.Version, "approved", "bp08-po-app")
	require.NoError(t, err)
	issued, err := svc.AdvancePurchaseOrder(ctx, ws, user, edited.ID, app.Version, "issued", "bp08-po-iss")
	require.NoError(t, err)

	issuedDetail, err := svc.GetPurchaseOrder(ctx, ws, issued.ID)
	require.NoError(t, err)
	poLineID := issuedDetail.Lines[0].ID

	_, err = svc.CreateGoodsReceipt(ctx, ws, user, finance.CreateGoodsReceiptInput{
		PurchaseOrderID: issued.ID,
		LocationID:      outletID,
		ReceivedOn:      "2026-11-11",
		IdempotencyKey:  "bp08-po-partial-grn",
		Lines: []finance.GoodsReceiptLineInput{
			{PurchaseOrderLineID: poLineID, AcceptedQuantity: "4"},
		},
	})
	require.NoError(t, err)

	afterGRN, err := svc.GetPurchaseOrder(ctx, ws, issued.ID)
	require.NoError(t, err)
	require.Equal(t, "partially_received", afterGRN.Status)

	// Guard: cannot revise qty below already received (4)
	_, err = svc.RevisePurchaseOrder(ctx, ws, user, afterGRN.ID, finance.RevisePurchaseOrderInput{
		ExpectedVersion: afterGRN.Version,
		Reason:          "Attempt invalid drop",
		IdempotencyKey:  "bp08-po-rev-bad",
		Lines: []finance.PurchaseOrderLineInput{
			{ID: poLineID, ProductID: &product.ID, Description: "Stainless Bolt Box", Quantity: "3", UnitName: "box", ExpectedUnitCost: "50"},
		},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "already received")

	// Valid revision: reduce from 12 to 8 (>= 4 received)
	revised, err := svc.RevisePurchaseOrder(ctx, ws, user, afterGRN.ID, finance.RevisePurchaseOrderInput{
		ExpectedVersion: afterGRN.Version,
		Reason:          "Reduce order from 12 to 8 boxes",
		IdempotencyKey:  "bp08-po-rev-ok",
		Lines: []finance.PurchaseOrderLineInput{
			{ID: poLineID, ProductID: &product.ID, Description: "Stainless Bolt Box", Quantity: "8", UnitName: "box", ExpectedUnitCost: "50"},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "40000", revised.TotalMinor)

	versions, err := svc.ListPurchaseOrderVersions(ctx, ws, afterGRN.ID)
	require.NoError(t, err)
	require.Len(t, versions, 1)
	require.Equal(t, afterGRN.Version, versions[0].Version)
}

func TestUnplannedReceiptLandedCostBatchSerialAndRejectedQty(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "bp08-unplanned")
	svc := finance.NewService(pool)
	ctx := context.Background()

	supplier, err := svc.CreateCounterparty(ctx, ws, finance.CreateCounterpartyInput{Name: "Walk-in Vendor", PartyType: "supplier"})
	require.NoError(t, err)
	product, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{Name: "Router Unit", Kind: "stock_tracked", SellingPrice: "200", Currency: "NGN", IdempotencyKey: "bp08-router"})
	require.NoError(t, err)
	var outletID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO inventory_locations(workspace_id, name, is_default, is_active) VALUES($1, 'Depot', true, true) RETURNING id`, ws).Scan(&outletID))

	// Serial count mismatch must error
	_, err = svc.CreateGoodsReceipt(ctx, ws, user, finance.CreateGoodsReceiptInput{
		SupplierID:     supplier.ID,
		Reason:         "Emergency stock delivery",
		Currency:       "NGN",
		LocationID:     outletID,
		ReceivedOn:     "2026-11-11",
		IdempotencyKey: "bp08-unplanned-bad-serial",
		Lines: []finance.GoodsReceiptLineInput{
			{ProductID: &product.ID, AcceptedQuantity: "2", ActualUnitCost: "100", SerialNumbers: []string{"SN-1"}},
		},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "serial number count")

	// Valid unplanned receipt with rejected qty, batch, expiry, serials, and landed cost
	grn, err := svc.CreateGoodsReceipt(ctx, ws, user, finance.CreateGoodsReceiptInput{
		SupplierID:        supplier.ID,
		Reason:            "Emergency delivery",
		Currency:          "NGN",
		LocationID:        outletID,
		DeliveryReference: "DN-9988",
		LandedCost:        "30", // 3000 minor
		ReceivedOn:        "2026-11-11",
		IdempotencyKey:    "bp08-unplanned-ok",
		Lines: []finance.GoodsReceiptLineInput{
			{
				ProductID:        &product.ID,
				AcceptedQuantity: "2",
				RejectedQuantity: "1",
				ActualUnitCost:   "100", // 2*10000 = 20000 + 3000 landed = 23000
				BatchNumber:      "BATCH-A1",
				ExpiryDate:       "2028-01-01",
				SerialNumbers:    []string{"SN-001", "SN-002"},
				Notes:            "1 damaged carton rejected",
			},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "unplanned", grn.SourceType)
	require.Equal(t, "23000", grn.TotalMinor)

	detail, err := svc.GetGoodsReceipt(ctx, ws, grn.ID)
	require.NoError(t, err)
	require.Len(t, detail.Lines, 1)
	require.Equal(t, "1", detail.Lines[0].RejectedQuantity)
	require.Equal(t, "BATCH-A1", *detail.Lines[0].BatchNumber)
	require.Equal(t, []string{"SN-001", "SN-002"}, detail.Lines[0].SerialNumbers)
	require.Equal(t, "3000", detail.Lines[0].LandedCostMinor)
	require.Equal(t, "11500", detail.Lines[0].EffectiveUnitCostMinor)

	// Stock on hand should only reflect accepted qty (2), not rejected (1), valued at 23000
	var qtyStr string
	var valMinor int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT quantity_on_hand::text, value_on_hand_minor FROM inventory_balances WHERE workspace_id=$1 AND product_id=$2`, ws, product.ID).Scan(&qtyStr, &valMinor))
	require.Equal(t, "2.0000", qtyStr)
	require.Equal(t, int64(23000), valMinor)
}

func TestSupplierBillLinesDuplicateVarianceCreditReverseAndAgingReport(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "bp08-bills")
	svc := finance.NewService(pool)
	ctx := context.Background()

	supplier, err := svc.CreateCounterparty(ctx, ws, finance.CreateCounterpartyInput{Name: "Billing Vendor", PartyType: "supplier"})
	require.NoError(t, err)
	product, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{Name: "Paper Ream", Kind: "stock_tracked", SellingPrice: "80", Currency: "NGN", IdempotencyKey: "bp08-paper"})
	require.NoError(t, err)
	var outletID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO inventory_locations(workspace_id, name, is_default, is_active) VALUES($1, 'Branch 1', true, true) RETURNING id`, ws).Scan(&outletID))

	// Receive 4 units @ 100.00 each => GRNI = 40000
	grn, err := svc.CreateGoodsReceipt(ctx, ws, user, finance.CreateGoodsReceiptInput{
		SupplierID:     supplier.ID,
		Reason:         "Stock replenish",
		Currency:       "NGN",
		LocationID:     outletID,
		ReceivedOn:     "2026-10-15",
		IdempotencyKey: "bp08-bill-grn",
		Lines: []finance.GoodsReceiptLineInput{
			{ProductID: &product.ID, AcceptedQuantity: "4", ActualUnitCost: "100"},
		},
	})
	require.NoError(t, err)
	grnDetail, err := svc.GetGoodsReceipt(ctx, ws, grn.ID)
	require.NoError(t, err)
	grnLineID := grnDetail.Lines[0].ID

	// Partial bill #1 with price variance: 2 units billed @ 110.00 (expected 100.00) + 10.00 tax = 230.00 (23000)
	// GRNI portion = 20000, variance = +2000, tax = 1000
	bill1, err := svc.CreateSupplierBill(ctx, ws, user, finance.CreateSupplierBillInput{
		GoodsReceiptID:        grn.ID,
		SupplierInvoiceNumber: "INV-2026-01",
		BillDate:              "2026-10-16",
		DueDate:               "2026-10-20",
		IdempotencyKey:        "bp08-bill-1",
		Lines: []finance.SupplierBillLineInput{
			{GoodsReceiptLineID: grnLineID, Description: "Paper Ream Part 1", Quantity: "2", UnitCost: "110", TaxAmount: "10"},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "23000", bill1.TotalMinor)
	require.Equal(t, "2000", bill1.VarianceMinor)
	require.Len(t, bill1.Lines, 1)

	// Normalized duplicate invoice number must be rejected
	_, err = svc.CreateSupplierBill(ctx, ws, user, finance.CreateSupplierBillInput{
		GoodsReceiptID:        grn.ID,
		SupplierInvoiceNumber: "  inv-2026-01 ",
		BillDate:              "2026-10-16",
		IdempotencyKey:        "bp08-bill-dup",
	})
	require.ErrorIs(t, err, finance.ErrDuplicateBill)

	// Approving without AcceptVariance exceeds 0 bps tolerance
	_, err = svc.ApproveSupplierBill(ctx, ws, user, bill1.ID, finance.SupplierBillCommandInput{
		ExpectedVersion: bill1.Version,
		IdempotencyKey:  "bp08-bill-app-fail",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "variance")

	// Approve with explicit AcceptVariance -> posts GRNI, VAT, PPV, AP
	approved1, err := svc.ApproveSupplierBill(ctx, ws, user, bill1.ID, finance.SupplierBillCommandInput{
		ExpectedVersion: bill1.Version,
		AcceptVariance:  true,
		IdempotencyKey:  "bp08-bill-app-ok",
	})
	require.NoError(t, err)
	require.Equal(t, "approved", approved1.Status)

	// Return 1 unit to supplier -> credit -> apply credit to approved bill1!
	ret, err := svc.CreateSupplierReturn(ctx, ws, user, finance.CreateSupplierReturnInput{
		GoodsReceiptID: grn.ID,
		EffectiveOn:    "2026-10-17",
		Reason:         "Excess stock returned",
		IdempotencyKey: "bp08-ret-1",
		Lines:          []finance.SupplierReturnLineInput{{GoodsReceiptLineID: grnLineID, Quantity: "1"}},
	})
	require.NoError(t, err)

	credit, err := svc.CreateSupplierCredit(ctx, ws, user, finance.CreateSupplierCreditInput{
		SupplierReturnID: ret.ID,
		Amount:           "100",
		Reason:           "Credit for 1 ream",
		IdempotencyKey:   "bp08-credit-1",
	})
	require.NoError(t, err)

	credits, err := svc.ListSupplierCredits(ctx, ws)
	require.NoError(t, err)
	require.Len(t, credits, 1)

	creditedBill, err := svc.ApplySupplierCreditToBill(ctx, ws, user, approved1.ID, finance.ApplySupplierCreditToBillInput{
		SupplierCreditID:    credit.ID,
		Amount:              "100",
		ExpectedBillVersion: approved1.Version,
		IdempotencyKey:      "bp08-apply-credit-1",
	})
	require.NoError(t, err)
	require.Equal(t, "partially_paid", creditedBill.Status)
	require.Equal(t, "13000", creditedBill.OutstandingMinor)
	require.Equal(t, "10000", creditedBill.CreditedMinor)

	// Create a second partial bill for remaining 1 unit & test reversal
	bill2, err := svc.CreateSupplierBill(ctx, ws, user, finance.CreateSupplierBillInput{
		GoodsReceiptID:        grn.ID,
		SupplierInvoiceNumber: "INV-2026-02",
		BillDate:              "2026-10-18",
		DueDate:               "2026-11-30",
		IdempotencyKey:        "bp08-bill-2",
		Lines: []finance.SupplierBillLineInput{
			{GoodsReceiptLineID: grnLineID, Description: "Paper Ream Part 2", Quantity: "1", UnitCost: "100"},
		},
	})
	require.NoError(t, err)
	approved2, err := svc.ApproveSupplierBill(ctx, ws, user, bill2.ID, finance.SupplierBillCommandInput{
		ExpectedVersion: bill2.Version,
		IdempotencyKey:  "bp08-bill2-app",
	})
	require.NoError(t, err)

	reversed2, err := svc.TransitionSupplierBill(ctx, ws, user, approved2.ID, "reverse", finance.SupplierBillCommandInput{
		ExpectedVersion: approved2.Version,
		Reason:          "Wrong price on bill #2",
		IdempotencyKey:  "bp08-bill2-rev",
	})
	require.NoError(t, err)
	require.Equal(t, "reversed", reversed2.Status)
	require.Equal(t, "0", reversed2.OutstandingMinor)

	// Check overall ledger balance across everything posted so far
	var debits, creditsSum int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT COALESCE(sum(debit_minor),0), COALESCE(sum(credit_minor),0) FROM ledger_lines WHERE workspace_id=$1`, ws).Scan(&debits, &creditsSum))
	require.Equal(t, debits, creditsSum)

	// Check expanded aging / variance / pending returns report as of 2026-11-11
	report, err := svc.GetProcurementReport(ctx, ws, "2026-11-11")
	require.NoError(t, err)
	require.Equal(t, "13000", report.ApAging.Days1To30Minor) // due 2026-10-20 vs 2026-11-11 = 22 days overdue
	require.Len(t, report.VarianceBills, 1)
}

func TestProcurementRBACAndOutletScopeEnforcement(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "bp08-rbac")
	svc := finance.NewService(pool)
	handler := finance.NewHandler(svc, nil)

	// Verify RoleTemplateDefinitions include Blueprint 08 capabilities
	defs := auth.RoleTemplateDefinitions()
	require.Contains(t, defs["procurement"].Permissions, "purchases.create_po")
	require.Contains(t, defs["accountant"].Permissions, "purchases.approve_bill")
	require.Contains(t, defs["inventory_manager"].Permissions, "purchases.receive")

	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	supplier, err := svc.CreateCounterparty(ctx, ws, finance.CreateCounterpartyInput{Name: "RBAC Vendor", PartyType: "supplier"})
	require.NoError(t, err)

	var outletA, outletB int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO inventory_locations(workspace_id, name, is_default, is_active) VALUES($1, 'Outlet A', true, true) RETURNING id`, ws).Scan(&outletA))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO inventory_locations(workspace_id, name, is_default, is_active) VALUES($1, 'Outlet B', false, true) RETURNING id`, ws).Scan(&outletB))

	buildRouter := func(perms []string, scopedOutlet int64) *gin.Engine {
		r := gin.New()
		r.Use(func(c *gin.Context) {
			var scope map[string]any
			if scopedOutlet > 0 {
				scope = map[string]any{"outlet_id": scopedOutlet}
			}
			c.Set(finance.ContextWorkspaceKey, finance.WorkspaceContext{
				WorkspaceID: ws,
				UserID:      user,
				Kind:        "business",
				RoleCode:    "staff",
				IsOwner:     false,
				Permissions: perms,
				OutletScope: scope,
			})
			c.Next()
		})
		g := r.Group("/api/v1")
		handler.RegisterPurchaseOrderRoutes(g)
		handler.RegisterGoodsReceiptRoutes(g)
		return r
	}

	// User with only purchases.request cannot create PO (403)
	rNoPO := buildRouter([]string{"purchases.request"}, 0)
	body, _ := json.Marshal(map[string]any{
		"supplier_id": supplier.ID,
		"outlet_id":   outletB,
		"lines":       []map[string]any{{"description": "Test", "quantity": "1", "expected_unit_cost": "10"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/purchase-orders", bytes.NewReader(body))
	req.Header.Set("Idempotency-Key", "rbac-1")
	w := httptest.NewRecorder()
	rNoPO.ServeHTTP(w, req)
	require.Equal(t, http.StatusForbidden, w.Code)

	// User with purchases.create_po scoped to Outlet A cannot create PO for Outlet B (403 OUTLET_SCOPE_FORBIDDEN)
	rScoped := buildRouter([]string{"purchases.create_po"}, outletA)
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/purchase-orders", bytes.NewReader(body))
	req2.Header.Set("Idempotency-Key", "rbac-2")
	w2 := httptest.NewRecorder()
	rScoped.ServeHTTP(w2, req2)
	require.Equal(t, http.StatusForbidden, w2.Code)
	require.Contains(t, w2.Body.String(), "OUTLET_SCOPE_FORBIDDEN")

	// User with purchases.create_po scoped to Outlet A succeeds creating PO for Outlet A (201)
	bodyA, _ := json.Marshal(map[string]any{
		"supplier_id": supplier.ID,
		"outlet_id":   outletA,
		"lines":       []map[string]any{{"description": "Test", "quantity": "1", "expected_unit_cost": "10"}},
	})
	req3 := httptest.NewRequest(http.MethodPost, "/api/v1/purchase-orders", bytes.NewReader(bodyA))
	req3.Header.Set("Idempotency-Key", "rbac-3")
	w3 := httptest.NewRecorder()
	rScoped.ServeHTTP(w3, req3)
	require.Equal(t, http.StatusCreated, w3.Code)
}
