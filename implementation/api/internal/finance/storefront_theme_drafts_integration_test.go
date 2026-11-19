package finance_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestStorefrontPremiumThemeDraftsRemainIndependentAndPrivate(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "premium-theme-drafts")
	svc := finance.NewService(pool, finance.WithStorefrontPaymentProvider(&mockPaymentProvider{key: "paystack"}))
	outlet, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
		Name: "Premium pickup", LocationType: "outlet", Address: "1 Test Road, Lagos", IsDefault: true, IsPickupPoint: true,
	})
	require.NoError(t, err)
	store, err := svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name: "Premium Draft Shop", Slug: "premium-draft-shop", Currency: "NGN", DefaultOutletID: &outlet.ID,
	})
	require.NoError(t, err)
	design, err := svc.GetStorefrontDesign(ctx, ws)
	require.NoError(t, err)

	save := func(theme, heading, key string, version int32) finance.StorefrontDesignView {
		t.Helper()
		saved, err := svc.SaveStorefrontDesignDraft(ctx, ws, user, finance.StorefrontDesignInput{
			ThemeKey: theme, Name: "Premium Draft Shop",
			Brand: finance.StorefrontBrand{Palette: "green", FontStyle: "modern"},
			Sections: []finance.StorefrontSection{{
				ID: "banner", Type: "hero", Enabled: true, Content: map[string]any{"heading": heading},
			}},
			ExpectedVersion: version, IdempotencyKey: key,
		})
		require.NoError(t, err)
		return saved
	}

	essential := save("simple", "Live shop", "save-essential", design.Version)
	published, err := svc.PublishStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{
		ExpectedVersion: essential.Version, IdempotencyKey: "publish-essential",
	})
	require.NoError(t, err)
	studio := save("studio", "Studio campaign", "save-studio", published.Version)
	market := save("market", "Market promotion", "save-market", studio.Version)
	market = save("market", "Updated Market promotion", "save-market-edit", market.Version)

	var snapshots map[string]struct {
		Sections []finance.StorefrontSection `json:"sections"`
	}
	require.NoError(t, json.Unmarshal(market.ThemeDrafts, &snapshots))
	require.Len(t, snapshots["studio"].Sections, 1)
	require.Len(t, snapshots["market"].Sections, 1)
	require.Equal(t, "Studio campaign", snapshots["studio"].Sections[0].Content["heading"])
	require.Equal(t, "Updated Market promotion", snapshots["market"].Sections[0].Content["heading"])

	public, err := svc.GetPublicStorefrontProjection(ctx, "premium-draft-shop", false, "", "")
	require.NoError(t, err)
	payload, err := json.Marshal(public)
	require.NoError(t, err)
	require.Contains(t, string(payload), "Live shop")
	require.NotContains(t, string(payload), "Studio campaign")
	require.NotContains(t, string(payload), "Market promotion")

	_, err = svc.PublishStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{
		ExpectedVersion: market.Version, IdempotencyKey: "publish-unowned-market",
	})
	require.ErrorIs(t, err, finance.ErrStorefrontThemePurchaseRequired)

	subject, _, err := svc.ResolveSubjectForWorkspace(ctx, ws)
	require.NoError(t, err)
	for _, theme := range []string{"studio", "market"} {
		var planID, transactionID int64
		err = pool.QueryRow(ctx, `INSERT INTO plan_versions
			(plan_code, version, display_name, subject_type, billing_interval, price_minor, is_addon, addon_type)
			VALUES ($1, 1, $1, 'business', 'once', 10000, true, $1) RETURNING id`, "storefront_theme_"+theme).Scan(&planID)
		require.NoError(t, err)
		err = pool.QueryRow(ctx, `INSERT INTO billing_transactions
			(billing_subject_id, tx_type, amount_minor, status, idempotency_key)
			VALUES ($1, 'addon', 10000, 'succeeded', $2) RETURNING id`, subject.ID, "fixture-"+theme).Scan(&transactionID)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `INSERT INTO storefront_theme_purchases
			(workspace_id, storefront_id, theme_key, plan_version_id, billing_transaction_id)
			VALUES ($1, $2, $3, $4, $5)`, ws, store.ID, theme, planID, transactionID)
		require.NoError(t, err)
	}

	_, err = svc.PublishStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{
		ExpectedVersion: market.Version, IdempotencyKey: "publish-owned-market",
	})
	require.NoError(t, err)
	public, err = svc.GetPublicStorefrontProjection(ctx, "premium-draft-shop", false, "", "")
	require.NoError(t, err)
	require.Equal(t, "market", public.ThemeKey)
	require.NotEmpty(t, public.Sections)
	require.Equal(t, "Updated Market promotion", public.Sections[0].Content["heading"])

	item, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name: "Design consultation", Kind: "service", UnitName: "session",
		SellingPrice: "5000", Currency: "NGN", IdempotencyKey: "premium-product",
	})
	require.NoError(t, err)
	variants, err := svc.ListProductVariants(ctx, ws, item.ID)
	require.NoError(t, err)
	require.NotEmpty(t, variants)
	product, err := svc.UpsertStorefrontProduct(ctx, ws, variants[0].ID, finance.PublishCatalogueVariantInput{
		IsPublished: true, PublicTitle: "Design consultation", AvailabilityPolicy: "in_out_stock",
	})
	require.NoError(t, err)
	lines := []finance.CartLineInput{{StorefrontProductID: product.ID, Quantity: "1", ExpectedPriceMinor: "500000"}}
	_, err = svc.UpdateStorefrontSettings(ctx, ws, finance.UpdateStorefrontSettingsInput{
		ContactPhone: "+2348099990000", ContactEmail: "themes@example.com", DeliveryMethods: []string{"pickup", "merchant_delivery"},
	})
	require.NoError(t, err)
	_, err = svc.SavePayoutAccount(ctx, ws, finance.SavePayoutAccountInput{
		Provider: "paystack", BankCode: "058", AccountNumber: "0123456789", AccountName: "Themes Test Shop",
	})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontPaymentSettings(ctx, ws, finance.UpdateStorefrontPaymentSettingsInput{
		PaymentBankTransferEnabled: sfBoolPtr(true), PaymentCodEnabled: sfBoolPtr(true),
	})
	require.NoError(t, err)
	gin.SetMode(gin.TestMode)
	gateway := gin.New()
	finance.NewHandler(svc, nil).RegisterRoutes(gateway.Group("/api/v1"))
	submitOrder := func(theme, cartToken string) {
		t.Helper()
		input := finance.GuestCheckoutInput{
			ClientKey: "theme-" + theme, CartToken: cartToken, Lines: lines, CustomerName: "Demo shopper",
			CustomerPhone: "+2348012345678", CustomerEmail: "shopper@example.com",
			DeliveryMethod: "pickup", PickupPointID: outlet.ID, PaymentMethod: "virtual_account",
			PolicyAcknowledged: true, IdempotencyKey: "premium-checkout-" + theme,
		}
		started := time.Now()
		checkout, err := svc.SubmitGuestCheckout(ctx, "premium-draft-shop", false, input)
		require.NoError(t, err)
		require.Equal(t, "500000", checkout.TotalMinor)
		require.NotNil(t, checkout.HoldType)
		require.Equal(t, "payment", *checkout.HoldType)
		require.NotNil(t, checkout.HoldExpiresAt)
		expires, err := time.Parse(time.RFC3339, *checkout.HoldExpiresAt)
		require.NoError(t, err)
		require.WithinDuration(t, started.Add(15*time.Minute), expires, 10*time.Second)
		require.NotNil(t, checkout.PickupCode)
		require.Len(t, *checkout.PickupCode, 6)
		require.NotEmpty(t, checkout.StatusToken)
		var orderID, amount int64
		var reference string
		require.NoError(t, pool.QueryRow(ctx, `SELECT o.id, a.reference, a.amount_minor
			FROM storefront_orders o JOIN storefront_payment_attempts a ON a.order_id = o.id
			WHERE o.workspace_id = $1 AND o.order_reference = $2`, ws, checkout.OrderReference).Scan(&orderID, &reference, &amount))
		payload := []byte(fmt.Sprintf(`{"event":"charge.success","data":{"reference":%q,"amount":%d,"fees":0,"status":"success"}}`, reference, amount))
		var saleID int64
		for range [2]struct{}{} {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(payload))
			req.Header.Set("x-paystack-signature", signMockWebhook(payload))
			response := httptest.NewRecorder()
			gateway.ServeHTTP(response, req)
			require.Equal(t, http.StatusOK, response.Code, response.Body.String())
			paid, err := svc.GetMerchantOrder(ctx, ws, orderID)
			require.NoError(t, err)
			require.Equal(t, "paid", paid.PaymentStatus)
			require.NotNil(t, paid.LinkedSaleID)
			if saleID == 0 {
				saleID = *paid.LinkedSaleID
			}
			require.Equal(t, saleID, *paid.LinkedSaleID)
		}
		status, err := svc.GetPublicOrderStatus(ctx, checkout.StatusToken)
		require.NoError(t, err)
		require.Equal(t, checkout.OrderReference, status.OrderReference)
		require.Equal(t, checkout.TotalMinor, status.TotalMinor)
		input.CartToken = ""
		input.IdempotencyKey = "premium-pod-" + theme
		input.DeliveryMethod = "merchant_delivery"
		input.DeliveryAddress = "1 Test Road, Lagos"
		input.PickupPointID = 0
		input.PaymentMethod = "cod"
		pod, err := svc.SubmitGuestCheckout(ctx, "premium-draft-shop", false, input)
		require.NoError(t, err)
		require.Equal(t, "request_received", pod.CommercialStatus)
		require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM storefront_orders WHERE workspace_id = $1 AND order_reference = $2`, ws, pod.OrderReference).Scan(&orderID))
		order, err := svc.GetMerchantOrder(ctx, ws, orderID)
		require.NoError(t, err)
		confirmed, err := svc.ConfirmStorefrontOrder(ctx, ws, user, orderID, finance.ConfirmOrderInput{ExpectedVersion: order.Version, OutletID: outlet.ID})
		require.NoError(t, err)
		require.Equal(t, "confirmed", confirmed.CommercialStatus)
	}
	submitOrder("market", "")
	cart, err := svc.UpsertVisitorCart(ctx, "premium-draft-shop", "", lines, "pickup")
	require.NoError(t, err)
	require.NotEmpty(t, cart.CartToken)

	design, err = svc.GetStorefrontDesign(ctx, ws)
	require.NoError(t, err)
	studio = save("studio", "Studio campaign", "reopen-studio", design.Version)
	_, err = svc.PublishStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{
		ExpectedVersion: studio.Version, IdempotencyKey: "publish-owned-studio",
	})
	require.NoError(t, err)
	public, err = svc.GetPublicStorefrontProjection(ctx, "premium-draft-shop", false, "", "")
	require.NoError(t, err)
	require.Equal(t, "studio", public.ThemeKey)
	require.NotEmpty(t, public.Sections)
	require.Equal(t, "Studio campaign", public.Sections[0].Content["heading"])
	restored, err := svc.GetVisitorCart(ctx, "premium-draft-shop", cart.CartToken, "pickup")
	require.NoError(t, err)
	require.Equal(t, cart.EstimatedTotal, restored.EstimatedTotal)
	submitOrder("studio", restored.CartToken)

	design, err = svc.GetStorefrontDesign(ctx, ws)
	require.NoError(t, err)
	essential = save("simple", "Live shop", "reopen-essential", design.Version)
	_, err = svc.PublishStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{ExpectedVersion: essential.Version, IdempotencyKey: "republish-essential"})
	require.NoError(t, err)
	public, err = svc.GetPublicStorefrontProjection(ctx, "premium-draft-shop", false, "", "")
	require.NoError(t, err)
	require.Equal(t, "simple", public.ThemeKey)
	submitOrder("simple", "")
}
