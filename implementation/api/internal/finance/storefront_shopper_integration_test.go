package finance_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/crypto"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/rekordly/rekordly-api/internal/notify"
	"github.com/stretchr/testify/require"
)

type spyEmailProvider struct {
	mu   sync.Mutex
	sent []notify.SendEmailRequest
}

func (s *spyEmailProvider) Name() string       { return "spy" }
func (s *spyEmailProvider) IsConfigured() bool { return true }
func (s *spyEmailProvider) SendEmail(ctx context.Context, req notify.SendEmailRequest) (notify.SendEmailResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sent = append(s.sent, req)
	return notify.SendEmailResult{}, nil
}
func (s *spyEmailProvider) GetEmailStatus(ctx context.Context, providerMessageID string) (string, error) {
	return "delivered", nil
}
func (s *spyEmailProvider) VerifyWebhookSignature(rawBody []byte, signatureHeader string) bool {
	return true
}

func (s *spyEmailProvider) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.sent)
}

func (s *spyEmailProvider) last() notify.SendEmailRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sent[len(s.sent)-1]
}

func TestShopperIdentityTrackingSecurityAndIsolation(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	wsA, userA := createTestWorkspace(t, pool, "sf-shop-a")
	wsB, userB := createTestWorkspace(t, pool, "sf-shop-b")

	mailer := &spyEmailProvider{}
	svc := finance.NewService(
		pool,
		finance.WithStorefrontPaymentProvider(&mockPaymentProvider{key: "paystack"}),
		finance.WithEmailProvider(mailer, "http://localhost:3000/share"),
	)

	router := gin.New()
	handler := finance.NewHandler(svc, nil)
	v1 := router.Group("/api/v1")
	handler.RegisterPublicStorefrontRoutes(v1)

	setupStore := func(ws, user int64, prefix, name string) (string, int64) {
		outlet, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
			Name: name + " Main", LocationType: "outlet", IsDefault: true, IsPickupPoint: true,
		})
		require.NoError(t, err)
		item, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
			Name: name + " Tee", Kind: "stock_tracked", SellingPrice: "45", Currency: "NGN", IdempotencyKey: prefix + "-it",
		})
		require.NoError(t, err)
		vars, err := svc.ListProductVariants(ctx, ws, item.ID)
		require.NoError(t, err)
		_, err = svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{
			ProductID: item.ID, LocationID: outlet.ID, EffectiveOn: "2026-11-11",
			Quantity: "10", UnitCost: "20", Currency: "NGN", Reason: "init", IdempotencyKey: prefix + "-op",
		})
		require.NoError(t, err)
		slug := fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano()%1000000)
		_, err = svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
			Name: name, Slug: slug, DefaultOutletID: &outlet.ID, Currency: "NGN",
		})
		require.NoError(t, err)
		_, err = svc.UpdateStorefrontSettings(ctx, ws, finance.UpdateStorefrontSettingsInput{
			ContactPhone:    "+2348001110000",
			DeliveryMethods: []string{"pickup", "merchant_delivery"},
		})
		require.NoError(t, err)
		_, err = svc.UpdateStorefrontPaymentSettings(ctx, ws, finance.UpdateStorefrontPaymentSettingsInput{
			PaymentCodEnabled: sfBoolPtr(true),
		})
		require.NoError(t, err)
		sfProd, err := svc.UpsertStorefrontProduct(ctx, ws, vars[0].ID, finance.PublishCatalogueVariantInput{IsPublished: true})
		require.NoError(t, err)
		_, err = svc.PublishStorefront(ctx, ws, true)
		require.NoError(t, err)
		return slug, sfProd.ID
	}

	slugA, prodA := setupStore(wsA, userA, "store-a", "Store Alpha")
	slugB, prodB := setupStore(wsB, userB, "store-b", "Store Beta")

	shopperEmail := fmt.Sprintf("ada.%d@example.com", time.Now().UnixNano()%100000)
	otherEmail := fmt.Sprintf("other.%d@example.com", time.Now().UnixNano()%100000)

	// Place guest orders for Ada in Store Alpha & Store Beta, and for Other in Store Beta
	confA, err := svc.SubmitGuestCheckout(ctx, slugA, false, finance.GuestCheckoutInput{
		ClientKey: "ip-1", CustomerName: "Ada Obi", CustomerPhone: "+2348099991234", CustomerEmail: shopperEmail,
		DeliveryMethod: "pickup", PaymentMethod: "cod", PolicyAcknowledged: true,
		IdempotencyKey: fmt.Sprintf("ord-a-%d", time.Now().UnixNano()),
		Lines:          []finance.CartLineInput{{StorefrontProductID: prodA, Quantity: "1"}},
	})
	require.NoError(t, err)
	_, err = svc.SubmitGuestCheckout(ctx, slugB, false, finance.GuestCheckoutInput{
		ClientKey: "ip-1", CustomerName: "Ada Obi", CustomerPhone: "+2348099991234", CustomerEmail: shopperEmail,
		DeliveryMethod: "pickup", PaymentMethod: "cod", PolicyAcknowledged: true,
		IdempotencyKey: fmt.Sprintf("ord-b-%d", time.Now().UnixNano()),
		Lines:          []finance.CartLineInput{{StorefrontProductID: prodB, Quantity: "1"}},
	})
	require.NoError(t, err)
	_, err = svc.SubmitGuestCheckout(ctx, slugB, false, finance.GuestCheckoutInput{
		ClientKey: "ip-2", CustomerName: "Other Buyer", CustomerPhone: "+2348011119999", CustomerEmail: otherEmail,
		DeliveryMethod: "pickup", PaymentMethod: "cod", PolicyAcknowledged: true,
		IdempotencyKey: fmt.Sprintf("ord-o-%d", time.Now().UnixNano()),
		Lines:          []finance.CartLineInput{{StorefrontProductID: prodB, Quantity: "1"}},
	})
	require.NoError(t, err)

	// Public order status masks phone and contains no full phone leak
	pubStatus, err := svc.GetPublicOrderStatus(ctx, confA.StatusToken)
	require.NoError(t, err)
	require.NotNil(t, pubStatus.CustomerPhoneMasked)
	require.NotEqual(t, "+2348099991234", *pubStatus.CustomerPhoneMasked)
	require.True(t, strings.HasSuffix(*pubStatus.CustomerPhoneMasked, "1234"))

	// 1. Unknown email gets exact same message as known email (no enumeration) & sends zero email
	nSeed := time.Now().UnixNano()
	testRemoteAddr := fmt.Sprintf("198.51.%d.%d:4123", (nSeed>>8)%200+10, nSeed%200+10)
	postJSON := func(path string, payload any, cookies ...*http.Cookie) *httptest.ResponseRecorder {
		raw, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
		req.RemoteAddr = testRemoteAddr
		req.Header.Set("Content-Type", "application/json")
		for _, ck := range cookies {
			req.AddCookie(ck)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}

	wUnknown := postJSON("/api/v1/public/shopper/code", map[string]any{"email": "nobody@unknown.example.com"})
	require.Equal(t, http.StatusOK, wUnknown.Code)
	require.Equal(t, 0, mailer.count(), "unknown email must not send email")

	wKnown := postJSON("/api/v1/public/shopper/code", map[string]any{"email": shopperEmail, "store_slug": slugA})
	require.Equal(t, http.StatusOK, wKnown.Code)
	require.JSONEq(t, wUnknown.Body.String(), wKnown.Body.String(), "known and unknown email responses must match identically")
	require.Equal(t, 1, mailer.count())

	sentMail := mailer.last()
	otpMatch := regexp.MustCompile(`\b(\d{6})\b`).FindStringSubmatch(sentMail.TextBody)
	require.Len(t, otpMatch, 2)
	validOTP := otpMatch[1]
	require.Contains(t, sentMail.TextBody, "/orders?token=")
	require.NotContains(t, sentMail.TextBody, url.QueryEscape(shopperEmail), "sign-in URL must contain no PII")

	// 2. 5 wrong attempts lock the code permanently
	for i := 0; i < 5; i++ {
		wWrong := postJSON("/api/v1/public/shopper/verify", map[string]any{"email": shopperEmail, "code": "000000"})
		require.Equal(t, http.StatusUnauthorized, wWrong.Code)
	}
	wLocked := postJSON("/api/v1/public/shopper/verify", map[string]any{"email": shopperEmail, "code": validOTP})
	require.Equal(t, http.StatusUnauthorized, wLocked.Code, "locked code must reject even real OTP")

	// 3. Expired code rejected
	wReq2 := postJSON("/api/v1/public/shopper/code", map[string]any{"email": shopperEmail})
	require.Equal(t, http.StatusOK, wReq2.Code)
	otp2 := regexp.MustCompile(`\b(\d{6})\b`).FindStringSubmatch(mailer.last().TextBody)[1]
	_, err = pool.Exec(ctx, `UPDATE shopper_login_codes SET expires_at = now() - interval '1 minute' WHERE lower(btrim(shopper_email)) = $1`, strings.ToLower(shopperEmail))
	require.NoError(t, err)
	wExp := postJSON("/api/v1/public/shopper/verify", map[string]any{"email": shopperEmail, "code": otp2})
	require.Equal(t, http.StatusUnauthorized, wExp.Code)

	// 4. Fresh code -> verify with 6-digit OTP succeeds, and fresh link token succeeds once then cannot replay
	wReqOtp := postJSON("/api/v1/public/shopper/code", map[string]any{"email": shopperEmail})
	require.Equal(t, http.StatusOK, wReqOtp.Code)
	validOTP3 := regexp.MustCompile(`\b(\d{6})\b`).FindStringSubmatch(mailer.last().TextBody)[1]
	wOtpOK := postJSON("/api/v1/public/shopper/verify", map[string]any{"email": shopperEmail, "code": validOTP3})
	require.Equal(t, http.StatusOK, wOtpOK.Code)

	wReq3 := postJSON("/api/v1/public/shopper/code", map[string]any{"email": shopperEmail, "store_slug": slugA})
	require.Equal(t, http.StatusOK, wReq3.Code)
	linkMail := mailer.last().TextBody
	tokMatch := regexp.MustCompile(`\?token=([a-f0-9]+)`).FindStringSubmatch(linkMail)
	require.Len(t, tokMatch, 2)
	linkToken := tokMatch[1]

	wVerify := postJSON("/api/v1/public/shopper/verify", map[string]any{"token": linkToken})
	require.Equal(t, http.StatusOK, wVerify.Code)
	wReplayLink := postJSON("/api/v1/public/shopper/verify", map[string]any{"token": linkToken})
	require.Equal(t, http.StatusUnauthorized, wReplayLink.Code, "used sign-in link token must not replay")
	for _, ck := range wVerify.Result().Cookies() {
		require.NotEqual(t, "rekordly_shopper_session", ck.Name, "Go API must never set rekordly_shopper_session cookie on API domain")
	}
	var verifyWrap struct {
		Data struct {
			Shopper      finance.ShopperProfileView `json:"shopper"`
			SessionToken string                     `json:"session_token"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wVerify.Body.Bytes(), &verifyWrap))
	sessionToken := strings.TrimSpace(verifyWrap.Data.SessionToken)
	require.NotEmpty(t, sessionToken, "verify must return session_token in JSON for Next.js proxy")

	// Direct browser Cookie header to Go API (without X-Shopper-Session-Token) must be rejected with 401
	reqCookieOnly := httptest.NewRequest(http.MethodGet, "/api/v1/public/shopper/me", nil)
	reqCookieOnly.AddCookie(&http.Cookie{Name: "rekordly_shopper_session", Value: sessionToken})
	wCookieOnly := httptest.NewRecorder()
	router.ServeHTTP(wCookieOnly, reqCookieOnly)
	require.Equal(t, http.StatusUnauthorized, wCookieOnly.Code, "API-domain cookie without X-Shopper-Session-Token header must not authenticate")

	reqOrdersCookieOnly := httptest.NewRequest(http.MethodGet, "/api/v1/public/shopper/orders", nil)
	reqOrdersCookieOnly.AddCookie(&http.Cookie{Name: "rekordly_shopper_session", Value: sessionToken})
	wOrdersCookieOnly := httptest.NewRecorder()
	router.ServeHTTP(wOrdersCookieOnly, reqOrdersCookieOnly)
	require.Equal(t, http.StatusUnauthorized, wOrdersCookieOnly.Code, "orders endpoint must reject API-domain cookie without X-Shopper-Session-Token header")

	// 5. All stores vs ?store=slug scoping via X-Shopper-Session-Token header; zero cross-shopper leak
	getWithSessionHeader := func(path string, tok string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if tok != "" {
			req.Header.Set(finance.ShopperSessionHeader, tok)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	postJSONWithSessionHeader := func(path string, payload any, tok string) *httptest.ResponseRecorder {
		raw, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
		req.RemoteAddr = testRemoteAddr
		req.Header.Set("Content-Type", "application/json")
		if tok != "" {
			req.Header.Set(finance.ShopperSessionHeader, tok)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}

	wAll := getWithSessionHeader("/api/v1/public/shopper/orders", sessionToken)
	require.Equal(t, http.StatusOK, wAll.Code)
	var allWrap struct {
		Data struct {
			Orders []finance.ShopperOrderSummaryView `json:"orders"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wAll.Body.Bytes(), &allWrap))
	require.Len(t, allWrap.Data.Orders, 2, "must return Ada's orders across both Store Alpha and Store Beta, excluding Other")
	for _, o := range allWrap.Data.Orders {
		require.True(t, strings.HasPrefix(o.OrderURL, "/orders/status/"))
		require.NotContains(t, o.OrderURL, shopperEmail)
	}

	wScoped := getWithSessionHeader("/api/v1/public/shopper/orders?store="+url.QueryEscape(slugA), sessionToken)
	require.Equal(t, http.StatusOK, wScoped.Code)
	var scopedWrap struct {
		Data struct {
			Orders []finance.ShopperOrderSummaryView `json:"orders"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wScoped.Body.Bytes(), &scopedWrap))
	require.Len(t, scopedWrap.Data.Orders, 1)
	require.Equal(t, slugA, scopedWrap.Data.Orders[0].StorefrontSlug)

	// 6. Checkout with X-Shopper-Session-Token + save_details updates saved_addresses for prefill
	wCheckout := postJSONWithSessionHeader("/api/v1/public/storefronts/"+slugA+"/checkout", map[string]any{
		"customer_name":       "Ada Obi",
		"customer_phone":      "+2348099991234",
		"customer_email":      shopperEmail,
		"delivery_method":     "merchant_delivery",
		"delivery_address":    "42 Bourdillon Road, Ikoyi, Lagos",
		"payment_method":      "cod",
		"save_details":        true,
		"policy_acknowledged": true,
		"idempotency_key":     fmt.Sprintf("shop-chk-%d", time.Now().UnixNano()),
		"lines":               []map[string]any{{"storefront_product_id": prodA, "quantity": "1"}},
	}, sessionToken)
	require.Equal(t, http.StatusCreated, wCheckout.Code)

	wMe := getWithSessionHeader("/api/v1/public/shopper/me", sessionToken)
	require.Equal(t, http.StatusOK, wMe.Code)
	var meWrap struct {
		Data struct {
			Shopper finance.ShopperProfileView `json:"shopper"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wMe.Body.Bytes(), &meWrap))
	require.Contains(t, meWrap.Data.Shopper.SavedAddresses, "42 Bourdillon Road, Ikoyi, Lagos")

	// 7. Logout invalidates session
	wOut := postJSONWithSessionHeader("/api/v1/public/shopper/logout", map[string]any{}, sessionToken)
	require.Equal(t, http.StatusOK, wOut.Code)
	wAfterOut := getWithSessionHeader("/api/v1/public/shopper/orders", sessionToken)
	require.Equal(t, http.StatusUnauthorized, wAfterOut.Code)

	// 8. Workspace isolation & secret masking verification
	merchantOrdsA, err := svc.ListMerchantOrders(ctx, wsA, "", 0)
	require.NoError(t, err)
	require.NotEmpty(t, merchantOrdsA)
	_, err = svc.GetMerchantOrder(ctx, wsB, merchantOrdsA[0].ID)
	require.ErrorIs(t, err, finance.ErrNotFound, "Store B must never read Store A's merchant order")

	sbSecret := "sb_secret_never_leak_5678"
	_, err = svc.UpdateStorefrontShipbubbleSettings(ctx, wsA, finance.UpdateStorefrontShipbubbleSettingsInput{APIKey: &sbSecret, Strategy: "cheapest"})
	require.NoError(t, err)
	sbJSON, _ := json.Marshal(func() any { v, _ := svc.GetStorefrontShipbubbleSettings(ctx, wsA); return v }())
	require.NotContains(t, string(sbJSON), sbSecret)

	// Subaccount_ref never exposed in payout view
	payView, err := svc.SavePayoutAccount(ctx, wsA, finance.SavePayoutAccountInput{
		Provider: "paystack", BankCode: "058", AccountNumber: "0123456789", AccountName: "ALPHA LTD",
	})
	require.NoError(t, err)
	pvJSON, _ := json.Marshal(payView)
	require.NotContains(t, string(pvJSON), "SUB_ACCT_MOCK_123")

	// 9. ReencryptSecrets upgrades legacy unprefixed ciphertexts in DB to v1:-prefixed ciphertexts
	// First ensure any rows from earlier tests in the shared test DB use LocalDevDefaultKey
	_, _ = finance.ReencryptSecrets(ctx, pool, crypto.LegacyDefaultKey, crypto.LocalDevDefaultKey)
	oldKey := crypto.LocalDevDefaultKey
	newKey := "rotated-dedicated-encryption-key-32-bytes!!"
	legacyEnc, err := crypto.EncryptSecret(sbSecret, oldKey)
	require.NoError(t, err)
	unprefixedHex := strings.TrimPrefix(legacyEnc, crypto.CiphertextVersionPrefix)
	_, err = pool.Exec(ctx, `UPDATE storefront_settings SET shipbubble_api_key = $2 WHERE workspace_id = $1`, wsA, unprefixedHex)
	require.NoError(t, err)

	updatedRows, err := finance.ReencryptSecrets(ctx, pool, oldKey, newKey)
	require.NoError(t, err)
	require.GreaterOrEqual(t, updatedRows, 1)

	var storedAfter string
	require.NoError(t, pool.QueryRow(ctx, `SELECT shipbubble_api_key FROM storefront_settings WHERE workspace_id = $1`, wsA).Scan(&storedAfter))
	require.True(t, strings.HasPrefix(storedAfter, "v1:"))
	decAfter, err := crypto.DecryptSecret(storedAfter, newKey)
	require.NoError(t, err)
	require.Equal(t, sbSecret, decAfter)
	// Restore test default key so subsequent tests in package continue cleanly
	_, err = finance.ReencryptSecrets(ctx, pool, newKey, crypto.LocalDevDefaultKey)
	require.NoError(t, err)
	require.NoError(t, crypto.SetKey(crypto.LocalDevDefaultKey))
}
