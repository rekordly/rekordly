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

	// Setup webhook router
	gin.SetMode(gin.TestMode)
	h := finance.NewHandler(svc, nil)
	r := gin.New()
	h.RegisterStorefrontPaymentWebhookRoutes(r.Group("/api/v1"))

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

	// 1. Send webhook with invalid signature -> 401
	badReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/paystack", bytes.NewReader(bodyBytes))
	badReq.Header.Set("x-paystack-signature", "wrong_signature")
	badRec := httptest.NewRecorder()
	r.ServeHTTP(badRec, badReq)
	require.Equal(t, http.StatusUnauthorized, badRec.Code)

	// 2. Send valid webhook -> 200
	goodReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/paystack", bytes.NewReader(bodyBytes))
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
	replayReq := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/paystack", bytes.NewReader(bodyBytes))
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
	h.RegisterStorefrontPaymentWebhookRoutes(r.Group("/api/v1"))

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
	reqA := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/paystack", bytes.NewReader(bodyBytesA))
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
	reqB := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/paystack", bytes.NewReader(bodyBytesB))
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

	// 2. Valid signature but amount mismatch -> rejected (400), order stays unpaid
	mismatchPayload := []byte(fmt.Sprintf(`{"Event":"charge_successful","TransactionRef":"%s","Body":{"transaction_ref":"%s","amount":%d,"transaction_status":"Success"}}`, attemptRef, attemptRef, attemptAmt-1000))
	reqMismatch := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/squad", bytes.NewReader(mismatchPayload))
	reqMismatch.Header.Set("x-squad-encrypted-body", signSquad(mismatchPayload))
	wMismatch := httptest.NewRecorder()
	router.ServeHTTP(wMismatch, reqMismatch)
	require.Equal(t, http.StatusBadRequest, wMismatch.Code)

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
	reqPay := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/payments/paystack", bytes.NewReader(payPayload))
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
