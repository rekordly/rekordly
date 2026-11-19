package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestPaystackProvider(t *testing.T) {
	secretKey := "sk_test_paystack_secret"
	webhookSecret := "whsec_test_secret"

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer "+secretKey, r.Header.Get("Authorization"))

		switch r.URL.Path {
		case "/bank":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{
				"status": true,
				"message": "Banks retrieved",
				"data": [
					{"name": "Access Bank", "code": "044", "active": true},
					{"name": "GTBank", "code": "058", "active": true},
					{"name": "Old Bank", "code": "999", "active": false}
				]
			}`))
		case "/bank/resolve":
			acc := r.URL.Query().Get("account_number")
			if acc == "0123456789" {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{
					"status": true,
					"message": "Account resolved",
					"data": {"account_name": "JOHN DOE", "account_number": "0123456789"}
				}`))
			} else {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"status": false, "message": "Could not resolve account"}`))
			}
		case "/subaccount":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{
				"status": true,
				"message": "Subaccount created",
				"data": {"subaccount_code": "ACCT_test123", "id": 1001}
			}`))
		case "/charge":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{
				"status": true,
				"message": "Charge attempted",
				"data": {
					"status": "pay_offline",
					"authorization": {
						"account_number": "9912345678",
						"bank": "Wema Bank",
						"account_name": "Rekordly / Demo",
						"account_expires_at": "2026-11-18T20:30:00Z"
					}
				}
			}`))
		case "/transaction/initialize":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{
				"status": true,
				"message": "Authorization URL created",
				"data": {
					"authorization_url": "https://checkout.paystack.com/auth123",
					"access_code": "acc123",
					"reference": "ref123"
				}
			}`))
		case "/transaction/verify/ref123":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{
				"status": true,
				"message": "Verification successful",
				"data": {
					"reference": "ref123",
					"status": "success",
					"amount": 500000,
					"fees": 7500,
					"channel": "bank_transfer",
					"paid_at": "2026-11-18T19:00:00Z"
				}
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer ts.Close()

	provider := NewPaystackProvider(secretKey, webhookSecret, ts.URL, 5*time.Second)
	ctx := context.Background()

	// ListBanks
	banks, err := provider.ListBanks(ctx)
	require.NoError(t, err)
	require.Len(t, banks, 2)
	require.Equal(t, "044", banks[0].Code)

	// ResolveBankAccount
	name, err := provider.ResolveBankAccount(ctx, "058", "0123456789")
	require.NoError(t, err)
	require.Equal(t, "JOHN DOE", name)

	_, err = provider.ResolveBankAccount(ctx, "058", "0000000000")
	require.Error(t, err)

	// CreateSubaccount
	sub, err := provider.CreateSubaccount(ctx, MerchantPayoutAccount{
		BankCode:      "058",
		AccountNumber: "0123456789",
		AccountName:   "JOHN DOE",
		BusinessName:  "John Store",
	})
	require.NoError(t, err)
	require.Equal(t, "ACCT_test123", sub.Code)

	// CreateOrderVirtualAccount
	va, err := provider.CreateOrderVirtualAccount(ctx, OrderPaymentRequest{
		AmountMinor:   500000,
		Currency:      "NGN",
		Reference:     "order_ref_1",
		CustomerEmail: "customer@example.com",
		CustomerName:  "Jane",
		SubaccountRef: sub.Code,
		FeeBearer:     "merchant",
		ExpiresAt:     time.Now().Add(15 * time.Minute),
	})
	require.NoError(t, err)
	require.Equal(t, "9912345678", va.AccountNumber)
	require.Equal(t, "Wema Bank", va.BankName)

	// InitializeCardCheckout
	co, err := provider.InitializeCardCheckout(ctx, OrderPaymentRequest{
		AmountMinor:   500000,
		Currency:      "NGN",
		Reference:     "order_ref_1",
		CustomerEmail: "customer@example.com",
		SubaccountRef: sub.Code,
	})
	require.NoError(t, err)
	require.Equal(t, "https://checkout.paystack.com/auth123", co.AuthorizationURL)

	// VerifyTransaction
	pr, err := provider.VerifyTransaction(ctx, "ref123")
	require.NoError(t, err)
	require.Equal(t, "paid", pr.Status)
	require.Equal(t, int64(500000), pr.AmountMinor)
	require.Equal(t, int64(7500), pr.FeeMinor)

	// VerifyWebhook
	webhookPayload := []byte(`{
		"event": "charge.success",
		"data": {
			"reference": "ref123",
			"amount": 500000,
			"fees": 7500,
			"status": "success",
			"paid_at": "2026-11-18T19:00:00Z",
			"channel": "bank_transfer"
		}
	}`)
	mac := hmac.New(sha512.New, []byte(webhookSecret))
	_, _ = mac.Write(webhookPayload)
	sig := hex.EncodeToString(mac.Sum(nil))

	headers := http.Header{}
	headers.Set("x-paystack-signature", sig)

	ev, err := provider.VerifyWebhook(webhookPayload, headers)
	require.NoError(t, err)
	require.Equal(t, "charge.success", ev.Type)
	require.Equal(t, "ref123", ev.Reference)
	require.Equal(t, "paid", ev.Status)
	require.Equal(t, int64(500000), ev.AmountMinor)
	require.Equal(t, int64(7500), ev.FeeMinor)

	// Bad signature
	badHeaders := http.Header{}
	badHeaders.Set("x-paystack-signature", "wrong_signature")
	_, err = provider.VerifyWebhook(webhookPayload, badHeaders)
	require.ErrorIs(t, err, ErrInvalidWebhookSig)
}
