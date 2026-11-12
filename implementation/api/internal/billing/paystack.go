package billing

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

var (
	ErrProviderUnavailable = errors.New("PROVIDER_TEMPORARILY_UNAVAILABLE")
	ErrInvalidWebhookSig   = errors.New("invalid paystack webhook signature")
)

type InitializeCheckoutRequest struct {
	Email       string         `json:"email"`
	AmountMinor int64          `json:"amount"`
	Currency    string         `json:"currency"`
	Reference   string         `json:"reference"`
	CallbackURL string         `json:"callback_url,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type InitializeCheckoutResponse struct {
	AuthorizationURL string `json:"authorization_url"`
	AccessCode       string `json:"access_code"`
	Reference        string `json:"reference"`
}

type VerifyTransactionResponse struct {
	Reference   string `json:"reference"`
	Status      string `json:"status"` // success, failed, abandoned
	AmountMinor int64  `json:"amount"`
	Currency    string `json:"currency"`
	Channel     string `json:"channel"`
}

type RefundRequest struct {
	TransactionRef string `json:"transaction"`
	AmountMinor    int64  `json:"amount"`
	Currency       string `json:"currency"`
}

type RefundResponse struct {
	RefundRef string `json:"id"`
	Status    string `json:"status"`
}

type PaymentProvider interface {
	IsConfigured() bool
	InitializeCheckout(ctx context.Context, req InitializeCheckoutRequest) (InitializeCheckoutResponse, error)
	VerifyTransaction(ctx context.Context, reference string) (VerifyTransactionResponse, error)
	RefundTransaction(ctx context.Context, req RefundRequest) (RefundResponse, error)
	VerifyWebhookSignature(rawBody []byte, signatureHeader string) bool
}

type PaystackProvider struct {
	secretKey     string
	webhookSecret string
	baseURL       string
	httpClient    *http.Client
}

func NewPaystackProvider(secretKey, webhookSecret, baseURL string, timeout time.Duration) *PaystackProvider {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.paystack.co"
	}
	if strings.TrimSpace(webhookSecret) == "" {
		webhookSecret = secretKey
	}
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	return &PaystackProvider{
		secretKey:     strings.TrimSpace(secretKey),
		webhookSecret: strings.TrimSpace(webhookSecret),
		baseURL:       strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		httpClient:    &http.Client{Timeout: timeout},
	}
}

func (p *PaystackProvider) IsConfigured() bool {
	return p.secretKey != ""
}

func (p *PaystackProvider) VerifyWebhookSignature(rawBody []byte, signatureHeader string) bool {
	if p.webhookSecret == "" || strings.TrimSpace(signatureHeader) == "" {
		return false
	}
	mac := hmac.New(sha512.New, []byte(p.webhookSecret))
	_, _ = mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(strings.ToLower(strings.TrimSpace(signatureHeader))), []byte(strings.ToLower(expected)))
}

func (p *PaystackProvider) InitializeCheckout(ctx context.Context, req InitializeCheckoutRequest) (InitializeCheckoutResponse, error) {
	if !p.IsConfigured() {
		return InitializeCheckoutResponse{}, ErrProviderUnavailable
	}
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return InitializeCheckoutResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/transaction/initialize", bytes.NewReader(bodyBytes))
	if err != nil {
		return InitializeCheckoutResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.secretKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return InitializeCheckoutResponse{}, ErrProviderUnavailable
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 128*1024))
	if err != nil || resp.StatusCode >= 500 {
		return InitializeCheckoutResponse{}, ErrProviderUnavailable
	}
	var env struct {
		Status  bool                       `json:"status"`
		Message string                     `json:"message"`
		Data    InitializeCheckoutResponse `json:"data"`
	}
	if err := json.Unmarshal(raw, &env); err != nil || !env.Status {
		return InitializeCheckoutResponse{}, fmt.Errorf("paystack initialize failed: %s", env.Message)
	}
	return env.Data, nil
}

func (p *PaystackProvider) VerifyTransaction(ctx context.Context, reference string) (VerifyTransactionResponse, error) {
	if !p.IsConfigured() {
		return VerifyTransactionResponse{}, ErrProviderUnavailable
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+"/transaction/verify/"+reference, nil)
	if err != nil {
		return VerifyTransactionResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.secretKey)

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return VerifyTransactionResponse{}, ErrProviderUnavailable
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 128*1024))
	if err != nil || resp.StatusCode >= 500 {
		return VerifyTransactionResponse{}, ErrProviderUnavailable
	}
	var env struct {
		Status  bool                      `json:"status"`
		Message string                    `json:"message"`
		Data    VerifyTransactionResponse `json:"data"`
	}
	if err := json.Unmarshal(raw, &env); err != nil || !env.Status {
		return VerifyTransactionResponse{}, fmt.Errorf("paystack verify failed: %s", env.Message)
	}
	return env.Data, nil
}

func (p *PaystackProvider) RefundTransaction(ctx context.Context, req RefundRequest) (RefundResponse, error) {
	if !p.IsConfigured() {
		return RefundResponse{}, ErrProviderUnavailable
	}
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return RefundResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/refund", bytes.NewReader(bodyBytes))
	if err != nil {
		return RefundResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.secretKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return RefundResponse{}, ErrProviderUnavailable
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 128*1024))
	if err != nil || resp.StatusCode >= 500 {
		return RefundResponse{}, ErrProviderUnavailable
	}
	var env struct {
		Status bool `json:"status"`
		Data   struct {
			ID     any    `json:"id"`
			Status string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &env); err != nil || !env.Status {
		return RefundResponse{}, ErrProviderUnavailable
	}
	return RefundResponse{RefundRef: fmt.Sprintf("%v", env.Data.ID), Status: env.Data.Status}, nil
}
