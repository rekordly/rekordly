package notify_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/notify"
	"github.com/stretchr/testify/require"
)

func TestResendEmailProvider_SendEscapingAndWebhookSig(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"re_msg_123"}`))
	}))
	defer srv.Close()

	secret := "whsec_test_123"
	p := notify.NewResendEmailProvider("re_test_key", srv.URL, "noreply@rekordly.com", secret, 5*time.Second)

	// Invalid email rejected before provider call
	_, err := p.SendEmail(context.Background(), notify.SendEmailRequest{To: "not-an-email", Subject: "Hi"})
	require.ErrorIs(t, err, notify.ErrInvalidRecipient)

	// HTML escaping
	subj, _, htmlBody := notify.RenderSafeDocumentEmail("doc_v1", "<script>alert(1)</script>", "invoice", "INV-1", "https://rekordly.com/share/abc", "Expires in 7 days")
	require.NotEmpty(t, subj)
	require.NotContains(t, htmlBody, "<script>")
	require.Contains(t, htmlBody, "&lt;script&gt;")

	res, err := p.SendEmail(context.Background(), notify.SendEmailRequest{
		To: "buyer@example.com", Subject: subj, HTMLBody: htmlBody, TextBody: "View invoice",
	})
	require.NoError(t, err)
	require.Equal(t, "accepted", res.Status)
	require.Equal(t, "re_msg_123", res.ProviderMessageID)

	body := []byte(`{"type":"email.delivered","data":{"email_id":"re_msg_123"}}`)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	sig := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	require.True(t, p.VerifyWebhookSignature(body, sig))
	require.False(t, p.VerifyWebhookSignature(body, "bad"))
}
