package finance_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/billing"
	"github.com/rekordly/rekordly-api/internal/crypto"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/rekordly/rekordly-api/internal/payments"
	"github.com/rekordly/rekordly-api/internal/shipping"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

type mockPaymentProvider struct {
	key string
}

func (m *mockPaymentProvider) Key() string {
	if m.key == "" {
		return "paystack"
	}
	return m.key
}

func (m *mockPaymentProvider) CreateSubaccount(ctx context.Context, account payments.MerchantPayoutAccount) (payments.SubaccountRef, error) {
	return payments.SubaccountRef{Code: "SUB_ACCT_MOCK_123"}, nil
}

func (m *mockPaymentProvider) ResolveBankAccount(ctx context.Context, bankCode, accountNumber string) (string, error) {
	return "KOLAWOLE TRADING VENTURES", nil
}

func (m *mockPaymentProvider) ListBanks(ctx context.Context) ([]payments.Bank, error) {
	return []payments.Bank{
		{Code: "058", Name: "Guaranty Trust Bank"},
		{Code: "011", Name: "First Bank of Nigeria"},
	}, nil
}

func (m *mockPaymentProvider) CreateOrderVirtualAccount(ctx context.Context, req payments.OrderPaymentRequest) (payments.VirtualAccount, error) {
	exp := req.ExpiresAt
	return payments.VirtualAccount{
		AccountNumber: "9988776655",
		BankName:      "Wema Bank",
		AccountName:   "REKORDLY / " + req.CustomerName,
		ExpiresAt:     &exp,
	}, nil
}

func (m *mockPaymentProvider) InitializeCardCheckout(ctx context.Context, req payments.OrderPaymentRequest) (payments.CheckoutURL, error) {
	return payments.CheckoutURL{
		AuthorizationURL: "https://checkout.paystack.com/access_mock",
		Reference:        req.Reference,
	}, nil
}

func (m *mockPaymentProvider) VerifyWebhook(rawBody []byte, headers http.Header) (payments.Event, error) {
	sig := headers.Get("x-paystack-signature")
	if sig == "" {
		sig = headers.Get("x-squad-signature")
	}
	mac := hmac.New(sha512.New, []byte("mock-webhook-secret"))
	mac.Write(rawBody)
	expectedSig := hex.EncodeToString(mac.Sum(nil))
	if sig != expectedSig {
		return payments.Event{}, payments.ErrInvalidWebhookSig
	}

	var payload struct {
		Event string `json:"event"`
		Data  struct {
			Reference string `json:"reference"`
			Amount    int64  `json:"amount"`
			Fees      int64  `json:"fees"`
			Status    string `json:"status"`
		} `json:"data"`
	}
	_ = json.Unmarshal(rawBody, &payload)

	status := "paid"
	if payload.Data.Status == "failed" || payload.Event == "bank.transfer.rejected" {
		status = "failed"
	}

	return payments.Event{
		Provider:    m.Key(),
		Type:        payload.Event,
		Reference:   payload.Data.Reference,
		AmountMinor: payload.Data.Amount,
		FeeMinor:    payload.Data.Fees,
		PaidAt:      time.Now().UTC(),
		Status:      status,
		Raw:         rawBody,
	}, nil
}

func (m *mockPaymentProvider) VerifyTransaction(ctx context.Context, reference string) (payments.PaymentResult, error) {
	return payments.PaymentResult{
		Reference:   reference,
		Status:      "paid",
		AmountMinor: 1000000,
		PaidAt:      time.Now().UTC(),
	}, nil
}

func signMockWebhook(body []byte) string {
	mac := hmac.New(sha512.New, []byte("mock-webhook-secret"))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func TestStorefrontPaymentProviderAndSettings(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "sf-payments-settings")

	mockProv := &mockPaymentProvider{key: "paystack"}
	svc := finance.NewService(pool, finance.WithStorefrontPaymentProvider(mockProv))

	// Create storefront
	_, err := svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name:     "Kola Store",
		Slug:     "kola-store-pay",
		Currency: "NGN",
	})
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	h := finance.NewHandler(svc, nil)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(finance.ContextWorkspaceKey, finance.WorkspaceContext{
			WorkspaceID: ws,
			UserID:      user,
			Kind:        "business",
			Permissions: []string{"storefront.manage_checkout", "storefront.view"},
		})
		c.Next()
	})
	h.RegisterStorefrontRoutes(r.Group("/api/v1"))

	// 1. List Banks
	req := httptest.NewRequest(http.MethodGet, "/api/v1/storefront/payments/banks?provider=paystack", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var banksResp struct {
		Data struct {
			Banks []payments.Bank `json:"banks"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &banksResp))
	require.Len(t, banksResp.Data.Banks, 2)
	require.Equal(t, "058", banksResp.Data.Banks[0].Code)

	// 2. Resolve Bank Account
	resolveBody, _ := json.Marshal(map[string]any{
		"provider":       "paystack",
		"bank_code":      "058",
		"account_number": "0123456789",
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/storefront/payments/resolve-account", bytes.NewReader(resolveBody))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var resolveResp struct {
		Data struct {
			AccountName string `json:"account_name"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resolveResp))
	require.Equal(t, "KOLAWOLE TRADING VENTURES", resolveResp.Data.AccountName)

	// 3. Save Payout Account
	saveBody, _ := json.Marshal(map[string]any{
		"provider":       "paystack",
		"bank_code":      "058",
		"account_number": "0123456789",
		"account_name":   "KOLAWOLE TRADING VENTURES",
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/storefront/payments/payout-account", bytes.NewReader(saveBody))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var payoutResp struct {
		Data struct {
			PayoutAccount finance.MerchantPayoutAccountView `json:"payout_account"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payoutResp))
	require.Equal(t, "6789", payoutResp.Data.PayoutAccount.AccountNumberLast4)
	require.Equal(t, "active", payoutResp.Data.PayoutAccount.Status)

	// Check encrypted subaccount_ref at rest
	var encRef string
	err = pool.QueryRow(ctx, "SELECT subaccount_ref FROM merchant_payout_accounts WHERE workspace_id = $1", ws).Scan(&encRef)
	require.NoError(t, err)
	require.NotEqual(t, "SUB_ACCT_MOCK_123", encRef, "subaccount_ref must be encrypted at rest")
	decRef, err := crypto.Decrypt(encRef)
	require.NoError(t, err)
	require.Equal(t, "SUB_ACCT_MOCK_123", decRef)

	// 4. Update Payment Settings
	trueVal := true
	falseVal := false
	bearerCustomer := "customer"
	patchBody, _ := json.Marshal(finance.UpdateStorefrontPaymentSettingsInput{
		PaymentBankTransferEnabled:   &trueVal,
		PaymentCardEnabled:           &falseVal,
		PaymentManualTransferEnabled: &trueVal,
		PaymentCodEnabled:            &falseVal,
		FeeBearer:                    &bearerCustomer,
	})
	req = httptest.NewRequest(http.MethodPatch, "/api/v1/storefront/payments/settings", bytes.NewReader(patchBody))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// 5. Get Settings
	req = httptest.NewRequest(http.MethodGet, "/api/v1/storefront/payments", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var settingsResp struct {
		Data finance.StorefrontPaymentSettingsView `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &settingsResp))
	require.True(t, settingsResp.Data.PaymentBankTransferEnabled)
	require.False(t, settingsResp.Data.PaymentCardEnabled)
	require.Equal(t, "customer", settingsResp.Data.FeeBearer)
	require.NotNil(t, settingsResp.Data.PayoutAccount)
	require.Equal(t, "6789", settingsResp.Data.PayoutAccount.AccountNumberLast4)
}

func TestStorefrontPaymentWebhookAndOrderPaidLedgerPosting(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "sf-webhook-paid")

	mockProv := &mockPaymentProvider{key: "paystack"}
	svc := finance.NewService(pool, finance.WithStorefrontPaymentProvider(mockProv))

	sf, err := svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name:     "Pay Store",
		Slug:     "pay-store-1",
		Currency: "NGN",
	})
	require.NoError(t, err)

	// Create an outlet
	var outletID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO inventory_locations (workspace_id, name, location_type, is_default, is_active)
		VALUES ($1, 'Main Store Outlet', 'outlet', true, true)
		RETURNING id
	`, ws).Scan(&outletID)
	require.NoError(t, err)

	// Create a product & inventory balance
	var prodID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO products (workspace_id, name, kind, status, idempotency_key)
		VALUES ($1, 'Test Shoes', 'stock_tracked', 'active', 'test-shoes-prod-001')
		RETURNING id
	`, ws).Scan(&prodID)
	require.NoError(t, err)

	var variantID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO product_variants (workspace_id, product_id, name, is_default, currency, currency_exponent, selling_price_minor)
		VALUES ($1, $2, 'Standard', true, 'NGN', 2, 1000000)
		RETURNING id
	`, ws, prodID).Scan(&variantID)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		INSERT INTO inventory_balances (workspace_id, location_id, product_id, variant_id, quantity_on_hand, reserved_quantity, value_on_hand_minor)
		VALUES ($1, $2, $3, $4, 10, 0, 5000000)
	`, ws, outletID, prodID, variantID)
	require.NoError(t, err)

	// Create an order
	orderRef := "ORD-TEST-001"
	var orderID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO storefront_orders (
			workspace_id, storefront_id, order_reference, public_token_hash, outlet_id,
			commercial_status, fulfilment_status, payment_status, currency, currency_exponent,
			subtotal_minor, tax_minor, delivery_fee_minor, total_minor, delivery_method,
			customer_name, customer_email, idempotency_key, reservation_expires_at
		) VALUES (
			$1, $2, $3, 'tokhash-001', $4,
			'confirmed', 'reserved', 'unpaid', 'NGN', 2,
			1000000, 75000, 200000, 1275000, 'merchant_delivery',
			'Emeka Customer', 'emeka@example.com', 'idemp-ord-001', now() + interval '15 minutes'
		) RETURNING id
	`, ws, sf.ID, orderRef, outletID).Scan(&orderID)
	require.NoError(t, err)

	// Order line
	var lineID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO storefront_order_lines (
			workspace_id, order_id, product_id, variant_id, product_kind,
			title_snapshot, unit_name, requested_quantity, confirmed_quantity, unit_price_minor, line_total_minor
		) VALUES (
			$1, $2, $3, $4, 'stock_tracked',
			'Test Shoes', 'pair', 1, 1, 1000000, 1000000
		) RETURNING id
	`, ws, orderID, prodID, variantID).Scan(&lineID)
	require.NoError(t, err)

	// Create Stock Reservation
	_, err = pool.Exec(ctx, `
		INSERT INTO stock_reservations (
			workspace_id, location_id, product_id, variant_id, order_id,
			quantity, status, expires_at, idempotency_key
		) VALUES (
			$1, $2, $3, $4, $5, 1, 'active', now() + interval '15 minutes', 'res-001'
		)
	`, ws, outletID, prodID, variantID, orderID)
	require.NoError(t, err)

	// Create Payment Attempt
	attemptRef := fmt.Sprintf("ref_attempt_%d", time.Now().UnixNano())
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, "DELETE FROM payment_webhook_events WHERE event_id = $1", attemptRef)
	})
	q := db.New(pool)
	attempt, err := q.CreateStorefrontPaymentAttempt(ctx, db.CreateStorefrontPaymentAttemptParams{
		WorkspaceID:          ws,
		OrderID:              orderID,
		Provider:             "paystack",
		Method:               "virtual_account",
		Reference:            attemptRef,
		AmountMinor:          1275000,
		FeeMinor:             19125, // 1.5% fee
		CommissionMinor:      0,
		VirtualAccountNumber: pgtype.Text{String: "9988776655", Valid: true},
		BankName:             pgtype.Text{String: "Wema Bank", Valid: true},
		ExpiresAt:            pgtype.Timestamptz{Time: time.Now().UTC().Add(15 * time.Minute), Valid: true},
		Status:               "pending",
	})
	require.NoError(t, err)

	// Setup unified webhook router (Paystack unified on /webhooks/paystack, Squad on /webhooks/payments/squad)
	gin.SetMode(gin.TestMode)
	h := finance.NewHandler(svc, nil)
	r := gin.New()
	v1 := r.Group("/api/v1")
	h.RegisterBlueprint13Routes(v1, v1)
	h.RegisterStorefrontPaymentWebhookRoutes(v1)

	// Webhook Payload
	whPayload := map[string]any{
		"event": "charge.success",
		"data": map[string]any{
			"reference": attemptRef,
			"amount":    1275000,
			"fees":      19125,
			"status":    "success",
		},
	}
	bodyBytes, _ := json.Marshal(whPayload)
	sig := signMockWebhook(bodyBytes)

	// Old duplicate storefront Paystack URL must be removed (404)
	oldReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/paystack", bytes.NewReader(bodyBytes))
	oldReq.Header.Set("x-paystack-signature", sig)
	oldRec := httptest.NewRecorder()
	r.ServeHTTP(oldRec, oldReq)
	require.Equal(t, http.StatusNotFound, oldRec.Code)

	// 1. Send webhook with invalid signature -> 401
	badReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(bodyBytes))
	badReq.Header.Set("x-paystack-signature", "wrong_signature")
	badRec := httptest.NewRecorder()
	r.ServeHTTP(badRec, badReq)
	require.Equal(t, http.StatusUnauthorized, badRec.Code)

	// 2. Send valid webhook -> 200
	goodReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(bodyBytes))
	goodReq.Header.Set("x-paystack-signature", sig)
	goodRec := httptest.NewRecorder()
	r.ServeHTTP(goodRec, goodReq)
	require.Equal(t, http.StatusOK, goodRec.Code, goodRec.Body.String())

	// 3. Verify Order & Attempt state
	var orderStatus string
	var linkedSaleID *int64
	var resExp *time.Time
	err = pool.QueryRow(ctx, "SELECT payment_status, linked_sale_id, reservation_expires_at FROM storefront_orders WHERE id = $1", orderID).Scan(&orderStatus, &linkedSaleID, &resExp)
	require.NoError(t, err)
	require.Equal(t, "paid", orderStatus)
	require.NotNil(t, linkedSaleID)
	require.Nil(t, resExp, "hold must become firm (reservation_expires_at = null)")

	// Check reservation expires_at is cleared
	var rExp *time.Time
	err = pool.QueryRow(ctx, "SELECT expires_at FROM stock_reservations WHERE order_id = $1", orderID).Scan(&rExp)
	require.NoError(t, err)
	require.Nil(t, rExp, "stock reservation expires_at must be NULL for paid orders")

	// Verify Sale
	var saleSource string
	var saleTotal int64
	err = pool.QueryRow(ctx, "SELECT source, total_amount_minor FROM sales WHERE id = $1", *linkedSaleID).Scan(&saleSource, &saleTotal)
	require.NoError(t, err)
	require.Equal(t, "online_store", saleSource)
	require.Equal(t, int64(1275000), saleTotal)

	// 4. Assert BALANCED DOUBLE-ENTRY LEDGER
	var totalDebits, totalCredits int64
	err = pool.QueryRow(ctx, `
		SELECT COALESCE(sum(ll.debit_minor), 0), COALESCE(sum(ll.credit_minor), 0)
		FROM ledger_lines ll
		JOIN ledger_entries le ON le.id = ll.ledger_entry_id
		WHERE le.workspace_id = $1 AND le.source_type = 'sale' AND le.source_id = $2
	`, ws, *linkedSaleID).Scan(&totalDebits, &totalCredits)
	require.NoError(t, err)
	require.Equal(t, int64(1275000), totalDebits)
	require.Equal(t, int64(1275000), totalCredits)
	require.Equal(t, totalDebits, totalCredits, "every money write must balance the ledger")

	// 5. Idempotent webhook replay -> 200 without duplicate sale or ledger postings
	replayReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(bodyBytes))
	replayReq.Header.Set("x-paystack-signature", sig)
	replayRec := httptest.NewRecorder()
	r.ServeHTTP(replayRec, replayReq)
	require.Equal(t, http.StatusOK, replayRec.Code)

	var saleCount int
	err = pool.QueryRow(ctx, "SELECT count(*) FROM sales WHERE workspace_id = $1 AND storefront_order_id = $2", ws, orderID).Scan(&saleCount)
	require.NoError(t, err)
	require.Equal(t, 1, saleCount, "webhook replay must not create a duplicate Sale")

	// 6. Test Record Payout from Clearing to Bank
	var bankAccID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO money_accounts (workspace_id, name, account_type, currency)
		VALUES ($1, 'GTBank Current', 'bank', 'NGN')
		RETURNING id
	`, ws).Scan(&bankAccID)
	require.NoError(t, err)

	err = svc.RecordPayoutFromProvider(ctx, ws, finance.RecordPayoutInput{
		Provider:         "paystack",
		DestinationAccID: bankAccID,
		AmountMinor:      1000000,
		Reference:        "PAYOUT-001",
		IdempotencyKey:   "idemp-payout-001",
	})
	require.NoError(t, err)

	// Check payout transfer ledger balance
	var payoutDebits, payoutCredits int64
	err = pool.QueryRow(ctx, `
		SELECT COALESCE(sum(ll.debit_minor), 0), COALESCE(sum(ll.credit_minor), 0)
		FROM ledger_lines ll
		JOIN ledger_entries le ON le.id = ll.ledger_entry_id
		WHERE le.workspace_id = $1 AND le.source_type = 'money_transaction'
	`, ws).Scan(&payoutDebits, &payoutCredits)
	require.NoError(t, err)
	require.Equal(t, int64(1000000), payoutDebits)
	require.Equal(t, int64(1000000), payoutCredits)
	require.Equal(t, payoutDebits, payoutCredits, "payout transfer must balance the ledger")

	_ = attempt
}

func TestCheckoutStockHoldAndExpiry(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "sf-stock-hold-expiry")

	mockProv := &mockPaymentProvider{key: "paystack"}
	svc := finance.NewService(pool, finance.WithStorefrontPaymentProvider(mockProv))

	sf, err := svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name:     "Hold Store",
		Slug:     fmt.Sprintf("hold-store-%d", time.Now().UnixNano()%1000000),
		Currency: "NGN",
	})
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `UPDATE storefronts SET status = 'published' WHERE id = $1`, sf.ID)
	require.NoError(t, err)

	var outletID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO inventory_locations (workspace_id, name, location_type, is_default, is_active)
		VALUES ($1, 'Main Warehouse', 'outlet', true, true)
		RETURNING id
	`, ws).Scan(&outletID)
	require.NoError(t, err)

	// Set storefront default outlet
	_, err = pool.Exec(ctx, `UPDATE storefronts SET default_outlet_id = $2 WHERE id = $1`, sf.ID, outletID)
	require.NoError(t, err)

	// Connect payout account (encrypted at rest)
	encSub, err := crypto.Encrypt("SUB_HOLD_001")
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO merchant_payout_accounts (workspace_id, provider, bank_code, account_number_last4, account_name, subaccount_ref, status)
		VALUES ($1, 'paystack', '058', '1234', 'MOCK HOLD MERCHANT', $2, 'active')
	`, ws, encSub)
	require.NoError(t, err)

	// Create Product with 2 units on hand
	var prodID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO products (workspace_id, name, kind, status, show_on_store, idempotency_key)
		VALUES ($1, 'Limited Hoodie', 'stock_tracked', 'active', true, $2)
		RETURNING id
	`, ws, fmt.Sprintf("prod-hoodie-%d", time.Now().UnixNano())).Scan(&prodID)
	require.NoError(t, err)

	var variantID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO product_variants (workspace_id, product_id, name, is_default, currency, currency_exponent, selling_price_minor)
		VALUES ($1, $2, 'Black / L', true, 'NGN', 2, 2500000)
		RETURNING id
	`, ws, prodID).Scan(&variantID)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		INSERT INTO inventory_balances (workspace_id, location_id, product_id, variant_id, quantity_on_hand, reserved_quantity, value_on_hand_minor)
		VALUES ($1, $2, $3, $4, 2, 0, 3000000)
	`, ws, outletID, prodID, variantID)
	require.NoError(t, err)

	var sfProdID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO storefront_products (workspace_id, storefront_id, product_id, variant_id, is_published, position)
		VALUES ($1, $2, $3, $4, true, 1)
		ON CONFLICT (storefront_id, product_id, variant_id) DO UPDATE SET is_published = true
		RETURNING id
	`, ws, sf.ID, prodID, variantID).Scan(&sfProdID)
	require.NoError(t, err)

	// 1. First checkout for 1 unit -> succeeds, holds 1 unit
	conf1, err := svc.SubmitGuestCheckout(ctx, sf.Slug, false, finance.GuestCheckoutInput{
		ClientKey:          "client-01",
		CustomerName:       "Shopper One",
		CustomerPhone:      "+2348011223344",
		CustomerEmail:      "shopper1@example.com",
		DeliveryMethod:     "customer_arranged",
		PaymentMethod:      "virtual_account",
		PolicyAcknowledged: true,
		IdempotencyKey:     fmt.Sprintf("idemp-hold-01-%d", time.Now().UnixNano()),
		Lines: []finance.CartLineInput{
			{StorefrontProductID: sfProdID, Quantity: "1"},
		},
	})
	require.NoError(t, err)
	require.NotEmpty(t, conf1.OrderReference)
	require.NotNil(t, conf1.VirtualAccount)
	require.NotEmpty(t, conf1.VirtualAccount.AccountNumber)
	require.NotNil(t, conf1.HoldExpiresAt)
	require.Equal(t, "payment", *conf1.HoldType)

	// Verify balance: quantity_on_hand = 2, reserved_quantity = 1
	var qoh, qRes decimal.Decimal
	err = pool.QueryRow(ctx, `
		SELECT quantity_on_hand, reserved_quantity
		FROM inventory_balances
		WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4
	`, ws, outletID, prodID, variantID).Scan(&qoh, &qRes)
	require.NoError(t, err)
	require.True(t, decimal.NewFromInt(2).Equal(qoh))
	require.True(t, decimal.NewFromInt(1).Equal(qRes), "1 unit must be reserved")

	// 2. Try checkout for 2 units -> fails because only 1 unit is available
	_, err = svc.SubmitGuestCheckout(ctx, sf.Slug, false, finance.GuestCheckoutInput{
		ClientKey:          "client-02",
		CustomerName:       "Greedy Shopper",
		CustomerPhone:      "+2348011223344",
		CustomerEmail:      "greedy@example.com",
		DeliveryMethod:     "customer_arranged",
		PaymentMethod:      "virtual_account",
		PolicyAcknowledged: true,
		IdempotencyKey:     fmt.Sprintf("idemp-hold-02-%d", time.Now().UnixNano()),
		Lines: []finance.CartLineInput{
			{StorefrontProductID: sfProdID, Quantity: "2"},
		},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "only 1 left", "must return clear error when stock is insufficient")

	// 3. Second checkout for 1 unit -> succeeds, reserves second unit
	conf2, err := svc.SubmitGuestCheckout(ctx, sf.Slug, false, finance.GuestCheckoutInput{
		ClientKey:          "client-03",
		CustomerName:       "Shopper Two",
		CustomerPhone:      "+2348011223344",
		CustomerEmail:      "shopper2@example.com",
		DeliveryMethod:     "customer_arranged",
		PaymentMethod:      "virtual_account",
		PolicyAcknowledged: true,
		IdempotencyKey:     fmt.Sprintf("idemp-hold-03-%d", time.Now().UnixNano()),
		Lines: []finance.CartLineInput{
			{StorefrontProductID: sfProdID, Quantity: "1"},
		},
	})
	require.NoError(t, err)
	require.NotEmpty(t, conf2.OrderReference)

	// Check reserved_quantity is now 2
	err = pool.QueryRow(ctx, `
		SELECT reserved_quantity FROM inventory_balances
		WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4
	`, ws, outletID, prodID, variantID).Scan(&qRes)
	require.NoError(t, err)
	require.True(t, decimal.NewFromInt(2).Equal(qRes))

	// 4. Third checkout for 1 unit -> fails because sold out
	_, err = svc.SubmitGuestCheckout(ctx, sf.Slug, false, finance.GuestCheckoutInput{
		ClientKey:          "client-04",
		CustomerName:       "Late Shopper",
		CustomerPhone:      "+2348011223344",
		CustomerEmail:      "late@example.com",
		DeliveryMethod:     "customer_arranged",
		PaymentMethod:      "virtual_account",
		PolicyAcknowledged: true,
		IdempotencyKey:     fmt.Sprintf("idemp-hold-04-%d", time.Now().UnixNano()),
		Lines: []finance.CartLineInput{
			{StorefrontProductID: sfProdID, Quantity: "1"},
		},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "sold out", "must report sold out when all items are reserved")

	// 5. Force expiry on first order
	_, err = pool.Exec(ctx, `
		UPDATE storefront_orders
		SET reservation_expires_at = now() - interval '1 hour'
		WHERE workspace_id = $1 AND order_reference = $2
	`, ws, conf1.OrderReference)
	require.NoError(t, err)

	expiredCount, err := svc.ExpireStaleStorefrontReservations(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, expiredCount, "must expire exactly 1 stale order")

	// Check order 1 status
	var commStatus string
	var cancelReason *string
	err = pool.QueryRow(ctx, `
		SELECT commercial_status, decline_or_cancel_reason
		FROM storefront_orders
		WHERE workspace_id = $1 AND order_reference = $2
	`, ws, conf1.OrderReference).Scan(&commStatus, &cancelReason)
	require.NoError(t, err)
	require.Equal(t, "cancelled", commStatus)
	require.NotNil(t, cancelReason)
	require.Contains(t, *cancelReason, "Payment hold expired")

	// Check inventory balance: reserved_quantity decremented back to 1
	err = pool.QueryRow(ctx, `
		SELECT reserved_quantity FROM inventory_balances
		WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4
	`, ws, outletID, prodID, variantID).Scan(&qRes)
	require.NoError(t, err)
	require.True(t, decimal.NewFromInt(1).Equal(qRes), "expired hold must release reservation back to available stock")

	// 6. Now checkout for 1 unit succeeds again!
	conf3, err := svc.SubmitGuestCheckout(ctx, sf.Slug, false, finance.GuestCheckoutInput{
		ClientKey:          "client-05",
		CustomerName:       "Lucky Shopper",
		CustomerPhone:      "+2348011223344",
		CustomerEmail:      "lucky@example.com",
		DeliveryMethod:     "customer_arranged",
		PaymentMethod:      "virtual_account",
		PolicyAcknowledged: true,
		IdempotencyKey:     fmt.Sprintf("idemp-hold-05-%d", time.Now().UnixNano()),
		Lines: []finance.CartLineInput{
			{StorefrontProductID: sfProdID, Quantity: "1"},
		},
	})
	require.NoError(t, err)
	require.NotEmpty(t, conf3.OrderReference)
}

func TestLatePaymentWebhookReHoldStockOrNeedsAttention(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "sf-late-pay")

	mockProv := &mockPaymentProvider{key: "paystack"}
	svc := finance.NewService(pool, finance.WithStorefrontPaymentProvider(mockProv))

	sf, err := svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name:     "Late Store",
		Slug:     fmt.Sprintf("late-store-%d", time.Now().UnixNano()%1000000),
		Currency: "NGN",
	})
	require.NoError(t, err)

	var outletID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO inventory_locations (workspace_id, name, location_type, is_default, is_active)
		VALUES ($1, 'Main Warehouse', 'outlet', true, true)
		RETURNING id
	`, ws).Scan(&outletID)
	require.NoError(t, err)

	// Create Product with 1 unit on hand
	var prodID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO products (workspace_id, name, kind, status, idempotency_key)
		VALUES ($1, 'Rare Jacket', 'stock_tracked', 'active', $2)
		RETURNING id
	`, ws, fmt.Sprintf("prod-jacket-%d", time.Now().UnixNano())).Scan(&prodID)
	require.NoError(t, err)

	var variantID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO product_variants (workspace_id, product_id, name, is_default, currency, currency_exponent, selling_price_minor)
		VALUES ($1, $2, 'Medium', true, 'NGN', 2, 5000000)
		RETURNING id
	`, ws, prodID).Scan(&variantID)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		INSERT INTO inventory_balances (workspace_id, location_id, product_id, variant_id, quantity_on_hand, reserved_quantity, value_on_hand_minor)
		VALUES ($1, $2, $3, $4, 1, 0, 3000000)
	`, ws, outletID, prodID, variantID)
	require.NoError(t, err)

	// CASE A: Expired Order, but stock is still available -> Re-holds stock & marks paid
	var orderA int64
	err = pool.QueryRow(ctx, `
		INSERT INTO storefront_orders (
			workspace_id, storefront_id, order_reference, public_token_hash, outlet_id,
			commercial_status, fulfilment_status, payment_status, currency, currency_exponent,
			subtotal_minor, tax_minor, delivery_fee_minor, total_minor, delivery_method,
			customer_name, customer_email, idempotency_key, reservation_expires_at
		) VALUES (
			$1, $2, 'ORD-LATE-A', 'tokhash-late-a', $3,
			'cancelled', 'unreserved', 'unpaid', 'NGN', 2,
			5000000, 0, 0, 5000000, 'customer_arranged',
			'Late Customer A', 'lata@example.com', $4, now() - interval '2 hours'
		) RETURNING id
	`, ws, sf.ID, outletID, fmt.Sprintf("idemp-late-a-%d", time.Now().UnixNano())).Scan(&orderA)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		INSERT INTO storefront_order_lines (
			workspace_id, order_id, product_id, variant_id, product_kind,
			title_snapshot, unit_name, requested_quantity, confirmed_quantity, unit_price_minor, line_total_minor
		) VALUES (
			$1, $2, $3, $4, 'stock_tracked',
			'Rare Jacket', 'piece', 1, 1, 5000000, 5000000
		)
	`, ws, orderA, prodID, variantID)
	require.NoError(t, err)

	attemptRefA := fmt.Sprintf("ref_late_a_%d", time.Now().UnixNano())
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, "DELETE FROM payment_webhook_events WHERE event_id = $1", attemptRefA)
	})
	q := db.New(pool)
	attemptA, err := q.CreateStorefrontPaymentAttempt(ctx, db.CreateStorefrontPaymentAttemptParams{
		WorkspaceID:          ws,
		OrderID:              orderA,
		Provider:             "paystack",
		Method:               "virtual_account",
		Reference:            attemptRefA,
		AmountMinor:          5000000,
		FeeMinor:             75000,
		CommissionMinor:      0,
		VirtualAccountNumber: pgtype.Text{String: "1122334455", Valid: true},
		BankName:             pgtype.Text{String: "Wema Bank", Valid: true},
		ExpiresAt:            pgtype.Timestamptz{Time: time.Now().UTC().Add(-time.Hour), Valid: true},
		Status:               "pending",
	})
	require.NoError(t, err)

	// Webhook for late payment A
	gin.SetMode(gin.TestMode)
	h := finance.NewHandler(svc, nil)
	r := gin.New()
	v1 := r.Group("/api/v1")
	h.RegisterBlueprint13Routes(v1, v1)
	h.RegisterStorefrontPaymentWebhookRoutes(v1)

	whPayloadA := map[string]any{
		"event": "charge.success",
		"data": map[string]any{
			"reference": attemptRefA,
			"amount":    5000000,
			"fees":      75000,
			"status":    "success",
		},
	}
	bodyBytesA, _ := json.Marshal(whPayloadA)
	reqA := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(bodyBytesA))
	reqA.Header.Set("x-paystack-signature", signMockWebhook(bodyBytesA))
	recA := httptest.NewRecorder()
	r.ServeHTTP(recA, reqA)
	require.Equal(t, http.StatusOK, recA.Code)

	// Check Order A is paid and has linked sale
	var orderAStatus string
	var linkedSaleA *int64
	err = pool.QueryRow(ctx, "SELECT payment_status, linked_sale_id FROM storefront_orders WHERE id = $1", orderA).Scan(&orderAStatus, &linkedSaleA)
	require.NoError(t, err)
	require.Equal(t, "paid", orderAStatus)
	require.NotNil(t, linkedSaleA, "should link to created Sale")

	// Reserved stock was re-held
	var qResA decimal.Decimal
	err = pool.QueryRow(ctx, "SELECT reserved_quantity FROM inventory_balances WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4", ws, outletID, prodID, variantID).Scan(&qResA)
	require.NoError(t, err)
	require.True(t, decimal.NewFromInt(1).Equal(qResA))

	// CASE B: Stock is completely depleted (another order sold it) -> Webhook flags paid_needs_attention without overselling!
	// Now set quantity_on_hand = 1, reserved_quantity = 1 (available = 0)
	var orderB int64
	err = pool.QueryRow(ctx, `
		INSERT INTO storefront_orders (
			workspace_id, storefront_id, order_reference, public_token_hash, outlet_id,
			commercial_status, fulfilment_status, payment_status, currency, currency_exponent,
			subtotal_minor, tax_minor, delivery_fee_minor, total_minor, delivery_method,
			customer_name, customer_email, idempotency_key, reservation_expires_at
		) VALUES (
			$1, $2, 'ORD-LATE-B', 'tokhash-late-b', $3,
			'cancelled', 'unreserved', 'unpaid', 'NGN', 2,
			5000000, 0, 0, 5000000, 'customer_arranged',
			'Late Customer B', 'latb@example.com', $4, now() - interval '2 hours'
		) RETURNING id
	`, ws, sf.ID, outletID, fmt.Sprintf("idemp-late-b-%d", time.Now().UnixNano())).Scan(&orderB)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		INSERT INTO storefront_order_lines (
			workspace_id, order_id, product_id, variant_id, product_kind,
			title_snapshot, unit_name, requested_quantity, confirmed_quantity, unit_price_minor, line_total_minor
		) VALUES (
			$1, $2, $3, $4, 'stock_tracked',
			'Rare Jacket', 'piece', 1, 1, 5000000, 5000000
		)
	`, ws, orderB, prodID, variantID)
	require.NoError(t, err)

	attemptRefB := fmt.Sprintf("ref_late_b_%d", time.Now().UnixNano())
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, "DELETE FROM payment_webhook_events WHERE event_id = $1", attemptRefB)
	})
	attemptB, err := q.CreateStorefrontPaymentAttempt(ctx, db.CreateStorefrontPaymentAttemptParams{
		WorkspaceID:          ws,
		OrderID:              orderB,
		Provider:             "paystack",
		Method:               "virtual_account",
		Reference:            attemptRefB,
		AmountMinor:          5000000,
		FeeMinor:             75000,
		CommissionMinor:      0,
		VirtualAccountNumber: pgtype.Text{String: "9988112233", Valid: true},
		BankName:             pgtype.Text{String: "Wema Bank", Valid: true},
		ExpiresAt:            pgtype.Timestamptz{Time: time.Now().UTC().Add(-time.Hour), Valid: true},
		Status:               "pending",
	})
	require.NoError(t, err)

	whPayloadB := map[string]any{
		"event": "charge.success",
		"data": map[string]any{
			"reference": attemptRefB,
			"amount":    5000000,
			"fees":      75000,
			"status":    "success",
		},
	}
	bodyBytesB, _ := json.Marshal(whPayloadB)
	reqB := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(bodyBytesB))
	reqB.Header.Set("x-paystack-signature", signMockWebhook(bodyBytesB))
	recB := httptest.NewRecorder()
	r.ServeHTTP(recB, reqB)
	require.Equal(t, http.StatusOK, recB.Code)

	// Order B MUST be paid_needs_attention without creating a Sale (prevents inventory corruption/overselling)
	var orderBStatus string
	var linkedSaleB *int64
	err = pool.QueryRow(ctx, "SELECT payment_status, linked_sale_id FROM storefront_orders WHERE id = $1", orderB).Scan(&orderBStatus, &linkedSaleB)
	require.NoError(t, err)
	require.Equal(t, "paid_needs_attention", orderBStatus)
	require.Nil(t, linkedSaleB, "must not create a Sale when stock is unavailable")

	// Order event must be recorded for merchant attention
	var evCount int
	err = pool.QueryRow(ctx, "SELECT count(*) FROM storefront_order_events WHERE order_id = $1 AND event_type = 'payment_needs_attention'", orderB).Scan(&evCount)
	require.NoError(t, err)
	require.Equal(t, 1, evCount)

	_ = attemptA
	_ = attemptB
}

func TestStorefrontPickupHoldCodeAndManualMarkPaid(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "sf-pickup-manual")
	wsOther, _ := createTestWorkspace(t, pool, "sf-pickup-other")

	svc := finance.NewService(pool)

	defaultOutlet, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
		Name: "Head Office", LocationType: "warehouse", IsDefault: true,
	})
	require.NoError(t, err)

	pickupOutlet, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
		Name: "Lekki Pickup Desk", LocationType: "outlet", Address: "14 Admiralty Way, Lekki",
		IsPickupPoint: true, PickupNote: "Ask for pickup desk beside reception",
	})
	require.NoError(t, err)

	bankAcc, err := svc.CreateAccount(ctx, ws, finance.CreateAccountInput{Name: "GTB Business", AccountType: "bank", Currency: "NGN"})
	require.NoError(t, err)
	cashAcc, err := svc.CreateAccount(ctx, ws, finance.CreateAccountInput{Name: "Shop Cash Till", AccountType: "cash", Currency: "NGN"})
	require.NoError(t, err)
	otherAcc, err := svc.CreateAccount(ctx, wsOther, finance.CreateAccountInput{Name: "Foreign Bank", AccountType: "bank", Currency: "NGN"})
	require.NoError(t, err)

	item, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name: "Canvas Tote", Kind: "stock_tracked", SellingPrice: "50", Currency: "NGN", IdempotencyKey: "pm-item-1",
	})
	require.NoError(t, err)
	vars, err := svc.ListProductVariants(ctx, ws, item.ID)
	require.NoError(t, err)

	_, err = svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{
		ProductID: item.ID, LocationID: defaultOutlet.ID, EffectiveOn: "2026-11-11",
		Quantity: "5", UnitCost: "20", Currency: "NGN", Reason: "Default stock", IdempotencyKey: "pm-open-def",
	})
	require.NoError(t, err)
	_, err = svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{
		ProductID: item.ID, LocationID: pickupOutlet.ID, EffectiveOn: "2026-11-11",
		Quantity: "3", UnitCost: "20", Currency: "NGN", Reason: "Pickup stock", IdempotencyKey: "pm-open-pk",
	})
	require.NoError(t, err)

	slug := fmt.Sprintf("pickup-shop-%d", time.Now().UnixNano()%1000000)
	_, err = svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name: "Pickup Shop", Slug: slug, DefaultOutletID: &defaultOutlet.ID, Currency: "NGN",
	})
	require.NoError(t, err)
	stateName := "Lagos"
	_, err = svc.UpdateStorefrontSettings(ctx, ws, finance.UpdateStorefrontSettingsInput{
		ContactPhone: "+2348001112222",
		DeliveryAreas: []finance.StorefrontDeliveryAreaInput{
			{Name: "Lekki Phase 1", Fee: "15", State: &stateName, EstimateText: "1–2 days", OutletID: &pickupOutlet.ID},
		},
	})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontPaymentSettings(ctx, ws, finance.UpdateStorefrontPaymentSettingsInput{
		PaymentManualTransferEnabled: sfBoolPtr(true),
		PaymentCodEnabled:            sfBoolPtr(true),
		ManualBankName:               sfStrPtr("Guaranty Trust Bank"),
		ManualBankAccountNumber:      sfStrPtr("0123456789"),
		ManualBankAccountName:        sfStrPtr("Pickup Shop Ltd"),
	})
	require.NoError(t, err)
	sfProd, err := svc.UpsertStorefrontProduct(ctx, ws, vars[0].ID, finance.PublishCatalogueVariantInput{IsPublished: true})
	require.NoError(t, err)
	_, err = svc.PublishStorefront(ctx, ws, true)
	require.NoError(t, err)

	proj, err := svc.GetPublicStorefrontProjection(ctx, slug, false, "", "")
	require.NoError(t, err)
	require.Len(t, proj.PickupPoints, 1)
	require.Equal(t, "Ask for pickup desk beside reception", proj.PickupPoints[0].PickupNote)
	require.Len(t, proj.DeliveryAreas, 1)
	require.Equal(t, "1–2 days", proj.DeliveryAreas[0].EstimateText)
	require.Equal(t, "Lagos", *proj.DeliveryAreas[0].State)

	// 1. Place pickup order with manual transfer -> holds at pickupOutlet ONLY, generates 6-char pickup code
	conf, err := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey:          "pickup-client-1",
		Lines:              []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "2"}},
		CustomerName:       "Chidi",
		CustomerPhone:      "+2348033334444",
		DeliveryMethod:     "pickup",
		PickupPointID:      pickupOutlet.ID,
		PaymentMethod:      "manual_transfer",
		PolicyAcknowledged: true,
		IdempotencyKey:     fmt.Sprintf("pk-man-%d", time.Now().UnixNano()),
	})
	require.NoError(t, err)
	require.NotNil(t, conf.PickupCode)
	require.Len(t, *conf.PickupCode, 6)
	require.Equal(t, "transfer_manual", *conf.HoldType)

	var defRes, pkRes decimal.Decimal
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3 AND variant_id=$4`, ws, defaultOutlet.ID, item.ID, vars[0].ID).Scan(&defRes))
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3 AND variant_id=$4`, ws, pickupOutlet.ID, item.ID, vars[0].ID).Scan(&pkRes))
	require.True(t, defRes.IsZero(), "default outlet should have 0 reserved")
	require.True(t, decimal.NewFromInt(2).Equal(pkRes), "pickup outlet must hold 2 units")

	orders, err := svc.ListMerchantOrders(ctx, ws, "", 0)
	require.NoError(t, err)
	oID := orders[0].ID

	// Cross-workspace money account must be rejected on Mark paid
	err = svc.MarkStorefrontOrderPaidManual(ctx, ws, oID, otherAcc.ID, "wrong ws")
	require.ErrorIs(t, err, finance.ErrForbiddenAccount)

	// Valid manual Mark paid debits bankAcc and creates Sale
	require.NoError(t, svc.MarkStorefrontOrderPaidManual(ctx, ws, oID, bankAcc.ID, "Transfer verified"))
	afterPaid, err := svc.GetMerchantOrder(ctx, ws, oID)
	require.NoError(t, err)
	require.Equal(t, "paid", afterPaid.PaymentStatus)
	require.NotNil(t, afterPaid.LinkedSaleID)

	// Ready for pickup -> packed
	readyOrd, err := svc.ReadyForPickupStorefrontOrder(ctx, ws, user, oID, afterPaid.Version)
	require.NoError(t, err)
	require.Equal(t, "packed", readyOrd.FulfilmentStatus)

	// Wrong pickup code rejected
	_, err = svc.CollectStorefrontOrder(ctx, ws, user, oID, finance.CollectStorefrontOrderInput{
		ExpectedVersion: readyOrd.Version,
		PickupCode:      "WRONG1",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid pickup code")

	// Correct pickup code fulfils order & issues stock from pickup outlet
	collected, err := svc.CollectStorefrontOrder(ctx, ws, user, oID, finance.CollectStorefrontOrderInput{
		ExpectedVersion: readyOrd.Version,
		PickupCode:      *conf.PickupCode,
	})
	require.NoError(t, err)
	require.Equal(t, "fulfilled", collected.FulfilmentStatus)
	require.Equal(t, "completed", collected.CommercialStatus)

	var pkQoh decimal.Decimal
	require.NoError(t, pool.QueryRow(ctx, `SELECT quantity_on_hand FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3 AND variant_id=$4`, ws, pickupOutlet.ID, item.ID, vars[0].ID).Scan(&pkQoh))
	require.True(t, decimal.NewFromInt(1).Equal(pkQoh), "3 - 2 = 1 left at pickup outlet")

	// 2. Pay at pickup (COD) -> Collected records payment in Cash account and fulfils
	conf2, err := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey:          "pickup-client-2",
		Lines:              []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "1"}},
		CustomerName:       "Amaka",
		CustomerPhone:      "+2348055556666",
		DeliveryMethod:     "pickup",
		PickupPointID:      pickupOutlet.ID,
		PaymentMethod:      "cod",
		PolicyAcknowledged: true,
		IdempotencyKey:     fmt.Sprintf("pk-cod-%d", time.Now().UnixNano()),
	})
	require.NoError(t, err)
	require.Equal(t, "pickup", *conf2.HoldType)

	ordersAll, _ := svc.ListMerchantOrders(ctx, ws, "", 0)
	var codOrdID int64
	var codVer int32
	for _, ord := range ordersAll {
		if ord.OrderReference == conf2.OrderReference {
			codOrdID = ord.ID
			codVer = ord.Version
			break
		}
	}
	codCollected, err := svc.CollectStorefrontOrder(ctx, ws, user, codOrdID, finance.CollectStorefrontOrderInput{
		ExpectedVersion: codVer,
		PickupCode:      *conf2.PickupCode,
		MoneyAccountID:  cashAcc.ID,
	})
	require.NoError(t, err)
	require.Equal(t, "paid", codCollected.PaymentStatus)
	require.Equal(t, "fulfilled", codCollected.FulfilmentStatus)

	var totDebits, totCredits int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT COALESCE(sum(debit_minor),0), COALESCE(sum(credit_minor),0) FROM ledger_lines WHERE workspace_id=$1`, ws).Scan(&totDebits, &totCredits))
	require.Equal(t, totDebits, totCredits)
	require.Greater(t, totDebits, int64(0))
}
func TestStorefrontSquadProviderWebhookAndUnsupportedMethodHiding(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "sf-squad")

	squadSecret := "sq_test_key_integration"
	squadWHSecret := "sq_wh_secret_integration"
	squadSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/payout/account/lookup":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  200,
				"success": true,
				"data": map[string]any{
					"account_name":   "SQUAD MERCHANT VENTURES",
					"account_number": "0123456789",
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/merchant/create-sub-users":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  200,
				"success": true,
				"data": map[string]any{
					"sub_merchant_id": "SQD_SUB_999",
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/transaction/initiate":
			var body map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  200,
				"success": true,
				"data": map[string]any{
					"checkout_url":    "https://pay.squadco.com/chk_test_999",
					"transaction_ref": body["transaction_ref"],
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/virtual-account":
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  403,
				"success": false,
				"message": "Dynamic virtual account pool not enabled",
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer squadSrv.Close()

	squadProv := payments.NewSquadProvider(squadSecret, squadWHSecret, squadSrv.URL, 5*time.Second)
	svc := finance.NewService(
		pool,
		finance.WithStorefrontPaymentProvider(&mockPaymentProvider{key: "paystack"}),
		finance.WithStorefrontPaymentProvider(squadProv),
	)

	router := gin.New()
	handler := finance.NewHandler(svc, nil)
	v1 := router.Group("/api/v1")
	handler.RegisterBlueprint13Routes(v1, v1)
	handler.RegisterPublicStorefrontRoutes(v1)

	outlet, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
		Name:          "Squad Hub",
		LocationType:  "outlet",
		Address:       "12 Admiralty Way, Lagos",
		IsDefault:     true,
		IsPickupPoint: true,
	})
	require.NoError(t, err)

	item, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name: "Squad Sneaker", Kind: "stock_tracked", SellingPrice: "120", Currency: "NGN", IdempotencyKey: "sq-item-1",
	})
	require.NoError(t, err)
	vars, err := svc.ListProductVariants(ctx, ws, item.ID)
	require.NoError(t, err)
	_, err = svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{
		ProductID: item.ID, LocationID: outlet.ID, EffectiveOn: "2026-11-11",
		Quantity: "4", UnitCost: "60", Currency: "NGN", Reason: "Squad init", IdempotencyKey: "sq-open-1",
	})
	require.NoError(t, err)

	slug := fmt.Sprintf("squad-%d", time.Now().UnixNano()%1000000)
	_, err = svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name:            "Squad Test Store",
		Slug:            slug,
		DefaultOutletID: &outlet.ID,
		Currency:        "NGN",
	})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontSettings(ctx, ws, finance.UpdateStorefrontSettingsInput{
		ContactPhone:    "+2348001112233",
		DeliveryMethods: []string{"pickup"},
	})
	require.NoError(t, err)
	sfProd, err := svc.UpsertStorefrontProduct(ctx, ws, vars[0].ID, finance.PublishCatalogueVariantInput{IsPublished: true})
	require.NoError(t, err)
	_, err = svc.PublishStorefront(ctx, ws, true)
	require.NoError(t, err)

	// Connect Squad payout account (virtual_account unsupported by default on SquadProvider)
	resolved, err := svc.ResolveBankAccount(ctx, "squad", "058", "0123456789")
	require.NoError(t, err)
	require.Equal(t, "SQUAD MERCHANT VENTURES", resolved)

	payout, err := svc.SavePayoutAccount(ctx, ws, finance.SavePayoutAccountInput{
		Provider:      "squad",
		BankCode:      "058",
		AccountNumber: "0123456789",
		AccountName:   resolved,
	})
	require.NoError(t, err)
	require.Equal(t, "squad", payout.Provider)

	_, err = svc.UpdateStorefrontPaymentSettings(ctx, ws, finance.UpdateStorefrontPaymentSettingsInput{
		PaymentBankTransferEnabled:   sfBoolPtr(true),
		PaymentCardEnabled:           sfBoolPtr(true),
		PaymentManualTransferEnabled: sfBoolPtr(false),
		PaymentCodEnabled:            sfBoolPtr(false),
	})
	require.NoError(t, err)

	settingsView, err := svc.GetStorefrontPaymentSettings(ctx, ws)
	require.NoError(t, err)
	require.Contains(t, settingsView.AvailableProviders, "paystack")
	require.Contains(t, settingsView.AvailableProviders, "squad")
	require.NotNil(t, settingsView.PayoutAccount)
	require.Equal(t, "squad", settingsView.PayoutAccount.Provider)

	// Public projection hides virtual_account because SquadProvider reports ErrNotSupported / SupportsMethod("virtual_account")==false
	proj, err := svc.GetPublicStorefrontProjection(ctx, slug, false, "", "")
	require.NoError(t, err)
	require.False(t, proj.PaymentBankTransferEnabled, "ErrNotSupported/SupportsMethod must hide unsupported VA payment method")
	require.True(t, proj.PaymentCardEnabled)
	require.True(t, proj.OnlinePaymentsReady)

	// Explicit virtual_account checkout on Squad-only provider fails cleanly
	_, err = svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey:          "sq-client-bad",
		CustomerName:       "Tolu Ade",
		CustomerPhone:      "+2348030000001",
		CustomerEmail:      "tolu@example.com",
		DeliveryMethod:     "pickup",
		PickupPointID:      outlet.ID,
		PaymentMethod:      "virtual_account",
		PolicyAcknowledged: true,
		Lines:              []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "1"}},
	})
	require.Error(t, err)

	// Default checkout picks card checkout on Squad and creates payment attempt
	conf, err := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey:          "sq-client-good",
		CustomerName:       "Tolu Ade",
		CustomerPhone:      "+2348030000001",
		CustomerEmail:      "tolu@example.com",
		DeliveryMethod:     "pickup",
		PickupPointID:      outlet.ID,
		PolicyAcknowledged: true,
		IdempotencyKey:     fmt.Sprintf("sq-chk-%d", time.Now().UnixNano()),
		Lines:              []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "1"}},
	})
	require.NoError(t, err)
	require.NotNil(t, conf.CardCheckoutURL)
	require.Equal(t, "https://pay.squadco.com/chk_test_999", *conf.CardCheckoutURL)

	var attemptRef string
	var attemptAmt int64
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT a.reference, a.amount_minor
		FROM storefront_payment_attempts a
		JOIN storefront_orders o ON o.id = a.order_id
		WHERE o.workspace_id = $1 AND o.order_reference = $2
	`, ws, conf.OrderReference).Scan(&attemptRef, &attemptAmt))

	signSquad := func(b []byte) string {
		mac := hmac.New(sha512.New, []byte(squadWHSecret))
		mac.Write(b)
		return hex.EncodeToString(mac.Sum(nil))
	}

	// 1. Invalid webhook signature -> 401
	badPayload := []byte(fmt.Sprintf(`{"Event":"charge_successful","TransactionRef":"%s","Body":{"transaction_ref":"%s","amount":%d,"transaction_status":"Success"}}`, attemptRef, attemptRef, attemptAmt))
	reqBad := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/squad", bytes.NewReader(badPayload))
	reqBad.Header.Set("x-squad-encrypted-body", "invalid_hex_sig")
	wBad := httptest.NewRecorder()
	router.ServeHTTP(wBad, reqBad)
	require.Equal(t, http.StatusUnauthorized, wBad.Code)

	// 2. Valid signature for failed charge first -> 200, attempt rejected, order stays unpaid (and does not block subsequent charge_successful on same ref)
	failedPayload := []byte(fmt.Sprintf(`{"Event":"charge_failed","TransactionRef":"%s","Body":{"transaction_ref":"%s","amount":%d,"transaction_status":"Failed"}}`, attemptRef, attemptRef, attemptAmt))
	reqFailed := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/squad", bytes.NewReader(failedPayload))
	reqFailed.Header.Set("x-squad-encrypted-body", signSquad(failedPayload))
	wFailed := httptest.NewRecorder()
	router.ServeHTTP(wFailed, reqFailed)
	require.Equal(t, http.StatusOK, wFailed.Code)

	// 3. Valid Squad webhook with exact amount -> 200, order paid, sale + balanced ledger created
	goodPayload := []byte(fmt.Sprintf(`{"Event":"charge_successful","TransactionRef":"%s","Body":{"transaction_ref":"%s","amount":%d,"merchant_amount":%d,"transaction_status":"Success"}}`, attemptRef, attemptRef, attemptAmt, attemptAmt-150))
	reqGood := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/squad", bytes.NewReader(goodPayload))
	reqGood.Header.Set("x-squad-encrypted-body", signSquad(goodPayload))
	wGood := httptest.NewRecorder()
	router.ServeHTTP(wGood, reqGood)
	require.Equal(t, http.StatusOK, wGood.Code)

	// 4. Replayed Squad webhook -> 200 idempotent, single sale & single ledger entry
	reqReplay := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/squad", bytes.NewReader(goodPayload))
	reqReplay.Header.Set("x-squad-encrypted-body", signSquad(goodPayload))
	wReplay := httptest.NewRecorder()
	router.ServeHTTP(wReplay, reqReplay)
	require.Equal(t, http.StatusOK, wReplay.Code)

	var payStatus string
	var saleCount int
	require.NoError(t, pool.QueryRow(ctx, `SELECT payment_status FROM storefront_orders WHERE workspace_id=$1 AND order_reference=$2`, ws, conf.OrderReference).Scan(&payStatus))
	require.Equal(t, "paid", payStatus)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM sales WHERE workspace_id=$1`, ws).Scan(&saleCount))
	require.Equal(t, 1, saleCount)

	var totDebits, totCredits int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT COALESCE(sum(debit_minor),0), COALESCE(sum(credit_minor),0) FROM ledger_lines WHERE workspace_id=$1`, ws).Scan(&totDebits, &totCredits))
	require.Equal(t, totDebits, totCredits)
	require.Greater(t, totDebits, int64(0))
}

type mockShippingClient struct {
	mu             struct{ fetches int }
	failLabel      bool
	lastWeightKG   string
	trackingNumber string
}

func (m *mockShippingClient) ValidateAddress(ctx context.Context, apiKey string, in shipping.AddressInput) (shipping.ValidatedAddress, error) {
	if apiKey == "" {
		return shipping.ValidatedAddress{}, shipping.ErrProviderUnavailable
	}
	code := int64(1010)
	if in.Name != "" && in.Address != "10 Store Way, Lekki, Lagos" {
		code = 2020
	}
	return shipping.ValidatedAddress{AddressCode: code, Formatted: in.Address}, nil
}

func (m *mockShippingClient) ListCouriers(ctx context.Context, apiKey string) ([]shipping.CourierInfo, error) {
	if apiKey == "" {
		return nil, shipping.ErrProviderUnavailable
	}
	return []shipping.CourierInfo{
		{CourierID: "gigl_id", ServiceCode: "gigl", Name: "GIG Logistics", Status: "operational"},
		{CourierID: "dhl_id", ServiceCode: "dhl", Name: "DHL Express", Status: "operational"},
	}, nil
}

func (m *mockShippingClient) FetchRates(ctx context.Context, apiKey string, req shipping.RateRequest) (shipping.RatesResponse, error) {
	m.mu.fetches++
	if len(req.PackageItems) > 0 {
		m.lastWeightKG = req.PackageItems[0].UnitWeightKG
	}
	return shipping.RatesResponse{
		RequestToken: "sb_tok_test_1",
		ExpiresAt:    time.Now().UTC().Add(30 * time.Minute),
		Couriers: []shipping.CourierRate{
			{CourierID: "gigl_id", ServiceCode: "gigl", CourierName: "GIG Logistics", TotalMinor: 250000, EstimateText: "2-3 days", Currency: "NGN"},
			{CourierID: "dhl_id", ServiceCode: "dhl", CourierName: "DHL Express", TotalMinor: 480000, EstimateText: "1 day", Currency: "NGN"},
		},
	}, nil
}

func (m *mockShippingClient) CreateLabel(ctx context.Context, apiKey string, req shipping.LabelRequest) (shipping.ShipmentLabel, error) {
	if m.failLabel {
		return shipping.ShipmentLabel{}, errors.New("shipbubble upstream timeout")
	}
	trk := m.trackingNumber
	if trk == "" {
		trk = "TRK-LIVE-777"
	}
	return shipping.ShipmentLabel{
		OrderID:        "SB-777",
		TrackingNumber: trk,
		TrackingURL:    "https://track.shipbubble.com/" + trk,
		CourierName:    "GIG Logistics",
		Status:         "confirmed",
	}, nil
}

func (m *mockShippingClient) VerifyWebhook(apiKey string, rawBody []byte, headers http.Header) (shipping.WebhookEvent, error) {
	return shipping.NewShipbubbleClient("", 0).VerifyWebhook(apiKey, rawBody, headers)
}

func TestStorefrontShipbubbleRatesBookingAndWebhook(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "sf-shipbubble")
	wsOther, _ := createTestWorkspace(t, pool, "sf-sb-other")

	trkNum := fmt.Sprintf("TRK-LIVE-%d", time.Now().UnixNano())
	shipMock := &mockShippingClient{failLabel: true, trackingNumber: trkNum}
	svc := finance.NewService(
		pool,
		finance.WithStorefrontPaymentProvider(&mockPaymentProvider{key: "paystack"}),
		finance.WithShippingClient(shipMock),
	)

	router := gin.New()
	handler := finance.NewHandler(svc, nil)
	v1 := router.Group("/api/v1")
	handler.RegisterBlueprint13Routes(v1, v1)
	handler.RegisterPublicStorefrontRoutes(v1)

	outlet, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
		Name: "Lekki Store", LocationType: "outlet", Address: "10 Store Way, Lekki, Lagos", IsDefault: true,
	})
	require.NoError(t, err)

	item, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name: "Heavy Leather Boot", Kind: "stock_tracked", SellingPrice: "100", Currency: "NGN", IdempotencyKey: "sb-item-1",
	})
	require.NoError(t, err)
	vars, err := svc.ListProductVariants(ctx, ws, item.ID)
	require.NoError(t, err)
	_, err = svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{
		ProductID: item.ID, LocationID: outlet.ID, EffectiveOn: "2026-11-11",
		Quantity: "5", UnitCost: "40", Currency: "NGN", Reason: "SB open stock", IdempotencyKey: "sb-open-1",
	})
	require.NoError(t, err)

	slug := fmt.Sprintf("shipbubble-%d", time.Now().UnixNano()%1000000)
	_, err = svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name: "Courier Shop", Slug: slug, DefaultOutletID: &outlet.ID, Currency: "NGN",
	})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontSettings(ctx, ws, finance.UpdateStorefrontSettingsInput{
		ContactPhone:    "+2348009998888",
		ContactEmail:    "merchant-sb@example.com",
		Address:         "10 Store Way, Lekki, Lagos",
		DeliveryMethods: []string{"courier", "pickup"},
	})
	require.NoError(t, err)
	sfProd, err := svc.UpsertStorefrontProduct(ctx, ws, vars[0].ID, finance.PublishCatalogueVariantInput{IsPublished: true})
	require.NoError(t, err)
	_, err = svc.PublishStorefront(ctx, ws, true)
	require.NoError(t, err)

	// Connect Paystack payout account
	_, err = svc.SavePayoutAccount(ctx, ws, finance.SavePayoutAccountInput{
		Provider: "paystack", BankCode: "058", AccountNumber: "0123456789", AccountName: "COURIER SHOP LTD",
	})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontPaymentSettings(ctx, ws, finance.UpdateStorefrontPaymentSettingsInput{
		PaymentBankTransferEnabled:   sfBoolPtr(true),
		PaymentManualTransferEnabled: sfBoolPtr(true),
		PaymentCodEnabled:            sfBoolPtr(true),
	})
	require.NoError(t, err)

	// Configure Shipbubble with encrypted key (masked in GET, never plaintext)
	sbKey := "sb_live_super_secret_8899"
	defWeight := int32(500)
	sbView, err := svc.UpdateStorefrontShipbubbleSettings(ctx, ws, finance.UpdateStorefrontShipbubbleSettingsInput{
		APIKey:             &sbKey,
		Strategy:           "cheapest",
		DefaultWeightGrams: &defWeight,
	})
	require.NoError(t, err)
	require.True(t, sbView.Connected)
	require.NotEqual(t, sbKey, sbView.APIKeyMasked)
	require.Contains(t, sbView.APIKeyMasked, "8899")

	sbGet, err := svc.GetStorefrontShipbubbleSettings(ctx, ws)
	require.NoError(t, err)
	require.NotEqual(t, sbKey, sbGet.APIKeyMasked)
	require.Equal(t, int32(500), sbGet.DefaultWeightGrams)

	// Workspace isolation: wsOther has no storefront / cannot see ws Shipbubble config
	_, err = svc.GetStorefrontShipbubbleSettings(ctx, wsOther)
	require.Error(t, err)

	// 1. Default weight fallback (500g -> 0.500kg) + rate caching across identical requests
	ratesReq := finance.PublicDeliveryRatesInput{
		Address: "25 Wuse II, Abuja",
		Name:    "Zainab Buyer",
		Email:   "zainab@example.com",
		Phone:   "+2348022223333",
		Lines:   []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "1"}},
	}
	rateResp1, err := svc.GetPublicDeliveryRates(ctx, slug, false, ratesReq)
	require.NoError(t, err)
	require.False(t, rateResp1.Cached)
	require.Equal(t, 1, shipMock.mu.fetches)
	require.Equal(t, "0.500", shipMock.lastWeightKG)
	require.Len(t, rateResp1.Rates, 1) // strategy = cheapest
	require.Equal(t, "gigl", rateResp1.Rates[0].ServiceCode)
	require.Equal(t, int64(250000), rateResp1.Rates[0].TotalMinor)

	rateResp2, err := svc.GetPublicDeliveryRates(ctx, slug, false, ratesReq)
	require.NoError(t, err)
	require.True(t, rateResp2.Cached)
	require.Equal(t, 1, shipMock.mu.fetches, "second identical rate call must hit DB cache")

	// Variant weight overrides store default weight
	varWeight := int32(750)
	_, err = svc.UpdateProductVariant(ctx, ws, item.ID, vars[0].ID, finance.UpdateVariantInput{WeightGrams: &varWeight})
	require.NoError(t, err)
	rateResp3, err := svc.GetPublicDeliveryRates(ctx, slug, false, finance.PublicDeliveryRatesInput{
		Address: "26 Wuse II, Abuja",
		Lines:   []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "1"}},
	})
	require.NoError(t, err)
	require.Equal(t, 2, shipMock.mu.fetches)
	require.Equal(t, "0.750", shipMock.lastWeightKG)
	_ = rateResp3

	// 2. Courier checkout enforces online payment only and validates rate_token
	_, err = svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey:          "sb-cli-cod",
		CustomerName:       "Zainab Buyer",
		CustomerPhone:      "+2348022223333",
		CustomerEmail:      "zainab@example.com",
		DeliveryMethod:     "courier",
		DeliveryAddress:    "25 Wuse II, Abuja",
		PaymentMethod:      "cod",
		RateToken:          rateResp1.RequestToken,
		CourierServiceCode: rateResp1.Rates[0].ServiceCode,
		CourierID:          rateResp1.Rates[0].CourierID,
		PolicyAcknowledged: true,
		Lines:              []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "1"}},
	})
	require.Error(t, err, "courier delivery must reject offline payment")

	_, err = svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey:          "sb-cli-badtok",
		CustomerName:       "Zainab Buyer",
		CustomerPhone:      "+2348022223333",
		CustomerEmail:      "zainab@example.com",
		DeliveryMethod:     "courier",
		DeliveryAddress:    "25 Wuse II, Abuja",
		PaymentMethod:      "virtual_account",
		RateToken:          "tampered_token",
		CourierServiceCode: "gigl",
		PolicyAcknowledged: true,
		Lines:              []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "1"}},
	})
	require.Error(t, err, "tampered rate token must be rejected")

	// 3. Valid courier checkout -> payment webhook fires while CreateLabel fails -> order is paid with retry state
	conf, err := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey:          "sb-cli-ok",
		CustomerName:       "Zainab Buyer",
		CustomerPhone:      "+2348022223333",
		CustomerEmail:      "zainab@example.com",
		DeliveryMethod:     "courier",
		DeliveryAddress:    "25 Wuse II, Abuja",
		PaymentMethod:      "virtual_account",
		RateToken:          rateResp1.RequestToken,
		CourierServiceCode: rateResp1.Rates[0].ServiceCode,
		CourierID:          rateResp1.Rates[0].CourierID,
		PolicyAcknowledged: true,
		IdempotencyKey:     fmt.Sprintf("sb-ok-%d", time.Now().UnixNano()),
		Lines:              []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: "1"}},
	})
	require.NoError(t, err)
	require.Equal(t, "260000", conf.TotalMinor) // 10000 item + 250000 courier fee

	var orderID int64
	var attemptRef string
	var attemptAmt int64
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT o.id, a.reference, a.amount_minor
		FROM storefront_orders o
		JOIN storefront_payment_attempts a ON a.order_id = o.id
		WHERE o.workspace_id = $1 AND o.order_reference = $2
	`, ws, conf.OrderReference).Scan(&orderID, &attemptRef, &attemptAmt))

	payPayload := []byte(fmt.Sprintf(`{"event":"charge.success","data":{"reference":"%s","amount":%d,"fees":1000,"status":"success"}}`, attemptRef, attemptAmt))
	reqPay := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(payPayload))
	reqPay.Header.Set("x-paystack-signature", signMockWebhook(payPayload))
	wPay := httptest.NewRecorder()
	router.ServeHTTP(wPay, reqPay)
	require.Equal(t, http.StatusOK, wPay.Code)

	merchantOrd, err := svc.GetMerchantOrder(ctx, ws, orderID)
	require.NoError(t, err)
	require.Equal(t, "paid", merchantOrd.PaymentStatus)
	require.NotNil(t, merchantOrd.CourierBookingError)
	require.Equal(t, "booking_failed", *merchantOrd.CourierStatus)

	// Workspace isolation on retry
	_, err = svc.RetryStorefrontOrderCourierBooking(ctx, wsOther, orderID)
	require.ErrorIs(t, err, finance.ErrNotFound)

	// 4. Retry succeeds once Shipbubble recovers -> tracking number & URL saved
	shipMock.failLabel = false
	retried, err := svc.RetryStorefrontOrderCourierBooking(ctx, ws, orderID)
	require.NoError(t, err)
	require.NotNil(t, retried.CourierTrackingNumber)
	require.Equal(t, trkNum, *retried.CourierTrackingNumber)
	require.NotNil(t, retried.CourierTrackingURL)
	require.Nil(t, retried.CourierBookingError)

	// 5. Shipbubble webhook signature check (wrong -> 401; valid picked_up -> delivered -> fulfils once & idempotent replay)
	signSB := func(raw []byte) string {
		mac := hmac.New(sha512.New, []byte(sbKey))
		mac.Write(raw)
		return hex.EncodeToString(mac.Sum(nil))
	}
	pickupWH := []byte(fmt.Sprintf(`{"event":"shipment.status.changed","status":"picked_up","tracking_number":"%s","courier_name":"GIG Logistics"}`, trkNum))
	reqSBWrong := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/shipbubble", bytes.NewReader(pickupWH))
	reqSBWrong.Header.Set("x-ship-signature", "deadbeef")
	wSBWrong := httptest.NewRecorder()
	router.ServeHTTP(wSBWrong, reqSBWrong)
	require.Equal(t, http.StatusUnauthorized, wSBWrong.Code)

	reqSBPickup := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/shipbubble", bytes.NewReader(pickupWH))
	reqSBPickup.Header.Set("x-ship-signature", signSB(pickupWH))
	wSBPickup := httptest.NewRecorder()
	router.ServeHTTP(wSBPickup, reqSBPickup)
	require.Equal(t, http.StatusOK, wSBPickup.Code)

	delivWH := []byte(fmt.Sprintf(`{"event":"shipment.status.changed","status":"completed","tracking_number":"%s","courier_name":"GIG Logistics"}`, trkNum))
	reqSBDeliv := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/shipbubble", bytes.NewReader(delivWH))
	reqSBDeliv.Header.Set("x-ship-signature", signSB(delivWH))
	wSBDeliv := httptest.NewRecorder()
	router.ServeHTTP(wSBDeliv, reqSBDeliv)
	require.Equal(t, http.StatusOK, wSBDeliv.Code)

	// Replayed delivered webhook changes nothing
	reqSBReplay := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/shipbubble", bytes.NewReader(delivWH))
	reqSBReplay.Header.Set("x-ship-signature", signSB(delivWH))
	wSBReplay := httptest.NewRecorder()
	router.ServeHTTP(wSBReplay, reqSBReplay)
	require.Equal(t, http.StatusOK, wSBReplay.Code)

	afterOrd, err := svc.GetMerchantOrder(ctx, ws, orderID)
	require.NoError(t, err)
	require.Equal(t, "delivered", *afterOrd.CourierStatus)
	require.Equal(t, "fulfilled", afterOrd.FulfilmentStatus)
	require.Equal(t, "completed", afterOrd.CommercialStatus)

	var onHand, resQty decimal.Decimal
	require.NoError(t, pool.QueryRow(ctx, `SELECT quantity_on_hand, reserved_quantity FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3`, ws, outlet.ID, item.ID).Scan(&onHand, &resQty))
	require.True(t, decimal.NewFromInt(4).Equal(onHand), "stock must be deducted once (5 -> 4)")
	require.True(t, resQty.IsZero())
}

func sfBoolPtr(b bool) *bool    { return &b }
func sfStrPtr(s string) *string { return &s }

func TestUnifiedPaystackWebhookAndOrderCommandRoutes(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "a1-unified-ps")
	wsOther, otherUser := createTestWorkspace(t, pool, "a1-other-ps")

	secretKey := "sk_test_unified_paystack_secret_key"
	deprecatedWH := "whsec_deprecated_different_secret"
	var sawStorefrontMetaVA, sawStorefrontMetaCard, sawSubscriptionMeta bool

	psMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer "+secretKey, r.Header.Get("Authorization"))
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/charge":
			if meta, ok := body["metadata"].(map[string]any); ok && meta["kind"] == "storefront_order" {
				sawStorefrontMetaVA = true
			}
			_, _ = w.Write([]byte(`{"status":true,"message":"Charge attempted","data":{"status":"pay_offline","authorization":{"account_number":"9900112233","bank":"Wema Bank","account_name":"Rekordly","account_expires_at":"2026-12-31T23:59:59Z"}}}`))
		case "/transaction/initialize":
			if meta, ok := body["metadata"].(map[string]any); ok {
				if meta["kind"] == "storefront_order" {
					sawStorefrontMetaCard = true
				} else if meta["kind"] == "subscription" {
					sawSubscriptionMeta = true
				}
			}
			ref, _ := body["reference"].(string)
			_, _ = w.Write([]byte(fmt.Sprintf(`{"status":true,"message":"OK","data":{"authorization_url":"https://checkout.paystack.test/%s","access_code":"acc_1","reference":%q}}`, ref, ref)))
		case "/subaccount":
			_, _ = w.Write([]byte(`{"status":true,"message":"OK","data":{"subaccount_code":"SUB_UNI_1","id":44}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer psMock.Close()

	billProv := billing.NewPaystackProvider(secretKey, deprecatedWH, psMock.URL, 5*time.Second)
	sfProv := payments.NewPaystackProvider(secretKey, deprecatedWH, psMock.URL, 5*time.Second)
	shipMock := &mockShippingClient{trackingNumber: fmt.Sprintf("TRK-A3-%d", time.Now().UnixNano())}

	svc := finance.NewService(
		pool,
		finance.WithPaymentProvider(billProv),
		finance.WithStorefrontPaymentProvider(sfProv),
		finance.WithShippingClient(shipMock),
	)

	_, err := svc.SetCommercialMode(ctx, "public_paid", user)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `UPDATE commercial_mode_config SET mode = 'controlled_beta' WHERE id = 1`)
	})

	// Setup billing subscription checkout intent
	subj, _, err := svc.ResolveSubjectForWorkspace(ctx, ws)
	require.NoError(t, err)
	plans, err := svc.ListPlans(ctx, "business", nil)
	require.NoError(t, err)
	var paidPlanID int64
	for _, p := range plans {
		if p.PriceMinor > 0 && p.IsAvailable {
			paidPlanID = p.ID
			break
		}
	}
	require.NotZero(t, paidPlanID)
	intent, err := svc.CreateCheckoutIntent(ctx, subj.ID, user, fmt.Sprintf("uni-sub-%d", time.Now().UnixNano()), finance.CreateCheckoutInput{
		PlanVersionID: paidPlanID,
	})
	require.NoError(t, err)
	require.True(t, sawSubscriptionMeta, "billing checkout must tag metadata.kind = subscription")

	// Setup storefront order + payout account + card & VA attempts
	outlet, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
		Name: "Main", LocationType: "outlet", Address: "10 Road, Lagos", IsDefault: true, IsPickupPoint: true,
	})
	require.NoError(t, err)
	item, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name: "Unified Test Service", Kind: "non_stock", SellingPrice: "5000", Currency: "NGN", IdempotencyKey: fmt.Sprintf("uni-item-%d", time.Now().UnixNano()),
	})
	require.NoError(t, err)
	vars, err := svc.ListProductVariants(ctx, ws, item.ID)
	require.NoError(t, err)
	slug := fmt.Sprintf("uni-store-%d", time.Now().UnixNano()%1000000)
	_, err = svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name: "Unified Store", Slug: slug, Currency: "NGN", DefaultOutletID: &outlet.ID,
	})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontSettings(ctx, ws, finance.UpdateStorefrontSettingsInput{
		ContactPhone:    "+2348011110000",
		ContactEmail:    "unified@example.com",
		Address:         "10 Road, Lagos",
		DeliveryMethods: []string{"pickup"},
	})
	require.NoError(t, err)
	sfProd, err := svc.UpsertStorefrontProduct(ctx, ws, vars[0].ID, finance.PublishCatalogueVariantInput{IsPublished: true})
	require.NoError(t, err)
	_, err = svc.SavePayoutAccount(ctx, ws, finance.SavePayoutAccountInput{
		Provider: "paystack", BankCode: "058", AccountNumber: "0123456789", AccountName: "Unified Biz",
	})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontPaymentSettings(ctx, ws, finance.UpdateStorefrontPaymentSettingsInput{
		PaymentBankTransferEnabled:   sfBoolPtr(true),
		PaymentCardEnabled:           sfBoolPtr(true),
		PaymentManualTransferEnabled: sfBoolPtr(true),
	})
	require.NoError(t, err)
	_, err = svc.PublishStorefront(ctx, ws, true)
	require.NoError(t, err)
	sfProds := []finance.MerchantStorefrontProductView{sfProd}

	// Checkout card -> checks metadata.kind=storefront_order
	confCard, err := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey: "uni-c1", CustomerName: "Buyer Card", CustomerEmail: "card@example.com", CustomerPhone: "+2348011111111",
		DeliveryMethod: "pickup", PickupPointID: outlet.ID, PaymentMethod: "card", PolicyAcknowledged: true,
		IdempotencyKey: fmt.Sprintf("uni-card-%d", time.Now().UnixNano()),
		Lines:          []finance.CartLineInput{{StorefrontProductID: sfProds[0].ID, Quantity: "1"}},
	})
	require.NoError(t, err)
	require.True(t, sawStorefrontMetaCard, "card checkout must tag metadata.kind = storefront_order")

	// Checkout VA -> checks metadata.kind=storefront_order
	confVA, err := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey: "uni-c2", CustomerName: "Buyer VA", CustomerEmail: "va@example.com", CustomerPhone: "+2348011111112",
		DeliveryMethod: "pickup", PickupPointID: outlet.ID, PaymentMethod: "virtual_account", PolicyAcknowledged: true,
		IdempotencyKey: fmt.Sprintf("uni-va-%d", time.Now().UnixNano()),
		Lines:          []finance.CartLineInput{{StorefrontProductID: sfProds[0].ID, Quantity: "1"}},
	})
	require.NoError(t, err)
	require.True(t, sawStorefrontMetaVA, "VA checkout must tag metadata.kind = storefront_order")

	var orderCardID, orderVAID int64
	var refCard, refVA string
	var amtCard, amtVA int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT o.id, a.reference, a.amount_minor FROM storefront_orders o JOIN storefront_payment_attempts a ON a.order_id = o.id WHERE o.workspace_id = $1 AND o.order_reference = $2`, ws, confCard.OrderReference).Scan(&orderCardID, &refCard, &amtCard))
	require.NoError(t, pool.QueryRow(ctx, `SELECT o.id, a.reference, a.amount_minor FROM storefront_orders o JOIN storefront_payment_attempts a ON a.order_id = o.id WHERE o.workspace_id = $1 AND o.order_reference = $2`, ws, confVA.OrderReference).Scan(&orderVAID, &refVA, &amtVA))
	_ = item

	signWith := func(key string, body []byte) string {
		mac := hmac.New(sha512.New, []byte(key))
		_, _ = mac.Write(body)
		return hex.EncodeToString(mac.Sum(nil))
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	var actWS, actUser int64 = ws, user
	h := finance.NewHandler(svc, func(c *gin.Context) {
		c.Set(finance.ContextWorkspaceKey, finance.WorkspaceContext{
			WorkspaceID: actWS,
			UserID:      actUser,
			Kind:        "business",
			Permissions: []string{"orders.fulfil", "storefront.manage_checkout", "orders.confirm", "orders.view"},
		})
		c.Next()
	})
	h.RegisterRoutes(r.Group("/api/v1"))

	// Old duplicate storefront Paystack webhook must return 404
	oldReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/paystack", bytes.NewReader([]byte(`{}`)))
	oldW := httptest.NewRecorder()
	r.ServeHTTP(oldW, oldReq)
	require.Equal(t, http.StatusNotFound, oldW.Code)

	// Subscription event signed with deprecated webhook secret (not secretKey) MUST be rejected with 401
	subPayload := []byte(fmt.Sprintf(`{"event":"charge.success","data":{"id":7001,"reference":%q,"amount":%d,"currency":%q,"metadata":{"kind":"subscription"}}}`, intent.Reference, intent.AmountMinor, intent.Currency))
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM provider_events WHERE provider = 'paystack' AND provider_ref = $1`, intent.Reference)
		_, _ = pool.Exec(ctx, `DELETE FROM payment_webhook_events WHERE event_id IN ($1, $2)`, refCard, refVA)
	})
	badSigReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(subPayload))
	badSigReq.Header.Set("x-paystack-signature", signWith(deprecatedWH, subPayload))
	badSigW := httptest.NewRecorder()
	r.ServeHTTP(badSigW, badSigReq)
	require.Equal(t, http.StatusUnauthorized, badSigW.Code, "webhook must verify against PAYSTACK_SECRET_KEY, not deprecated PAYSTACK_WEBHOOK_SECRET")

	// Subscription event signed with PAYSTACK_SECRET_KEY -> activates subscription
	subReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(subPayload))
	subReq.Header.Set("x-paystack-signature", signWith(secretKey, subPayload))
	subW := httptest.NewRecorder()
	r.ServeHTTP(subW, subReq)
	require.Equal(t, http.StatusOK, subW.Code, subW.Body.String())

	var intentSt string
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM checkout_intents WHERE id = $1`, intent.ID).Scan(&intentSt))
	require.Equal(t, "verified", intentSt)

	// Storefront event WITH metadata.kind="storefront_order" on the exact same /webhooks/paystack URL
	sfMetaPayload := []byte(fmt.Sprintf(`{"event":"charge.success","data":{"id":7002,"reference":%q,"amount":%d,"fees":500,"status":"success","metadata":{"kind":"storefront_order","storefront_order_id":%d}}}`, refCard, amtCard, orderCardID))
	sfMetaReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(sfMetaPayload))
	sfMetaReq.Header.Set("x-paystack-signature", signWith(secretKey, sfMetaPayload))
	sfMetaW := httptest.NewRecorder()
	r.ServeHTTP(sfMetaW, sfMetaReq)
	require.Equal(t, http.StatusOK, sfMetaW.Code, sfMetaW.Body.String())

	var payStCard string
	require.NoError(t, pool.QueryRow(ctx, `SELECT payment_status FROM storefront_orders WHERE id = $1`, orderCardID).Scan(&payStCard))
	require.Equal(t, "paid", payStCard)

	// Storefront event WITHOUT metadata -> falls back to storefront_payment_attempts first, then billing
	sfFallbackPayload := []byte(fmt.Sprintf(`{"event":"charge.success","data":{"id":7003,"reference":%q,"amount":%d,"fees":500,"status":"success"}}`, refVA, amtVA))
	sfFallbackReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(sfFallbackPayload))
	sfFallbackReq.Header.Set("x-paystack-signature", signWith(secretKey, sfFallbackPayload))
	sfFallbackW := httptest.NewRecorder()
	r.ServeHTTP(sfFallbackW, sfFallbackReq)
	require.Equal(t, http.StatusOK, sfFallbackW.Code, sfFallbackW.Body.String())

	var payStVA string
	require.NoError(t, pool.QueryRow(ctx, `SELECT payment_status FROM storefront_orders WHERE id = $1`, orderVAID).Scan(&payStVA))
	require.Equal(t, "paid", payStVA)

	// A3: /orders/:id/commands/retry-courier-booking prefix + old route 404 + workspace isolation
	oldRetryReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/storefront/orders/%d/commands/retry-courier-booking", orderCardID), nil)
	oldRetryW := httptest.NewRecorder()
	r.ServeHTTP(oldRetryW, oldRetryReq)
	require.Equal(t, http.StatusNotFound, oldRetryW.Code)

	actWS, actUser = wsOther, otherUser
	crossRetryReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/orders/%d/commands/retry-courier-booking", orderCardID), nil)
	crossRetryW := httptest.NewRecorder()
	r.ServeHTTP(crossRetryW, crossRetryReq)
	require.Equal(t, http.StatusNotFound, crossRetryW.Code)

	actWS, actUser = ws, user
	// Owning workspace succeeds on /orders/:id/commands/retry-courier-booking (200 OK)
	okPrefixReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/orders/%d/commands/retry-courier-booking", orderCardID), nil)
	okPrefixW := httptest.NewRecorder()
	r.ServeHTTP(okPrefixW, okPrefixReq)
	require.Equal(t, http.StatusOK, okPrefixW.Code)
}

func TestPaymentSafetyWebhookRollbackWrongAmountDuplicateLateAndCommission(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "b5-b12-safety")
	wsOther, otherUser := createTestWorkspace(t, pool, "b5-b12-other")
	q := db.New(pool)

	var failOrderIDOnce int64
	emailSpy := &spyEmailProvider{}
	svc := finance.NewService(
		pool,
		finance.WithStorefrontPaymentProvider(&mockPaymentProvider{key: "paystack"}),
		finance.WithPlatformCommissionPercent(5.0),
		finance.WithEmailProvider(emailSpy, "http://localhost:3000/share"),
		finance.WithBeforeMarkPaidCommitHook(func(ctx context.Context, orderID int64) error {
			if failOrderIDOnce != 0 && orderID == failOrderIDOnce {
				failOrderIDOnce = 0 // fail once, succeed on retry
				return errors.New("simulated transient commit failure")
			}
			return nil
		}),
	)

	outlet, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
		Name: "Safety Outlet", LocationType: "outlet", Address: "1 Safety Way, Lagos", IsDefault: true, IsPickupPoint: true,
	})
	require.NoError(t, err)

	item, err := svc.CreateCatalogueItem(ctx, ws, user, finance.CreateCatalogueItemInput{
		Name: "Tracked Camera", Kind: "stock_tracked", SellingPrice: "10000", Currency: "NGN",
		IdempotencyKey: fmt.Sprintf("b5-item-%d", time.Now().UnixNano()),
	})
	require.NoError(t, err)
	vars, err := svc.ListProductVariants(ctx, ws, item.ID)
	require.NoError(t, err)
	variantID := vars[0].ID

	_, err = svc.CreateOpeningStock(ctx, ws, user, finance.CreateOpeningStockInput{
		ProductID: item.ID, LocationID: outlet.ID, EffectiveOn: "2026-11-11",
		Quantity: "20", UnitCost: "4000", Currency: "NGN", Reason: "B5 opening stock",
		IdempotencyKey: fmt.Sprintf("b5-open-%d", time.Now().UnixNano()),
	})
	require.NoError(t, err)

	slug := fmt.Sprintf("b5-store-%d", time.Now().UnixNano()%1000000)
	_, err = svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name: "Safety Store", Slug: slug, DefaultOutletID: &outlet.ID, Currency: "NGN",
	})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontSettings(ctx, ws, finance.UpdateStorefrontSettingsInput{
		ContactPhone: "+2348099990000", ContactEmail: "safety@example.com", Address: "1 Safety Way",
		DeliveryMethods: []string{"pickup"},
	})
	require.NoError(t, err)
	sfProd, err := svc.UpsertStorefrontProduct(ctx, ws, variantID, finance.PublishCatalogueVariantInput{IsPublished: true})
	require.NoError(t, err)
	_, err = svc.SavePayoutAccount(ctx, ws, finance.SavePayoutAccountInput{
		Provider: "paystack", BankCode: "058", AccountNumber: "0123456789", AccountName: "Safety Biz",
	})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontPaymentSettings(ctx, ws, finance.UpdateStorefrontPaymentSettingsInput{
		PaymentBankTransferEnabled:   sfBoolPtr(true),
		PaymentCardEnabled:           sfBoolPtr(true),
		PaymentManualTransferEnabled: sfBoolPtr(true),
	})
	require.NoError(t, err)
	_, err = svc.PublishStorefront(ctx, ws, true)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	var actWS, actUser int64 = ws, user
	h := finance.NewHandler(svc, func(c *gin.Context) {
		c.Set(finance.ContextWorkspaceKey, finance.WorkspaceContext{
			WorkspaceID: actWS,
			UserID:      actUser,
			Kind:        "business",
			Permissions: []string{"orders.confirm", "orders.cancel", "orders.fulfil", "orders.view"},
		})
		c.Next()
	})
	h.RegisterRoutes(r.Group("/api/v1"))

	newVAOrder := func(tag string, qty string) (int64, string, int64) {
		conf, cErr := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
			ClientKey: "b5-cli-" + tag, CustomerName: "Buyer " + tag, CustomerEmail: tag + "@example.com", CustomerPhone: "+2348012345678",
			DeliveryMethod: "pickup", PickupPointID: outlet.ID, PaymentMethod: "virtual_account", PolicyAcknowledged: true,
			IdempotencyKey: fmt.Sprintf("b5-ord-%s-%d", tag, time.Now().UnixNano()),
			Lines:          []finance.CartLineInput{{StorefrontProductID: sfProd.ID, Quantity: qty}},
		})
		require.NoError(t, cErr)
		var ordID, amt int64
		var ref string
		require.NoError(t, pool.QueryRow(ctx, `
			SELECT o.id, a.reference, a.amount_minor
			FROM storefront_orders o
			JOIN storefront_payment_attempts a ON a.order_id = o.id
			WHERE o.workspace_id = $1 AND o.order_reference = $2
		`, ws, conf.OrderReference).Scan(&ordID, &ref, &amt))
		return ordID, ref, amt
	}

	postPaystackWH := func(event string, ref string, amount, fees int64) *httptest.ResponseRecorder {
		payload := []byte(fmt.Sprintf(`{"event":%q,"data":{"reference":%q,"amount":%d,"fees":%d,"status":"success"}}`, event, ref, amount, fees))
		req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/paystack", bytes.NewReader(payload))
		req.Header.Set("x-paystack-signature", signMockWebhook(payload))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// --- B5 + B11 + B12: Webhook failure rolls back payment_webhook_events; retry succeeds & posts 5% commission balanced ledger + formatted receipt ---
	ord1, ref1, amt1 := newVAOrder("rollback", "1")
	require.Equal(t, int64(1000000), amt1) // NGN 10,000.00
	failOrderIDOnce = ord1

	wFail := postPaystackWH("charge.success", ref1, amt1, 15000)
	require.Equal(t, http.StatusBadRequest, wFail.Code, "first attempt should fail via simulated commit hook")

	var whCount int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM payment_webhook_events WHERE provider = 'paystack' AND event_id LIKE '%' || $1`, ref1).Scan(&whCount))
	require.Equal(t, 0, whCount, "failed webhook must roll back payment_webhook_events row so retry works")

	// Provider retry succeeds!
	wRetry := postPaystackWH("charge.success", ref1, amt1, 15000)
	require.Equal(t, http.StatusOK, wRetry.Code, wRetry.Body.String())

	var paySt1 string
	var saleID1 *int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT payment_status, linked_sale_id FROM storefront_orders WHERE id = $1`, ord1).Scan(&paySt1, &saleID1))
	require.Equal(t, "paid", paySt1)
	require.NotNil(t, saleID1)

	// B11: Verify 5% commission line (50000 kobo) and debits == credits (1000000 kobo)
	var totDeb, totCred, commDebit, clearingDebit int64
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT COALESCE(sum(ll.debit_minor), 0),
		       COALESCE(sum(ll.credit_minor), 0),
		       COALESCE(sum(ll.debit_minor) FILTER (WHERE ll.description = 'Rekordly commission'), 0),
		       COALESCE(sum(ll.debit_minor) FILTER (WHERE ll.account_class = 'asset'), 0)
		FROM ledger_lines ll
		JOIN ledger_entries le ON le.id = ll.ledger_entry_id
		WHERE le.workspace_id = $1 AND le.source_type = 'sale' AND le.source_id = $2
	`, ws, *saleID1).Scan(&totDeb, &totCred, &commDebit, &clearingDebit))
	require.Equal(t, int64(1000000), totDeb)
	require.Equal(t, int64(1000000), totCred)
	require.Equal(t, int64(50000), commDebit, "5% Rekordly commission must be posted as an expense line")
	require.Equal(t, int64(935000), clearingDebit, "clearing receives amount - fee - commission")

	// B12: Verify receipt email formatted with FormatMinorToMajor
	require.GreaterOrEqual(t, emailSpy.count(), 1)
	require.Contains(t, emailSpy.last().HTMLBody, "NGN 10000.00")

	// --- B6: bank.transfer.rejected followed by charge.success on the SAME reference ---
	ord2, ref2, amt2 := newVAOrder("rej-then-ok", "1")
	wRej := postPaystackWH("bank.transfer.rejected", ref2, amt2, 0)
	require.Equal(t, http.StatusOK, wRej.Code)
	var attSt2 string
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM storefront_payment_attempts WHERE reference = $1`, ref2).Scan(&attSt2))
	require.Equal(t, "rejected", attSt2)

	wSuccAfterRej := postPaystackWH("charge.success", ref2, amt2, 15000)
	require.Equal(t, http.StatusOK, wSuccAfterRej.Code)
	var ordSt2 string
	require.NoError(t, pool.QueryRow(ctx, `SELECT payment_status FROM storefront_orders WHERE id = $1`, ord2).Scan(&ordSt2))
	require.Equal(t, "paid", ordSt2, "charge.success after bank.transfer.rejected on same reference must be processed")

	// --- B7: Wrong amount by bank transfer -> HTTP 200, paid_wrong_amount, no revenue, paid_needs_attention, merchant resolve ---
	ord3, ref3, amt3 := newVAOrder("wrong-amt-accept", "1")
	wWrong := postPaystackWH("charge.success", ref3, amt3-250000, 10000) // paid ₦7,500 instead of ₦10,000
	require.Equal(t, http.StatusOK, wWrong.Code, "wrong amount must return 200 so provider does not retry forever")

	var attSt3 string
	var recvAmt3 *int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT status, received_amount_minor FROM storefront_payment_attempts WHERE reference = $1`, ref3).Scan(&attSt3, &recvAmt3))
	require.Equal(t, "paid_wrong_amount", attSt3)
	require.NotNil(t, recvAmt3)
	require.Equal(t, int64(750000), *recvAmt3)

	mOrd3, err := svc.GetMerchantOrder(ctx, ws, ord3)
	require.NoError(t, err)
	require.Equal(t, "paid_needs_attention", mOrd3.PaymentStatus)
	require.Nil(t, mOrd3.LinkedSaleID, "wrong amount must not post a sale before merchant resolution")
	require.NotNil(t, mOrd3.PaymentAttentionReason)
	require.Equal(t, "wrong_amount", *mOrd3.PaymentAttentionReason)
	require.NotNil(t, mOrd3.PaymentAttentionMessage)
	require.Contains(t, *mOrd3.PaymentAttentionMessage, "Customer paid ₦7500.00, order is ₦10000.00")

	// Cross-workspace isolation on resolve-payment-attention -> 404
	actWS, actUser = wsOther, otherUser
	crossResReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/orders/%d/commands/resolve-payment-attention", ord3), bytes.NewReader([]byte(`{"action":"accept_as_paid"}`)))
	crossResReq.Header.Set("Content-Type", "application/json")
	crossResW := httptest.NewRecorder()
	r.ServeHTTP(crossResW, crossResReq)
	require.Equal(t, http.StatusNotFound, crossResW.Code)
	actWS, actUser = ws, user

	// Merchant accepts wrong-amount payment as paid -> posts balanced sale for received amount
	okResReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/orders/%d/commands/resolve-payment-attention", ord3), bytes.NewReader([]byte(`{"action":"accept_as_paid","note":"Customer granted discount"}`)))
	okResReq.Header.Set("Content-Type", "application/json")
	okResW := httptest.NewRecorder()
	r.ServeHTTP(okResW, okResReq)
	require.Equal(t, http.StatusOK, okResW.Code, okResW.Body.String())

	mOrd3Resolved, err := svc.GetMerchantOrder(ctx, ws, ord3)
	require.NoError(t, err)
	require.Equal(t, "paid", mOrd3Resolved.PaymentStatus)
	require.NotNil(t, mOrd3Resolved.LinkedSaleID)
	require.Nil(t, mOrd3Resolved.PaymentAttentionReason)

	// Second wrong-amount order resolved via cancel_with_refund -> releases stock & marks cancelled/refunded
	ord3Cancel, ref3Cancel, amt3Cancel := newVAOrder("wrong-amt-cancel", "1")
	require.Equal(t, http.StatusOK, postPaystackWH("charge.success", ref3Cancel, amt3Cancel-500000, 5000).Code)
	cancelResView, err := svc.ResolveStorefrontOrderPaymentAttention(ctx, ws, user, ord3Cancel, finance.ResolvePaymentAttentionInput{
		Action: "cancel_with_refund",
		Note:   "Refunded ₦5,000 to customer account",
	})
	require.NoError(t, err)
	require.Equal(t, "cancelled", cancelResView.CommercialStatus)
	require.Equal(t, "refunded", cancelResView.PaymentStatus)
	require.Equal(t, "unreserved", cancelResView.FulfilmentStatus)

	// --- B8: Paid twice (duplicate payment by second attempt) -> flagged duplicate_payment, revenue posted ONCE, ledger balances ---
	ord4, ref4A, amt4 := newVAOrder("dup-pay", "1")
	require.Equal(t, http.StatusOK, postPaystackWH("charge.success", ref4A, amt4, 15000).Code)

	ref4B := fmt.Sprintf("att_dup_second_%d", time.Now().UnixNano())
	_, err = q.CreateStorefrontPaymentAttempt(ctx, db.CreateStorefrontPaymentAttemptParams{
		WorkspaceID:     ws,
		OrderID:         ord4,
		Provider:        "paystack",
		Method:          "card",
		Reference:       ref4B,
		AmountMinor:     amt4,
		FeeMinor:        15000,
		CommissionMinor: 50000,
		ExpiresAt:       pgtype.Timestamptz{Time: time.Now().UTC().Add(15 * time.Minute), Valid: true},
		Status:          "pending",
	})
	require.NoError(t, err)

	wDup := postPaystackWH("charge.success", ref4B, amt4, 15000)
	require.Equal(t, http.StatusOK, wDup.Code, wDup.Body.String())

	var att4BStatus string
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM storefront_payment_attempts WHERE reference = $1`, ref4B).Scan(&att4BStatus))
	require.Equal(t, "duplicate_payment", att4BStatus)

	var saleCount4 int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM sales WHERE workspace_id = $1 AND storefront_order_id = $2`, ws, ord4).Scan(&saleCount4))
	require.Equal(t, 1, saleCount4, "duplicate payment must never create a second Sale or post revenue twice")

	mOrd4, err := svc.GetMerchantOrder(ctx, ws, ord4)
	require.NoError(t, err)
	require.Equal(t, "paid_needs_attention", mOrd4.PaymentStatus)
	require.NotNil(t, mOrd4.PaymentAttentionReason)
	require.Equal(t, "duplicate_payment", *mOrd4.PaymentAttentionReason)
	require.NotNil(t, mOrd4.PaymentAttentionMessage)
	require.Equal(t, "Paid twice: refund one", *mOrd4.PaymentAttentionMessage)

	// --- B9: Late payment arriving AFTER reservation_expires_at but BEFORE expiry job runs must NOT double-reserve ---
	var resBefore decimal.Decimal
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity FROM inventory_balances WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4`, ws, outlet.ID, item.ID, variantID).Scan(&resBefore))

	ord5, ref5, amt5 := newVAOrder("late-active-hold", "2")

	var resDuringHold decimal.Decimal
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity FROM inventory_balances WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4`, ws, outlet.ID, item.ID, variantID).Scan(&resDuringHold))
	require.True(t, resBefore.Add(decimal.NewFromInt(2)).Equal(resDuringHold), "checkout must reserve 2 units")

	// Backdate reservation_expires_at into the past WITHOUT running ExpireStaleStorefrontReservations (hold is still 'active')
	_, err = pool.Exec(ctx, `UPDATE storefront_orders SET reservation_expires_at = now() - interval '20 minutes' WHERE id = $1`, ord5)
	require.NoError(t, err)

	wLateActive := postPaystackWH("charge.success", ref5, amt5, 15000)
	require.Equal(t, http.StatusOK, wLateActive.Code, wLateActive.Body.String())

	var resAfterLatePaid decimal.Decimal
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity FROM inventory_balances WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4`, ws, outlet.ID, item.ID, variantID).Scan(&resAfterLatePaid))
	require.True(t, resDuringHold.Equal(resAfterLatePaid), "late payment on still-active hold must make hold firm and NOT double reserved_quantity")

	var firmExp *time.Time
	require.NoError(t, pool.QueryRow(ctx, `SELECT expires_at FROM stock_reservations WHERE workspace_id = $1 AND order_id = $2`, ws, ord5).Scan(&firmExp))
	require.Nil(t, firmExp, "active hold must become firm (expires_at = NULL)")
}

func TestPayOnDeliveryConfirmSurvivesExpiryPickupWindowAndVariantsConfirm(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "c13-c14-pod-variants")

	svc := finance.NewService(pool)

	outlet1, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
		Name: "Ikeja Outlet", LocationType: "outlet", Address: "10 Ikeja Way", IsDefault: true, IsPickupPoint: true,
	})
	require.NoError(t, err)
	outlet2, err := svc.CreateOutlet(ctx, ws, user, finance.CreateOutletInput{
		Name: "Lekki Outlet", LocationType: "outlet", Address: "20 Lekki Way", IsDefault: false, IsPickupPoint: true,
	})
	require.NoError(t, err)

	// Product with 2 variants across 2 outlets
	var prodID, varA, varB int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO products (workspace_id, name, kind, unit_name, status, show_on_store, idempotency_key)
		VALUES ($1, 'Designer Sneaker', 'stock_tracked', 'pair', 'active', true, $2)
		RETURNING id
	`, ws, fmt.Sprintf("c13-prod-%d", time.Now().UnixNano())).Scan(&prodID))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO product_variants (workspace_id, product_id, name, is_default, is_active, currency, currency_exponent, selling_price_minor)
		VALUES ($1, $2, 'Size 41', true, true, 'NGN', 2, 3000000)
		RETURNING id
	`, ws, prodID).Scan(&varA))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO product_variants (workspace_id, product_id, name, is_default, is_active, currency, currency_exponent, selling_price_minor)
		VALUES ($1, $2, 'Size 43', false, true, 'NGN', 2, 3200000)
		RETURNING id
	`, ws, prodID).Scan(&varB))

	// Stock balances:
	// Outlet 1: VarA = 5, VarB = 5
	// Outlet 2: VarA = 0, VarB = 4
	_, err = pool.Exec(ctx, `
		INSERT INTO inventory_balances (workspace_id, location_id, product_id, variant_id, quantity_on_hand, reserved_quantity, value_on_hand_minor)
		VALUES
			($1, $2, $4, $5, 5, 0, 5000000),
			($1, $2, $4, $6, 5, 0, 5000000),
			($1, $3, $4, $5, 0, 0, 0),
			($1, $3, $4, $6, 4, 0, 4000000)
	`, ws, outlet1.ID, outlet2.ID, prodID, varA, varB)
	require.NoError(t, err)

	slug := fmt.Sprintf("pod-var-store-%d", time.Now().UnixNano()%1000000)
	_, err = svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name: "POD & Variants Store", Slug: slug, DefaultOutletID: &outlet1.ID, Currency: "NGN",
	})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontSettings(ctx, ws, finance.UpdateStorefrontSettingsInput{
		ContactPhone: "+2348055556666", ContactEmail: "pod@example.com", Address: "10 Ikeja Way",
		DeliveryMethods: []string{"merchant_delivery", "pickup"},
	})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontPaymentSettings(ctx, ws, finance.UpdateStorefrontPaymentSettingsInput{
		PaymentCodEnabled:            sfBoolPtr(true),
		PaymentManualTransferEnabled: sfBoolPtr(true),
	})
	require.NoError(t, err)
	sfProdA, err := svc.UpsertStorefrontProduct(ctx, ws, varA, finance.PublishCatalogueVariantInput{IsPublished: true})
	require.NoError(t, err)
	sfProdB, err := svc.UpsertStorefrontProduct(ctx, ws, varB, finance.PublishCatalogueVariantInput{IsPublished: true})
	require.NoError(t, err)
	_, err = svc.PublishStorefront(ctx, ws, true)
	require.NoError(t, err)

	// --- C13: Pay-on-delivery checkout starts in request_received with 2h awaiting_confirmation hold ---
	podConf1, err := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey: "pod-c1", CustomerName: "POD Confirmed Buyer", CustomerPhone: "+2348011112222", CustomerEmail: "pod1@example.com",
		DeliveryMethod: "merchant_delivery", DeliveryAddress: "15 Allen Ave, Ikeja", PaymentMethod: "cod",
		PolicyAcknowledged: true, IdempotencyKey: fmt.Sprintf("pod-1-%d", time.Now().UnixNano()),
		Lines: []finance.CartLineInput{{StorefrontProductID: sfProdA.ID, Quantity: "1"}},
	})
	require.NoError(t, err)
	require.Equal(t, "request_received", podConf1.CommercialStatus, "POD delivery checkout must set commercial_status = request_received")
	require.NotNil(t, podConf1.HoldType)
	require.Equal(t, "awaiting_confirmation", *podConf1.HoldType)
	require.NotNil(t, podConf1.HoldExpiresAt)

	var podOrd1ID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM storefront_orders WHERE workspace_id = $1 AND order_reference = $2`, ws, podConf1.OrderReference).Scan(&podOrd1ID))

	// Check reserved_quantity on (outlet1, varA) is 1 right after checkout
	var resOut1VarA decimal.Decimal
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity FROM inventory_balances WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4`, ws, outlet1.ID, prodID, varA).Scan(&resOut1VarA))
	require.True(t, decimal.NewFromInt(1).Equal(resOut1VarA))

	// Merchant confirms POD order 1 within 2h -> makes existing hold firm (clears expiry) without reserving again!
	podDetail1, err := svc.GetMerchantOrder(ctx, ws, podOrd1ID)
	require.NoError(t, err)
	confirmedPod1, err := svc.ConfirmStorefrontOrder(ctx, ws, user, podOrd1ID, finance.ConfirmOrderInput{
		ExpectedVersion: podDetail1.Version,
		OutletID:        outlet1.ID,
	})
	require.NoError(t, err)
	require.Equal(t, "confirmed", confirmedPod1.CommercialStatus)
	require.Nil(t, confirmedPod1.ReservationExpiresAt, "confirming POD order must clear reservation_expires_at so expiry job will not cancel it")

	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity FROM inventory_balances WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4`, ws, outlet1.ID, prodID, varA).Scan(&resOut1VarA))
	require.True(t, decimal.NewFromInt(1).Equal(resOut1VarA), "ConfirmStorefrontOrder on order with checkout hold must NOT reserve a second time")

	// Place a second POD order that is NOT confirmed by the merchant
	podConf2, err := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey: "pod-c2", CustomerName: "POD Unconfirmed Buyer", CustomerPhone: "+2348011113333", CustomerEmail: "pod2@example.com",
		DeliveryMethod: "merchant_delivery", DeliveryAddress: "22 Opebi Rd, Ikeja", PaymentMethod: "cod",
		PolicyAcknowledged: true, IdempotencyKey: fmt.Sprintf("pod-2-%d", time.Now().UnixNano()),
		Lines: []finance.CartLineInput{{StorefrontProductID: sfProdA.ID, Quantity: "1"}},
	})
	require.NoError(t, err)
	var podOrd2ID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM storefront_orders WHERE workspace_id = $1 AND order_reference = $2`, ws, podConf2.OrderReference).Scan(&podOrd2ID))

	// Simulate 2+ hours passing on unconfirmed POD order 2 and run expiry sweep
	_, err = pool.Exec(ctx, `UPDATE storefront_orders SET reservation_expires_at = now() - interval '5 minutes' WHERE id = $1`, podOrd2ID)
	require.NoError(t, err)

	_, err = svc.ExpireStaleStorefrontReservations(ctx)
	require.NoError(t, err)

	// Confirmed POD order 1 SURVIVES; unconfirmed POD order 2 is CANCELLED and its stock released
	afterPod1, err := svc.GetMerchantOrder(ctx, ws, podOrd1ID)
	require.NoError(t, err)
	require.Equal(t, "confirmed", afterPod1.CommercialStatus, "confirmed POD order must survive expiry job")

	afterPod2, err := svc.GetMerchantOrder(ctx, ws, podOrd2ID)
	require.NoError(t, err)
	require.Equal(t, "cancelled", afterPod2.CommercialStatus, "unconfirmed POD order must be cancelled after 2h")

	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity FROM inventory_balances WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4`, ws, outlet1.ID, prodID, varA).Scan(&resOut1VarA))
	require.True(t, decimal.NewFromInt(1).Equal(resOut1VarA), "unconfirmed POD order's reservation must be released while confirmed POD order's 1 unit stays reserved")

	// --- C13: Pickup order keeps pickup window on Ready for pickup; manual Mark paid clears expiry ---
	pickupConf, err := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey: "pk-c1", CustomerName: "Pickup Buyer", CustomerPhone: "+2348011114444", CustomerEmail: "pk@example.com",
		DeliveryMethod: "pickup", PickupPointID: outlet1.ID, PaymentMethod: "cod",
		PolicyAcknowledged: true, IdempotencyKey: fmt.Sprintf("pk-1-%d", time.Now().UnixNano()),
		Lines: []finance.CartLineInput{{StorefrontProductID: sfProdA.ID, Quantity: "1"}},
	})
	require.NoError(t, err)
	var pickupOrdID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM storefront_orders WHERE workspace_id = $1 AND order_reference = $2`, ws, pickupConf.OrderReference).Scan(&pickupOrdID))

	pkOrd, err := svc.GetMerchantOrder(ctx, ws, pickupOrdID)
	require.NoError(t, err)
	readyOrd, err := svc.ReadyForPickupStorefrontOrder(ctx, ws, user, pickupOrdID, pkOrd.Version)
	require.NoError(t, err)
	require.Equal(t, "packed", readyOrd.FulfilmentStatus)
	require.NotNil(t, readyOrd.ReservationExpiresAt, "Ready for pickup must preserve the pickup window expiry until collected")

	// Manual transfer order: Mark paid clears reservation_expires_at
	manualConf, err := svc.SubmitGuestCheckout(ctx, slug, false, finance.GuestCheckoutInput{
		ClientKey: "man-c1", CustomerName: "Manual Transfer Buyer", CustomerPhone: "+2348011115555", CustomerEmail: "man@example.com",
		DeliveryMethod: "merchant_delivery", DeliveryAddress: "88 Victoria Island", PaymentMethod: "manual_transfer",
		PolicyAcknowledged: true, IdempotencyKey: fmt.Sprintf("man-1-%d", time.Now().UnixNano()),
		Lines: []finance.CartLineInput{{StorefrontProductID: sfProdA.ID, Quantity: "1"}},
	})
	require.NoError(t, err)
	var manualOrdID, bankAccID int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM storefront_orders WHERE workspace_id = $1 AND order_reference = $2`, ws, manualConf.OrderReference).Scan(&manualOrdID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO money_accounts (workspace_id, name, account_type, currency) VALUES ($1, 'Zenith Bank', 'bank', 'NGN') RETURNING id`, ws).Scan(&bankAccID))

	require.NoError(t, svc.MarkStorefrontOrderPaidManual(ctx, ws, manualOrdID, bankAccID, "Bank transfer verified"))
	manAfter, err := svc.GetMerchantOrder(ctx, ws, manualOrdID)
	require.NoError(t, err)
	require.Equal(t, "paid", manAfter.PaymentStatus)
	require.Nil(t, manAfter.ReservationExpiresAt, "manual Mark paid must clear reservation_expires_at")

	// --- C14: ConfirmStorefrontOrder respects per-variant stock at the selected outlet ---
	// Create an unreserved request_received order for Variant B (Size 43), qty 2, and confirm it at Outlet 2
	// Note: at Outlet 2, Variant A has 0 stock while Variant B has 4 stock!
	var varOrderID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO storefront_orders (
			workspace_id, storefront_id, order_reference, public_token_hash, outlet_id,
			commercial_status, fulfilment_status, payment_status, currency, currency_exponent,
			subtotal_minor, tax_minor, delivery_fee_minor, total_minor, delivery_method,
			customer_name, customer_phone, idempotency_key
		) VALUES (
			$1, (SELECT id FROM storefronts WHERE workspace_id = $1), 'ORD-VAR-C14', 'hash-var-c14', $2,
			'request_received', 'unreserved', 'unpaid', 'NGN', 2,
			6400000, 0, 0, 6400000, 'merchant_delivery',
			'Variant Buyer', '+2348099991111', $3
		) RETURNING id
	`, ws, outlet2.ID, fmt.Sprintf("idemp-var-c14-%d", time.Now().UnixNano())).Scan(&varOrderID))

	_, err = pool.Exec(ctx, `
		INSERT INTO storefront_order_lines (
			workspace_id, order_id, storefront_product_id, product_id, variant_id,
			product_kind, title_snapshot, variant_snapshot, unit_name,
			requested_quantity, confirmed_quantity, unit_price_minor, line_total_minor
		) VALUES (
			$1, $2, $3, $4, $5,
			'stock_tracked', 'Designer Sneaker', 'Size 43', 'pair',
			2, 2, 3200000, 6400000
		)
	`, ws, varOrderID, sfProdB.ID, prodID, varB)
	require.NoError(t, err)

	confirmedVarOrd, err := svc.ConfirmStorefrontOrder(ctx, ws, user, varOrderID, finance.ConfirmOrderInput{
		ExpectedVersion: 1,
		OutletID:        outlet2.ID,
	})
	require.NoError(t, err)
	require.Equal(t, "confirmed", confirmedVarOrd.CommercialStatus)
	require.Equal(t, "reserved", confirmedVarOrd.FulfilmentStatus)

	var resOut2VarA, resOut2VarB, resOut1VarB decimal.Decimal
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity FROM inventory_balances WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4`, ws, outlet2.ID, prodID, varA).Scan(&resOut2VarA))
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity FROM inventory_balances WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4`, ws, outlet2.ID, prodID, varB).Scan(&resOut2VarB))
	require.NoError(t, pool.QueryRow(ctx, `SELECT reserved_quantity FROM inventory_balances WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3 AND variant_id = $4`, ws, outlet1.ID, prodID, varB).Scan(&resOut1VarB))

	require.True(t, resOut2VarA.IsZero(), "Variant A at Outlet 2 must remain 0 reserved")
	require.True(t, decimal.NewFromInt(2).Equal(resOut2VarB), "Variant B at Outlet 2 must have 2 reserved")
	require.True(t, resOut1VarB.IsZero(), "Variant B at Outlet 1 must remain 0 reserved")
}
