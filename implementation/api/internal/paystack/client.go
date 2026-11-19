package paystack

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const DefaultBaseURL = "https://api.paystack.co"

var ErrUnavailable = errors.New("paystack service unavailable")

// APIError represents an HTTP/application rejection returned by Paystack (non-5xx).
type APIError struct {
	StatusCode int
	Message    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("paystack error (%d): %s", e.StatusCode, e.Message)
}

// Client shares Paystack HTTP transport, JSON envelope decoding, and HMAC-SHA512 webhook verification
// between billing and storefront payment integrations.
type Client struct {
	secretKey               string
	deprecatedWebhookSecret string
	baseURL                 string
	httpClient              *http.Client
}

// NewClient constructs a shared Paystack client.
// Paystack signs webhooks with PAYSTACK_SECRET_KEY; deprecatedWebhookSecret is retained solely as
// a backwards-compatible fallback if secretKey is empty.
func NewClient(secretKey, deprecatedWebhookSecret, baseURL string, timeout time.Duration) *Client {
	cleanSecret := strings.TrimSpace(secretKey)
	cleanDeprecated := strings.TrimSpace(deprecatedWebhookSecret)
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = DefaultBaseURL
	}
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	return &Client{
		secretKey:               cleanSecret,
		deprecatedWebhookSecret: cleanDeprecated,
		baseURL:                 base,
		httpClient:              &http.Client{Timeout: timeout},
	}
}

// IsConfigured reports whether the Paystack secret key is populated.
func (c *Client) IsConfigured() bool {
	return c != nil && strings.TrimSpace(c.secretKey) != ""
}

// SigningKey returns the secret key used for API requests and webhook HMAC verification.
func (c *Client) SigningKey() string {
	if c == nil {
		return ""
	}
	if c.secretKey != "" {
		return c.secretKey
	}
	return c.deprecatedWebhookSecret
}

// VerifySignature checks the x-paystack-signature HMAC-SHA512 hex digest against the raw request body
// using PAYSTACK_SECRET_KEY.
func (c *Client) VerifySignature(rawBody []byte, signatureHeader string) bool {
	key := c.SigningKey()
	sig := strings.TrimSpace(signatureHeader)
	if key == "" || sig == "" {
		return false
	}
	mac := hmac.New(sha512.New, []byte(key))
	_, _ = mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(strings.ToLower(sig)), []byte(strings.ToLower(expected)))
}

// VerifySignatureHeader extracts x-paystack-signature from headers and verifies rawBody.
func (c *Client) VerifySignatureHeader(rawBody []byte, headers http.Header) bool {
	return c.VerifySignature(rawBody, headers.Get("x-paystack-signature"))
}

// DoJSON sends an authenticated JSON request to Paystack, checks HTTP status and envelope `status`,
// and decodes into out (which is typically an envelope struct containing `Status`, `Message`, `Data`).
func (c *Client) DoJSON(ctx context.Context, method, path string, reqBody any, out any) (int, error) {
	if !c.IsConfigured() {
		return 0, fmt.Errorf("%w: secret key not configured", ErrUnavailable)
	}
	var bodyReader io.Reader
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return 0, fmt.Errorf("marshal paystack request: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return 0, fmt.Errorf("create paystack request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	if reqBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("User-Agent", "Rekordly/2.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return resp.StatusCode, fmt.Errorf("%w: read response: %v", ErrUnavailable, err)
	}
	if resp.StatusCode >= 500 {
		return resp.StatusCode, fmt.Errorf("%w: http %d", ErrUnavailable, resp.StatusCode)
	}

	var meta struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(raw, &meta)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !meta.Status {
		msg := strings.TrimSpace(meta.Message)
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return resp.StatusCode, &APIError{StatusCode: resp.StatusCode, Message: msg}
	}

	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			return resp.StatusCode, fmt.Errorf("decode paystack response: %w", err)
		}
	}
	return resp.StatusCode, nil
}
