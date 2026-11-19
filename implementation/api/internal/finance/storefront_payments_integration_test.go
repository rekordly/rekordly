package finance_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
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
		WorkspaceID:           ws,
		OrderID:               orderID,
		Provider:              "paystack",
		Method:                "virtual_account",
		Reference:             attemptRef,
		AmountMinor:           1275000,
		FeeMinor:              19125, // 1.5% fee
		CommissionMinor:       0,
		VirtualAccountNumber: pgtype.Text{String: "9988776655", Valid: true},
		BankName:              pgtype.Text{String: "Wema Bank", Valid: true},
		ExpiresAt:             pgtype.Timestamptz{Time: time.Now().UTC().Add(15 * time.Minute), Valid: true},
		Status:                "pending",
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
