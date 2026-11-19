package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func signSquadBody(secret string, body []byte) string {
	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func TestSquadProviderAPIsAndMethodSupport(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer sq_test_secret", r.Header.Get("Authorization"))
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/payout/account/lookup":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  200,
				"success": true,
				"data": map[string]any{
					"account_name":   "ZAINAB STORES LTD",
					"account_number": "0123456789",
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/merchant/create-sub-users":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  200,
				"success": true,
				"data": map[string]any{
					"sub_merchant_id": "SQD_SUB_777",
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/transaction/initiate":
			var body map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			require.Equal(t, float64(500000), body["amount"])
			require.Equal(t, "NGN", body["currency"])
			require.Equal(t, "SQD_SUB_777", body["sub_merchant_id"])
			require.Equal(t, true, body["pass_charge"])
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  200,
				"success": true,
				"data": map[string]any{
					"checkout_url":    "https://pay.squadco.com/chk_123",
					"transaction_ref": body["transaction_ref"],
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/transaction/verify/att_sq_1":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  200,
				"success": true,
				"data": map[string]any{
					"transaction_ref":    "att_sq_1",
					"transaction_amount": 500000,
					"merchant_amount":    492500,
					"transaction_status": "Success",
					"transaction_type":   "Card",
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/virtual-account":
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  403,
				"success": false,
				"message": "Dynamic virtual account pool not enabled for merchant",
			})
		default:
			t.Fatalf("unexpected squad request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer srv.Close()

	p := NewSquadProvider("sq_test_secret", "sq_wh_secret", srv.URL, 5*time.Second)
	require.Equal(t, "squad", p.Key())
	require.True(t, p.IsConfigured())
	require.True(t, ProviderSupportsMethod(p, "card"))
	require.False(t, ProviderSupportsMethod(p, "virtual_account"))

	banks, err := p.ListBanks(context.Background())
	require.NoError(t, err)
	require.NotEmpty(t, banks)

	accName, err := p.ResolveBankAccount(context.Background(), "058", "0123456789")
	require.NoError(t, err)
	require.Equal(t, "ZAINAB STORES LTD", accName)

	sub, err := p.CreateSubaccount(context.Background(), MerchantPayoutAccount{
		BankCode:      "058",
		AccountNumber: "0123456789",
		AccountName:   accName,
		BusinessName:  "Zainab Stores",
	})
	require.NoError(t, err)
	require.Equal(t, "SQD_SUB_777", sub.Code)

	// Default disabled -> ErrNotSupported without hitting HTTP
	_, err = p.CreateOrderVirtualAccount(context.Background(), OrderPaymentRequest{Reference: "att_va_off", AmountMinor: 10000})
	require.True(t, errors.Is(err, ErrNotSupported))

	// Explicitly enabled -> server 403 also maps cleanly to ErrNotSupported
	pEnabled := NewSquadProvider("sq_test_secret", "sq_wh_secret", srv.URL, 5*time.Second, WithSquadDynamicVA(true))
	require.True(t, ProviderSupportsMethod(pEnabled, "virtual_account"))
	_, err = pEnabled.CreateOrderVirtualAccount(context.Background(), OrderPaymentRequest{
		Reference:     "att_va_403",
		AmountMinor:   10000,
		CustomerName:  "Ada Obi",
		CustomerEmail: "ada@example.com",
	})
	require.True(t, errors.Is(err, ErrNotSupported))

	chk, err := p.InitializeCardCheckout(context.Background(), OrderPaymentRequest{
		Reference:     "att_sq_1",
		AmountMinor:   500000,
		Currency:      "ngn",
		CustomerEmail: "ada@example.com",
		SubaccountRef: sub.Code,
		FeeBearer:     "customer",
	})
	require.NoError(t, err)
	require.Equal(t, "https://pay.squadco.com/chk_123", chk.AuthorizationURL)

	res, err := p.VerifyTransaction(context.Background(), "att_sq_1")
	require.NoError(t, err)
	require.Equal(t, "paid", res.Status)
	require.Equal(t, int64(500000), res.AmountMinor)
	require.Equal(t, int64(7500), res.FeeMinor)
	require.Equal(t, "card", res.Channel)
}

func TestSquadWebhookVerification(t *testing.T) {
	p := NewSquadProvider("sq_key", "sq_wh_secret", "", 5*time.Second)

	body := []byte(`{"Event":"charge_successful","TransactionRef":"att_sq_2","Body":{"transaction_ref":"att_sq_2","amount":250000,"merchant_amount":246500,"transaction_status":"Success"}}`)
	sig := signSquadBody("sq_wh_secret", body)

	// Valid via x-squad-encrypted-body
	hdr := http.Header{}
	hdr.Set("x-squad-encrypted-body", sig)
	ev, err := p.VerifyWebhook(body, hdr)
	require.NoError(t, err)
	require.Equal(t, "squad", ev.Provider)
	require.Equal(t, "paid", ev.Status)
	require.Equal(t, "att_sq_2", ev.Reference)
	require.Equal(t, int64(250000), ev.AmountMinor)
	require.Equal(t, int64(3500), ev.FeeMinor)

	// Valid fallback via x-squad-signature
	hdr2 := http.Header{}
	hdr2.Set("x-squad-signature", sig)
	ev2, err := p.VerifyWebhook(body, hdr2)
	require.NoError(t, err)
	require.Equal(t, "paid", ev2.Status)

	// Wrong signature -> ErrInvalidWebhookSig
	badHdr := http.Header{}
	badHdr.Set("x-squad-encrypted-body", "deadbeef")
	_, err = p.VerifyWebhook(body, badHdr)
	require.ErrorIs(t, err, ErrInvalidWebhookSig)

	// Missing signature -> ErrInvalidWebhookSig
	_, err = p.VerifyWebhook(body, http.Header{})
	require.ErrorIs(t, err, ErrInvalidWebhookSig)
}
