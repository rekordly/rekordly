package billing_test

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/billing"
	"github.com/stretchr/testify/require"
)

func TestPaystackWebhookSignatureValidation(t *testing.T) {
	secret := "sk_test_super_secret_12345"
	provider := billing.NewPaystackProvider(secret, secret, "", 5*time.Second)

	body := []byte(`{"event":"charge.success","data":{"id":99,"reference":"rk_chk_1","amount":150000,"currency":"NGN"}}`)
	mac := hmac.New(sha512.New, []byte(secret))
	_, _ = mac.Write(body)
	validSig := hex.EncodeToString(mac.Sum(nil))

	require.True(t, provider.VerifyWebhookSignature(body, validSig))
	require.False(t, provider.VerifyWebhookSignature(body, "deadbeef"))
	require.False(t, provider.VerifyWebhookSignature(body, ""))
}
