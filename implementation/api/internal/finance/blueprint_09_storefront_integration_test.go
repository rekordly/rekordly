package finance_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/auth"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestStorefrontSetupProjectionCartCheckoutConfirmFulfilAndLedger(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "bp09-flow")
	svc := finance.NewService(pool)
	ctx := context.Background()

	// Create outlet, supplier, catalogue product, and stock via unplanned GRN @ 40.00 each (qty 5 -> value 20000)
	var outletID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO inventory_locations(workspace_id, name, is_default, is_active) VALUES($1, 'Showroom', true, true) RETURNING id`, ws).Scan(&outletID))
	supplier, err := svc.CreateCounterparty(ctx, ws, finance.CreateCounterpartyInput{Name: "Secret Wholesale Supplier", PartyType: "supplier"})
	require.NoError(t, err)
	item, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name:         "Leather Loafers",
		Description:  "Handcrafted Italian leather loafers",
		Kind:         "stock_tracked",
		SellingPrice: "100",
		Currency:     "NGN",
		IdempotencyKey: "bp09-prod-1",
	})
	require.NoError(t, err)

	variants, err := svc.ListProductVariants(ctx, ws, item.ID)
	require.NoError(t, err)
	require.NotEmpty(t, variants)
	variantID := variants[0].ID

	_, err = svc.CreateGoodsReceipt(ctx, ws, user, finance.CreateGoodsReceiptInput{
		SupplierID:     supplier.ID,
		Reason:         "Initial showroom stock",
		Currency:       "NGN",
		LocationID:     outletID,
		ReceivedOn:     "2026-11-11",
		IdempotencyKey: "bp09-grn-1",
		Lines: []finance.GoodsReceiptLineInput{
			{ProductID: &item.ID, AcceptedQuantity: "5", ActualUnitCost: "40", BatchNumber: "SECRET-BATCH-01"},
		},
	})
	require.NoError(t, err)

	// 1. Storefront reserved slug must fail
	_, err = svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{Name: "Admin Store", Slug: "admin"})
	require.ErrorIs(t, err, finance.ErrSlugUnavailable)

	// Create valid draft storefront
	sf, err := svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name:            "<script>alert(1)</script>Kola Footwear",
		Slug:            "kola-footwear",
		ThemeKey:        "modern",
		DefaultOutletID: &outletID,
		Currency:        "NGN",
	})
	require.NoError(t, err)
	require.Equal(t, "draft", sf.Status)
	require.NotContains(t, sf.Name, "<script>")
	require.Equal(t, "kola-footwear.rekordly.com", sf.SubdomainHost)

	// Publishing without contact/products must fail
	_, err = svc.PublishStorefront(ctx, ws, true)
	require.Error(t, err)

	// Update settings with accessible color check (bad contrast falls back cleanly) and Cloudinary transform
	sf, err = svc.UpdateStorefrontSettings(ctx, ws, finance.UpdateStorefrontSettingsInput{
		ContactPhone:       "+2348000001111",
		ContactEmail:       "hello@kola.ng",
		BackgroundColor:    "#FFFFFF",
		TextColor:          "#EEEEEE", // fails WCAG AA on white -> triggers safe fallback
		LogoURL:            "https://res.cloudinary.com/demo/image/upload/v1/logo.png",
		DeliveryMethods:    []string{"pickup", "merchant_delivery"},
		DefaultDeliveryFee: "15",
	})
	require.NoError(t, err)
	require.Equal(t, "#111827", sf.Settings.TextColor)
	require.Contains(t, *sf.Settings.LogoURL, "f_auto,q_auto")

	// Create collection & publish variant
	col, err := svc.CreateStorefrontCollection(ctx, ws, finance.UpsertCollectionInput{Name: "Menswear", Slug: "menswear"})
	require.NoError(t, err)
	pubProd, err := svc.UpsertStorefrontProduct(ctx, ws, variantID, finance.PublishCatalogueVariantInput{
		CollectionID:       &col.ID,
		IsPublished:        true,
		IsFeatured:         true,
		PublicTitle:        "Kola Classic Loafers",
		PublicDescription:  "Full grain leather",
		AvailabilityPolicy: "in_out_stock",
	})
	require.NoError(t, err)

	// Cannot access public projection while still draft
	_, err = svc.GetPublicStorefrontProjection(ctx, "kola-footwear", false, "", "")
	require.ErrorIs(t, err, finance.ErrStorefrontNotPublished)

	// Publish storefront
	sf, err = svc.PublishStorefront(ctx, ws, true)
	require.NoError(t, err)
	require.Equal(t, "published", sf.Status)

	proj, err := svc.GetPublicStorefrontProjection(ctx, "kola-footwear", false, "loafers", "menswear")
	require.NoError(t, err)
	require.Len(t, proj.Products, 1)
	rawProjBytes, _ := json.Marshal(proj)
	require.NotContains(t, string(rawProjBytes), "Secret Wholesale Supplier")
	require.NotContains(t, string(rawProjBytes), "SECRET-BATCH-01")
	require.Nil(t, proj.Products[0].AvailableQuantity) // exact quantity hidden by in_out_stock policy

	// 2. Cart calculation detects price mismatch & never reserves stock
	_, _, err = svc.ValidateAndRecalculateCart(ctx, "kola-footwear", false, []finance.CartLineInput{
		{StorefrontProductID: pubProd.ID, Quantity: "2", ExpectedPriceMinor: "9999"},
	}, "merchant_delivery")
	require.NoError(t, err) // returns HasChanges=true in ValidateAndRecalculateCart; UpsertVisitorCart enforces ErrCartItemChanged
	_, err = svc.UpsertVisitorCart(ctx, "kola-footwear", "", []finance.CartLineInput{
		{StorefrontProductID: pubProd.ID, Quantity: "2", ExpectedPriceMinor: "9999"},
	}, "merchant_delivery")
	require.ErrorIs(t, err, finance.ErrCartItemChanged)

	cart, err := svc.UpsertVisitorCart(ctx, "kola-footwear", "", []finance.CartLineInput{
		{StorefrontProductID: pubProd.ID, Quantity: "2"},
	}, "merchant_delivery")
	require.NoError(t, err)
	require.Equal(t, "21500", cart.EstimatedTotal) // 2*10000 + 1500 delivery fee

	// Verify ZERO reservations after cart
	var reservedAfterCart string
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity::text FROM inventory_balances WHERE workspace_id=$1 AND product_id=$2`, ws, item.ID).Scan(&reservedAfterCart))
	require.Equal(t, "0.0000", reservedAfterCart)

	// 3. Guest checkout creates order request without reserving stock or posting GL
	checkout, err := svc.SubmitGuestCheckout(ctx, "kola-footwear", false, finance.GuestCheckoutInput{
		ClientKey:          "10.0.0.5",
		CartToken:          cart.CartToken,
		Lines:              []finance.CartLineInput{{StorefrontProductID: pubProd.ID, Quantity: "3"}},
		CustomerName:       "<b>Ada</b>",
		CustomerPhone:      "+2348012345678",
		DeliveryMethod:     "merchant_delivery",
		DeliveryAddress:    "12 Allen Ave, Ikeja",
		PolicyAcknowledged: true,
		IdempotencyKey:     "bp09-checkout-1",
	})
	require.NoError(t, err)
	require.Equal(t, "request_received", checkout.CommercialStatus)
	require.Equal(t, "unreserved", checkout.FulfilmentStatus)
	require.Equal(t, "31500", checkout.TotalMinor)
	require.NotEmpty(t, checkout.StatusToken)

	// Duplicate submit is idempotent
	checkoutDup, err := svc.SubmitGuestCheckout(ctx, "kola-footwear", false, finance.GuestCheckoutInput{
		ClientKey:          "10.0.0.5",
		Lines:              []finance.CartLineInput{{StorefrontProductID: pubProd.ID, Quantity: "3"}},
		CustomerName:       "Ada",
		CustomerPhone:      "+2348012345678",
		DeliveryMethod:     "merchant_delivery",
		DeliveryAddress:    "12 Allen Ave, Ikeja",
		PolicyAcknowledged: true,
		IdempotencyKey:     "bp09-checkout-1",
	})
	require.NoError(t, err)
	require.Equal(t, checkout.OrderReference, checkoutDup.OrderReference)

	// Still zero reservation
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity::text FROM inventory_balances WHERE workspace_id=$1 AND product_id=$2`, ws, item.ID).Scan(&reservedAfterCart))
	require.Equal(t, "0.0000", reservedAfterCart)

	// 4. Merchant reviews & requests price/fee change -> version conflict if stale ack -> customer acks
	ordersList, err := svc.ListMerchantOrders(ctx, ws, "", 0)
	require.NoError(t, err)
	require.Len(t, ordersList, 1)
	orderID := ordersList[0].ID

	revOrder, err := svc.RequestOrderChange(ctx, ws, user, orderID, finance.RequestOrderChangeInput{
		ExpectedVersion:    1,
		DeliveryFee:        "20",
		PaymentArrangement: "Bank transfer before dispatch",
		ChangeSummary:      "Updated delivery fee to 20 NGN for Ikeja dispatch",
		RequiresAck:        true,
	})
	require.NoError(t, err)
	require.Equal(t, "quote_changes_requested", revOrder.CommercialStatus)
	require.Equal(t, "32000", revOrder.TotalMinor)

	// Cannot confirm before customer ack
	_, err = svc.ConfirmStorefrontOrder(ctx, ws, user, orderID, finance.ConfirmOrderInput{ExpectedVersion: revOrder.Version, OutletID: outletID})
	require.Error(t, err)

	// Stale ack fails
	_, err = svc.AcknowledgePublicOrderChanges(ctx, checkout.StatusToken, 1)
	require.ErrorIs(t, err, finance.ErrOrderVersionConflict)

	// Valid ack transitions back to needs_review
	pubAcked, err := svc.AcknowledgePublicOrderChanges(ctx, checkout.StatusToken, revOrder.Version)
	require.NoError(t, err)
	require.Equal(t, "needs_review", pubAcked.CommercialStatus)
	require.False(t, pubAcked.RequiresCustomerAck)

	// 5. Merchant confirms order -> atomically reserves 3 units
	confirmed, err := svc.ConfirmStorefrontOrder(ctx, ws, user, orderID, finance.ConfirmOrderInput{
		ExpectedVersion: pubAcked.Version,
		OutletID:        outletID,
	})
	require.NoError(t, err)
	require.Equal(t, "confirmed", confirmed.CommercialStatus)
	require.Equal(t, "reserved", confirmed.FulfilmentStatus)

	var reservedNow string
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity::text FROM inventory_balances WHERE workspace_id=$1 AND product_id=$2`, ws, item.ID).Scan(&reservedNow))
	require.Equal(t, "3.0000", reservedNow)

	// Second competing order requesting 3 units (only 2 left available) must fail with ErrInsufficientStock on confirm!
	checkout2, err := svc.SubmitGuestCheckout(ctx, "kola-footwear", false, finance.GuestCheckoutInput{
		ClientKey:          "10.0.0.6",
		Lines:              []finance.CartLineInput{{StorefrontProductID: pubProd.ID, Quantity: "3"}},
		CustomerName:       "Tunde",
		CustomerPhone:      "+2348099999999",
		DeliveryMethod:     "pickup",
		PolicyAcknowledged: true,
		IdempotencyKey:     "bp09-checkout-2",
	})
	require.NoError(t, err)
	orders2, _ := svc.ListMerchantOrders(ctx, ws, "request_received", 0)
	_, err = svc.ConfirmStorefrontOrder(ctx, ws, user, orders2[0].ID, finance.ConfirmOrderInput{ExpectedVersion: 1, OutletID: outletID})
	require.ErrorIs(t, err, finance.ErrInsufficientStock)

	// Cancel order 2 cleanly (before confirmation -> no stock impact)
	_, err = svc.CancelPublicOrderBeforeConfirm(ctx, checkout2.StatusToken, "Found closer pickup")
	require.NoError(t, err)

	// 6. Fulfil confirmed order 1 -> consumes reservation, issues stock & posts balanced weighted-average COGS (3 * 40.00 = 12000)
	fulfilled, err := svc.FulfilStorefrontOrder(ctx, ws, user, orderID, finance.FulfilStorefrontOrderInput{
		ExpectedVersion: confirmed.Version,
		DispatchedOn:    "2026-11-11",
		RecipientName:   "Ada",
		TrackingNote:    "Dispatch rider #4",
	})
	require.NoError(t, err)
	require.Equal(t, "fulfilled", fulfilled.FulfilmentStatus)
	require.Equal(t, "completed", fulfilled.CommercialStatus)

	var onHandAfter, reservedAfter, valueAfter string
	require.NoError(t, pool.QueryRow(ctx, `SELECT quantity_on_hand::text, reserved_quantity::text, value_on_hand_minor::text FROM inventory_balances WHERE workspace_id=$1 AND product_id=$2`, ws, item.ID).Scan(&onHandAfter, &reservedAfter, &valueAfter))
	require.Equal(t, "2.0000", onHandAfter)
	require.Equal(t, "0.0000", reservedAfter)
	require.Equal(t, "8000", valueAfter) // 20000 - 12000 COGS

	// Post-fulfilment cancel must be disallowed
	_, err = svc.DeclineOrCancelStorefrontOrder(ctx, ws, user, orderID, "cancel", "Attempt post fulfil cancel")
	require.Error(t, err)

	// Link customer & create invoice explicitly
	invoiced, err := svc.ConvertOrderToInvoice(ctx, ws, user, orderID, false)
	require.NoError(t, err)
	require.NotNil(t, invoiced.LinkedInvoiceID)

	// Double-entry ledger strictly balanced
	var debits, credits int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT COALESCE(sum(debit_minor),0), COALESCE(sum(credit_minor),0) FROM ledger_lines WHERE workspace_id=$1`, ws).Scan(&debits, &credits))
	require.Equal(t, debits, credits)

	// Analytics summary reflects views, cart, checkout, confirm, fulfil
	analytics, err := svc.GetStorefrontAnalytics(ctx, ws, 30)
	require.NoError(t, err)
	require.GreaterOrEqual(t, analytics.AddToCarts, int64(1))
	require.GreaterOrEqual(t, analytics.OrdersConfirmed, int64(1))
	require.GreaterOrEqual(t, analytics.OrdersFulfilled, int64(1))
}

func TestStorefrontDomainsDowngradeAndRBAC(t *testing.T) {
	pool := testPool(t)
	wsA, userA := createTestWorkspace(t, pool, "bp09-dom-a")
	wsB, userB := createTestWorkspace(t, pool, "bp09-dom-b")

	// Inject deterministic DNS TXT verifier into Service
	txtStore := map[string][]string{}
	svc := finance.NewService(pool, finance.WithStorefrontDNSLookup(func(host string) ([]string, error) {
		return txtStore[host], nil
	}))
	ctx := context.Background()

	var outletA int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO inventory_locations(workspace_id, name, is_default, is_active) VALUES($1, 'Hub', true, true) RETURNING id`, wsA).Scan(&outletA))
	item, err := svc.CreateCatalogueItem(ctx, wsA, userA, finance.CreateCatalogueItemInput{Name: "Consult", Kind: "service", SellingPrice: "50", Currency: "NGN", IdempotencyKey: "bp09-srv"})
	require.NoError(t, err)
	vars, _ := svc.ListProductVariants(ctx, wsA, item.ID)

	_, err = svc.CreateStorefront(ctx, wsA, userA, finance.CreateStorefrontInput{Name: "Alpha Shop", Slug: "alpha-shop", DefaultOutletID: &outletA, Currency: "NGN"})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontSettings(ctx, wsA, finance.UpdateStorefrontSettingsInput{ContactEmail: "hi@alpha.shop"})
	require.NoError(t, err)
	_, err = svc.UpsertStorefrontProduct(ctx, wsA, vars[0].ID, finance.PublishCatalogueVariantInput{IsPublished: true})
	require.NoError(t, err)
	_, err = svc.PublishStorefront(ctx, wsA, true)
	require.NoError(t, err)

	// Other workspace cannot create storefront with same slug
	_, err = svc.CreateStorefront(ctx, wsB, userB, finance.CreateStorefrontInput{Name: "Copy", Slug: "alpha-shop"})
	require.ErrorIs(t, err, finance.ErrSlugUnavailable)

	// Invalid hostname rejected; valid custom domain starts pending_dns
	_, err = svc.AddCustomDomain(ctx, wsA, "https://bad.rekordly.com/path")
	require.ErrorIs(t, err, finance.ErrDomainInvalid)

	dom, err := svc.AddCustomDomain(ctx, wsA, "Shop.Example.COM")
	require.NoError(t, err)
	require.Equal(t, "shop.example.com", dom.Hostname)
	require.Equal(t, "pending_dns", dom.Status)

	// Duplicate claim from wsB fails without leaking owner
	_, err = svc.CreateStorefront(ctx, wsB, userB, finance.CreateStorefrontInput{Name: "Beta", Slug: "beta-shop"})
	require.NoError(t, err)
	_, err = svc.AddCustomDomain(ctx, wsB, "shop.example.com")
	require.ErrorIs(t, err, finance.ErrDomainAlreadyClaimed)

	// Unknown or unverified custom host cannot resolve public storefront
	_, err = svc.GetPublicStorefrontProjection(ctx, "shop.example.com", true, "", "")
	require.ErrorIs(t, err, finance.ErrStorefrontNotPublished)

	// Set expected DNS TXT record and recheck -> becomes active & TLS active
	txtStore[*dom.VerificationTXT] = []string{*dom.VerificationToken}
	verifiedDom, err := svc.RecheckCustomDomain(ctx, wsA, dom.ID)
	require.NoError(t, err)
	require.Equal(t, "active", verifiedDom.Status)
	require.Equal(t, "active", verifiedDom.TlsStatus)

	// Verified custom host resolves storefront
	proj, err := svc.GetPublicStorefrontProjection(ctx, "shop.example.com", true, "", "")
	require.NoError(t, err)
	require.Equal(t, "alpha-shop", proj.Slug)

	// Entitlement downgrade -> grace disables public routing without deleting storefront data
	_, err = svc.SetStorefrontEntitlementState(ctx, wsA, "grace", 7)
	require.NoError(t, err)
	_, err = svc.GetPublicStorefrontProjection(ctx, "shop.example.com", true, "", "")
	require.ErrorIs(t, err, finance.ErrStorefrontEntitlementLocked)

	// Restore active and republish -> host works again
	_, err = svc.SetStorefrontEntitlementState(ctx, wsA, "active", 0)
	require.NoError(t, err)
	_, err = svc.PublishStorefront(ctx, wsA, true)
	require.NoError(t, err)
	proj2, err := svc.GetPublicStorefrontProjection(ctx, "alpha-shop", false, "", "")
	require.NoError(t, err)
	require.Equal(t, "alpha-shop", proj2.Slug)

	// Disconnect custom domain -> host no longer resolves
	_, err = svc.DisconnectCustomDomain(ctx, wsA, dom.ID)
	require.NoError(t, err)
	_, err = svc.GetPublicStorefrontProjection(ctx, "shop.example.com", true, "", "")
	require.ErrorIs(t, err, finance.ErrStorefrontNotPublished)

	// RBAC permission verification
	defs := auth.RoleTemplateDefinitions()
	require.Contains(t, defs["admin"].Permissions, "storefront.publish")
	require.Contains(t, defs["sales"].Permissions, "orders.confirm")
	require.NotContains(t, defs["sales"].Permissions, "storefront.manage_domain")

	gin.SetMode(gin.TestMode)
	handler := finance.NewHandler(svc, nil)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(finance.ContextWorkspaceKey, finance.WorkspaceContext{
			WorkspaceID: wsA,
			UserID:      userA,
			Kind:        "business",
			RoleCode:    "sales",
			Permissions: []string{"orders.view", "orders.confirm"},
		})
		c.Next()
	})
	handler.RegisterStorefrontRoutes(r.Group("/api/v1"))
	body, _ := json.Marshal(map[string]any{"hostname": "sales-no.com"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/storefront/domains", bytes.NewReader(body))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusForbidden, w.Code)
}

func TestStorefrontCartRestoreReturnAndReservationExpiry(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "bp09-gaps")
	svc := finance.NewService(pool)
	ctx := context.Background()

	var outletID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO inventory_locations(workspace_id, name, is_default, is_active) VALUES($1, 'Main', true, true) RETURNING id`, ws).Scan(&outletID))
	item, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{Name: "Bottle", Kind: "stock_tracked", SellingPrice: "100", Currency: "NGN", IdempotencyKey: "bp09-gaps-item"})
	require.NoError(t, err)
	_, err = svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{ProductID: item.ID, LocationID: outletID, EffectiveOn: "2026-11-11", Quantity: "5", UnitCost: "40", Currency: "NGN", Reason: "Initial stock", IdempotencyKey: "bp09-gaps-open"})
	require.NoError(t, err)
	vars, err := svc.ListProductVariants(ctx, ws, item.ID)
	require.NoError(t, err)

	slug := "gaps-shop-" + fmt.Sprint(ws)
	_, err = svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{Name: "Gaps Shop", Slug: slug, DefaultOutletID: &outletID, Currency: "NGN"})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontSettings(ctx, ws, finance.UpdateStorefrontSettingsInput{ContactPhone: "+2348000000000"})
	require.NoError(t, err)
	sfProd, err := svc.UpsertStorefrontProduct(ctx, ws, vars[0].ID, finance.PublishCatalogueVariantInput{IsPublished: true})
	require.NoError(t, err)
	_, err = svc.PublishStorefront(ctx, ws, true)
	require.NoError(t, err)

	// 1. Cart upsert & restore by token
	saved, err := svc.UpsertVisitorCart(ctx, slug, "", []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "2"}}, "pickup")
	require.NoError(t, err)
	require.NotEmpty(t, saved.CartToken)

	restored, err := svc.GetVisitorCart(ctx, slug, saved.CartToken, "pickup")
	require.NoError(t, err)
	require.Len(t, restored.Lines, 1)
	require.Equal(t, "2.0000", restored.Lines[0].Quantity)

	// 2. Checkout -> Confirm -> Fulfil -> Customer Return Request -> Merchant Return & Restock
	orderConf, err := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey:          "127.0.0.1",
		Lines:              []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "2"}},
		CustomerName:       "Ada",
		CustomerPhone:      "+2348011111111",
		DeliveryMethod:     "pickup",
		PolicyAcknowledged: true,
		IdempotencyKey:     "bp09-gaps-co1",
	})
	require.NoError(t, err)

	orders, err := svc.ListMerchantOrders(ctx, ws, "", 0)
	require.NoError(t, err)
	require.Len(t, orders, 1)
	o1 := orders[0]

	confirmed, err := svc.ConfirmStorefrontOrder(ctx, ws, user, o1.ID, finance.ConfirmOrderInput{ExpectedVersion: o1.Version, OutletID: outletID})
	require.NoError(t, err)
	fulfilled, err := svc.FulfilStorefrontOrder(ctx, ws, user, o1.ID, finance.FulfilStorefrontOrderInput{ExpectedVersion: confirmed.Version})
	require.NoError(t, err)
	require.Equal(t, "fulfilled", fulfilled.FulfilmentStatus)

	_, err = svc.RequestPublicOrderReturn(ctx, orderConf.StatusToken, "Damaged seal")
	require.NoError(t, err)
	_, err = svc.ReturnStorefrontOrder(ctx, ws, user, o1.ID, finance.ReturnStorefrontOrderInput{Reason: "Accepted return"})
	require.NoError(t, err)

	var onHandAfterReturn string
	require.NoError(t, pool.QueryRow(ctx, `SELECT quantity_on_hand::text FROM inventory_balances WHERE workspace_id=$1 AND product_id=$2`, ws, item.ID).Scan(&onHandAfterReturn))
	require.Equal(t, "5.0000", onHandAfterReturn)

	// 3. Stale reservation expiry sweep
	_, err = svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey:          "127.0.0.1",
		Lines:              []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "1"}},
		CustomerName:       "Bola",
		CustomerPhone:      "+2348022222222",
		DeliveryMethod:     "pickup",
		PolicyAcknowledged: true,
		IdempotencyKey:     "bp09-gaps-co2",
	})
	require.NoError(t, err)
	orders2, err := svc.ListMerchantOrders(ctx, ws, "request_received", 0)
	require.NoError(t, err)
	require.Len(t, orders2, 1)
	_, err = svc.ConfirmStorefrontOrder(ctx, ws, user, orders2[0].ID, finance.ConfirmOrderInput{ExpectedVersion: orders2[0].Version, OutletID: outletID})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE storefront_orders SET reservation_expires_at = now() - interval '1 hour' WHERE id=$1`, orders2[0].ID)
	require.NoError(t, err)

	expiredCount, err := svc.ExpireStaleStorefrontReservations(ctx)
	require.NoError(t, err)
	require.GreaterOrEqual(t, expiredCount, 1)

	o2After, err := svc.GetMerchantOrder(ctx, ws, orders2[0].ID)
	require.NoError(t, err)
	require.Equal(t, "cancelled", o2After.CommercialStatus)
	require.Equal(t, "unreserved", o2After.FulfilmentStatus)
}
