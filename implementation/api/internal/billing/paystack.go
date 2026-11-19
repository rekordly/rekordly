package billing

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/rekordly/rekordly-api/internal/paystack"
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
	client *paystack.Client
}

// NewPaystackProvider creates a Paystack billing provider backed by the shared Paystack client.
// webhookSecret is accepted only as a deprecated fallback if secretKey is empty.
func NewPaystackProvider(secretKey, webhookSecret, baseURL string, timeout time.Duration) *PaystackProvider {
	return &PaystackProvider{
		client: paystack.NewClient(secretKey, webhookSecret, baseURL, timeout),
	}
}

func (p *PaystackProvider) IsConfigured() bool {
	return p != nil && p.client.IsConfigured()
}

func (p *PaystackProvider) VerifyWebhookSignature(rawBody []byte, signatureHeader string) bool {
	if p == nil || p.client == nil {
		return false
	}
	return p.client.VerifySignature(rawBody, signatureHeader)
}

func (p *PaystackProvider) InitializeCheckout(ctx context.Context, req InitializeCheckoutRequest) (InitializeCheckoutResponse, error) {
	if !p.IsConfigured() {
		return InitializeCheckoutResponse{}, ErrProviderUnavailable
	}
	var env struct {
		Status  bool                       `json:"status"`
		Message string                     `json:"message"`
		Data    InitializeCheckoutResponse `json:"data"`
	}
	if _, err := p.client.DoJSON(ctx, http.MethodPost, "/transaction/initialize", req, &env); err != nil {
		if errors.Is(err, paystack.ErrUnavailable) {
			return InitializeCheckoutResponse{}, ErrProviderUnavailable
		}
		var apiErr *paystack.APIError
		if errors.As(err, &apiErr) {
			return InitializeCheckoutResponse{}, fmt.Errorf("paystack initialize failed: %s", apiErr.Message)
		}
		return InitializeCheckoutResponse{}, err
	}
	return env.Data, nil
}

func (p *PaystackProvider) VerifyTransaction(ctx context.Context, reference string) (VerifyTransactionResponse, error) {
	if !p.IsConfigured() {
		return VerifyTransactionResponse{}, ErrProviderUnavailable
	}
	var env struct {
		Status  bool                      `json:"status"`
		Message string                    `json:"message"`
		Data    VerifyTransactionResponse `json:"data"`
	}
	if _, err := p.client.DoJSON(ctx, http.MethodGet, "/transaction/verify/"+url.PathEscape(reference), nil, &env); err != nil {
		if errors.Is(err, paystack.ErrUnavailable) {
			return VerifyTransactionResponse{}, ErrProviderUnavailable
		}
		var apiErr *paystack.APIError
		if errors.As(err, &apiErr) {
			return VerifyTransactionResponse{}, fmt.Errorf("paystack verify failed: %s", apiErr.Message)
		}
		return VerifyTransactionResponse{}, err
	}
	return env.Data, nil
}

func (p *PaystackProvider) RefundTransaction(ctx context.Context, req RefundRequest) (RefundResponse, error) {
	if !p.IsConfigured() {
		return RefundResponse{}, ErrProviderUnavailable
	}
	var env struct {
		Status bool `json:"status"`
		Data   struct {
			ID     any    `json:"id"`
			Status string `json:"status"`
		} `json:"data"`
	}
	if _, err := p.client.DoJSON(ctx, http.MethodPost, "/refund", req, &env); err != nil {
		return RefundResponse{}, ErrProviderUnavailable
	}
	return RefundResponse{RefundRef: fmt.Sprintf("%v", env.Data.ID), Status: env.Data.Status}, nil
}
