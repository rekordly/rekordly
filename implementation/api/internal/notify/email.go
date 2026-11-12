package notify

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"
)

var (
	ErrEmailUnavailable    = errors.New("EMAIL_PROVIDER_UNAVAILABLE")
	ErrInvalidRecipient    = errors.New("INVALID_RECIPIENT_EMAIL")
	ErrEmailTransient      = errors.New("EMAIL_TRANSIENT_FAILURE")
	ErrEmailPermanent      = errors.New("EMAIL_PERMANENT_FAILURE")
	ErrInvalidEmailWebhook = errors.New("invalid email webhook signature")
)

type SendEmailRequest struct {
	To             string
	ReplyTo        string
	Subject        string
	TextBody       string
	HTMLBody       string
	IdempotencyKey string
}

type SendEmailResult struct {
	Provider          string
	ProviderMessageID string
	Status            string // accepted
}

type EmailProvider interface {
	Name() string
	IsConfigured() bool
	SendEmail(ctx context.Context, req SendEmailRequest) (SendEmailResult, error)
	GetEmailStatus(ctx context.Context, providerMessageID string) (string, error)
	VerifyWebhookSignature(rawBody []byte, signatureHeader string) bool
}

type ResendEmailProvider struct {
	apiKey        string
	baseURL       string
	from          string
	webhookSecret string
	httpClient    *http.Client
}

func NewResendEmailProvider(apiKey, baseURL, from, webhookSecret string, timeout time.Duration) *ResendEmailProvider {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.resend.com"
	}
	if strings.TrimSpace(from) == "" {
		from = "notifications@rekordly.com"
	}
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	return &ResendEmailProvider{
		apiKey:        strings.TrimSpace(apiKey),
		baseURL:       strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		from:          strings.TrimSpace(from),
		webhookSecret: strings.TrimSpace(webhookSecret),
		httpClient:    &http.Client{Timeout: timeout},
	}
}

func (r *ResendEmailProvider) Name() string       { return "resend" }
func (r *ResendEmailProvider) IsConfigured() bool { return r.apiKey != "" }

func ValidateEmailAddress(raw string) (string, error) {
	addr, err := mail.ParseAddress(strings.TrimSpace(raw))
	if err != nil || addr.Address == "" || !strings.Contains(addr.Address, "@") {
		return "", ErrInvalidRecipient
	}
	return strings.ToLower(addr.Address), nil
}

func RenderSafeDocumentEmail(templateKey, businessName, docType, docNumber, portalURL, expiryNote string) (subject, textBody, htmlBody string) {
	safeBiz := html.EscapeString(strings.TrimSpace(businessName))
	safeDoc := html.EscapeString(strings.TrimSpace(docType + " " + docNumber))
	safeURL := html.EscapeString(strings.TrimSpace(portalURL))
	safeExp := html.EscapeString(strings.TrimSpace(expiryNote))

	subject = fmt.Sprintf("%s: %s %s", strings.TrimSpace(businessName), strings.TrimSpace(docType), strings.TrimSpace(docNumber))
	textBody = fmt.Sprintf("%s shared %s %s with you.\n\nView safely here: %s\n%s\n",
		strings.TrimSpace(businessName), strings.TrimSpace(docType), strings.TrimSpace(docNumber), strings.TrimSpace(portalURL), strings.TrimSpace(expiryNote))
	htmlBody = fmt.Sprintf(
		`<!doctype html><html><body><p><strong>%s</strong> shared <strong>%s</strong> with you (template %s).</p><p><a href="%s">Open document portal</a></p><p>%s</p></body></html>`,
		safeBiz, safeDoc, html.EscapeString(templateKey), safeURL, safeExp,
	)
	return subject, textBody, htmlBody
}

func (r *ResendEmailProvider) SendEmail(ctx context.Context, req SendEmailRequest) (SendEmailResult, error) {
	toAddr, err := ValidateEmailAddress(req.To)
	if err != nil {
		return SendEmailResult{}, err
	}
	if !r.IsConfigured() {
		return SendEmailResult{}, ErrEmailUnavailable
	}

	payload := map[string]any{
		"from":    r.from,
		"to":      []string{toAddr},
		"subject": req.Subject,
		"text":    req.TextBody,
		"html":    req.HTMLBody,
	}
	if req.ReplyTo != "" {
		if rt, rtErr := ValidateEmailAddress(req.ReplyTo); rtErr == nil {
			payload["reply_to"] = rt
		}
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return SendEmailResult{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, r.baseURL+"/emails", bytes.NewReader(bodyBytes))
	if err != nil {
		return SendEmailResult{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+r.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	if req.IdempotencyKey != "" {
		httpReq.Header.Set("Idempotency-Key", req.IdempotencyKey)
	}

	resp, err := r.httpClient.Do(httpReq)
	if err != nil {
		return SendEmailResult{}, ErrEmailTransient
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode == http.StatusTooManyRequests || (resp.StatusCode >= 500 && resp.StatusCode < 600) {
		return SendEmailResult{}, ErrEmailTransient
	}
	if resp.StatusCode >= 400 {
		return SendEmailResult{}, ErrEmailPermanent
	}

	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || out.ID == "" {
		return SendEmailResult{}, ErrEmailTransient
	}
	return SendEmailResult{
		Provider:          "resend",
		ProviderMessageID: out.ID,
		Status:            "accepted",
	}, nil
}

func (r *ResendEmailProvider) GetEmailStatus(ctx context.Context, providerMessageID string) (string, error) {
	if !r.IsConfigured() || strings.TrimSpace(providerMessageID) == "" {
		return "", ErrEmailUnavailable
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, r.baseURL+"/emails/"+providerMessageID, nil)
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+r.apiKey)
	resp, err := r.httpClient.Do(httpReq)
	if err != nil {
		return "", ErrEmailTransient
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", ErrEmailTransient
	}
	var out struct {
		LastEvent string `json:"last_event"`
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", ErrEmailTransient
	}
	return out.LastEvent, nil
}

func (r *ResendEmailProvider) VerifyWebhookSignature(rawBody []byte, signatureHeader string) bool {
	if r.webhookSecret == "" || strings.TrimSpace(signatureHeader) == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(r.webhookSecret))
	_, _ = mac.Write(rawBody)
	expectedB64 := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(strings.TrimSpace(signatureHeader)), []byte(expectedB64))
}
