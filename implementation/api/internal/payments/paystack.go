package payments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/rekordly/rekordly-api/internal/paystack"
	"github.com/shopspring/decimal"
)

type PaystackProvider struct {
	client *paystack.Client
}

// NewPaystackProvider constructs the storefront Paystack payment provider backed by the shared client.
// Paystack signs webhooks with PAYSTACK_SECRET_KEY; webhookSecret is kept only as a deprecated fallback if secretKey is empty.
func NewPaystackProvider(secretKey, webhookSecret, baseURL string, timeout time.Duration) *PaystackProvider {
	return &PaystackProvider{
		client: paystack.NewClient(secretKey, webhookSecret, baseURL, timeout),
	}
}

func (p *PaystackProvider) Key() string {
	return "paystack"
}

func (p *PaystackProvider) IsConfigured() bool {
	return p != nil && p.client.IsConfigured()
}

func computePaystackCommissionMinor(amountMinor int64, commissionPercent float64) int64 {
	if amountMinor <= 0 || commissionPercent <= 0 {
		return 0
	}
	return decimal.NewFromInt(amountMinor).
		Mul(decimal.NewFromFloat(commissionPercent)).
		Div(decimal.NewFromInt(100)).
		Round(0).
		IntPart()
}

func mapPaystackError(err error) error {
	if errors.Is(err, paystack.ErrUnavailable) {
		return ErrProviderUnavailable
	}
	return err
}

func (p *PaystackProvider) ListBanks(ctx context.Context) ([]Bank, error) {
	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    []struct {
			Name   string `json:"name"`
			Code   string `json:"code"`
			Active bool   `json:"active"`
		} `json:"data"`
	}
	if _, err := p.client.DoJSON(ctx, http.MethodGet, "/bank?country=nigeria&perPage=100", nil, &result); err != nil {
		return nil, fmt.Errorf("list banks: %w", mapPaystackError(err))
	}

	banks := make([]Bank, 0, len(result.Data))
	for _, b := range result.Data {
		if b.Active {
			banks = append(banks, Bank{
				Code: b.Code,
				Name: b.Name,
			})
		}
	}
	return banks, nil
}

func (p *PaystackProvider) ResolveBankAccount(ctx context.Context, bankCode, accountNumber string) (string, error) {
	path := fmt.Sprintf("/bank/resolve?account_number=%s&bank_code=%s", url.QueryEscape(accountNumber), url.QueryEscape(bankCode))
	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			AccountName   string `json:"account_name"`
			AccountNumber string `json:"account_number"`
		} `json:"data"`
	}
	if _, err := p.client.DoJSON(ctx, http.MethodGet, path, nil, &result); err != nil {
		var apiErr *paystack.APIError
		if errors.As(err, &apiErr) {
			return "", fmt.Errorf("account resolution failed: %s", apiErr.Message)
		}
		return "", fmt.Errorf("resolve bank account: %w", mapPaystackError(err))
	}
	if strings.TrimSpace(result.Data.AccountName) == "" {
		return "", fmt.Errorf("account resolution failed: empty account name")
	}
	return result.Data.AccountName, nil
}

func (p *PaystackProvider) CreateSubaccount(ctx context.Context, account MerchantPayoutAccount) (SubaccountRef, error) {
	payload := map[string]any{
		"business_name":     account.BusinessName,
		"settlement_bank":   account.BankCode,
		"account_number":    account.AccountNumber,
		"percentage_charge": 0,
	}

	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			SubaccountCode string `json:"subaccount_code"`
			ID             int64  `json:"id"`
		} `json:"data"`
	}
	if _, err := p.client.DoJSON(ctx, http.MethodPost, "/subaccount", payload, &result); err != nil {
		var apiErr *paystack.APIError
		if errors.As(err, &apiErr) {
			return SubaccountRef{}, fmt.Errorf("create subaccount failed: %s", apiErr.Message)
		}
		return SubaccountRef{}, fmt.Errorf("create subaccount: %w", mapPaystackError(err))
	}
	if result.Data.SubaccountCode == "" {
		return SubaccountRef{}, fmt.Errorf("create subaccount failed: empty subaccount_code")
	}

	return SubaccountRef{
		Code:      result.Data.SubaccountCode,
		AccountID: fmt.Sprintf("%d", result.Data.ID),
	}, nil
}

func (p *PaystackProvider) CreateOrderVirtualAccount(ctx context.Context, req OrderPaymentRequest) (VirtualAccount, error) {
	bearer := "subaccount"
	if req.FeeBearer == "customer" {
		bearer = "account"
	}

	commissionMinor := computePaystackCommissionMinor(req.AmountMinor, req.PlatformCommissionPercent)

	meta := map[string]any{
		"kind":              "storefront_order",
		"attempt_reference": req.Reference,
	}
	if req.OrderID > 0 {
		meta["storefront_order_id"] = req.OrderID
	}

	payload := map[string]any{
		"email":              req.CustomerEmail,
		"amount":             req.AmountMinor,
		"reference":          req.Reference,
		"currency":           req.Currency,
		"subaccount":         req.SubaccountRef,
		"bearer":             bearer,
		"transaction_charge": commissionMinor,
		"metadata":           meta,
		"bank_transfer": map[string]any{
			"account_expires_at": req.ExpiresAt.Format(time.RFC3339),
		},
	}

	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			Status        string `json:"status"`
			DisplayText   string `json:"display_text"`
			AccountNumber string `json:"account_number"`
			Bank          struct {
				Name string `json:"name"`
			} `json:"bank"`
			Authorization struct {
				AccountNumber    string `json:"account_number"`
				Bank             string `json:"bank"`
				AccountName      string `json:"account_name"`
				AccountExpiresAt string `json:"account_expires_at"`
			} `json:"authorization"`
		} `json:"data"`
	}
	if _, err := p.client.DoJSON(ctx, http.MethodPost, "/charge", payload, &result); err != nil {
		var apiErr *paystack.APIError
		if errors.As(err, &apiErr) {
			return VirtualAccount{}, fmt.Errorf("virtual account creation failed: %s", apiErr.Message)
		}
		return VirtualAccount{}, fmt.Errorf("charge bank transfer: %w", mapPaystackError(err))
	}

	accNum := result.Data.Authorization.AccountNumber
	if accNum == "" {
		accNum = result.Data.AccountNumber
	}
	bankName := result.Data.Authorization.Bank
	if bankName == "" {
		bankName = result.Data.Bank.Name
	}
	accName := result.Data.Authorization.AccountName

	if accNum == "" {
		return VirtualAccount{}, fmt.Errorf("paystack did not return virtual account details: status=%s", result.Data.Status)
	}

	var expiresAt *time.Time
	if result.Data.Authorization.AccountExpiresAt != "" {
		if t, err := time.Parse(time.RFC3339, result.Data.Authorization.AccountExpiresAt); err == nil {
			expiresAt = &t
		}
	}
	if expiresAt == nil && !req.ExpiresAt.IsZero() {
		exp := req.ExpiresAt
		expiresAt = &exp
	}

	return VirtualAccount{
		AccountNumber: accNum,
		BankName:      bankName,
		AccountName:   accName,
		ExpiresAt:     expiresAt,
	}, nil
}

func (p *PaystackProvider) InitializeCardCheckout(ctx context.Context, req OrderPaymentRequest) (CheckoutURL, error) {
	bearer := "subaccount"
	if req.FeeBearer == "customer" {
		bearer = "account"
	}

	commissionMinor := computePaystackCommissionMinor(req.AmountMinor, req.PlatformCommissionPercent)

	meta := map[string]any{
		"kind":              "storefront_order",
		"attempt_reference": req.Reference,
	}
	if req.OrderID > 0 {
		meta["storefront_order_id"] = req.OrderID
	}

	payload := map[string]any{
		"email":              req.CustomerEmail,
		"amount":             req.AmountMinor,
		"currency":           req.Currency,
		"reference":          req.Reference,
		"callback_url":       req.CallbackURL,
		"subaccount":         req.SubaccountRef,
		"bearer":             bearer,
		"transaction_charge": commissionMinor,
		"metadata":           meta,
		"channels":           []string{"card", "ussd", "bank_transfer"},
	}

	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			AuthorizationURL string `json:"authorization_url"`
			AccessCode       string `json:"access_code"`
			Reference        string `json:"reference"`
		} `json:"data"`
	}
	if _, err := p.client.DoJSON(ctx, http.MethodPost, "/transaction/initialize", payload, &result); err != nil {
		var apiErr *paystack.APIError
		if errors.As(err, &apiErr) {
			return CheckoutURL{}, fmt.Errorf("initialize card checkout failed: %s", apiErr.Message)
		}
		return CheckoutURL{}, fmt.Errorf("initialize checkout: %w", mapPaystackError(err))
	}
	if result.Data.AuthorizationURL == "" {
		return CheckoutURL{}, fmt.Errorf("initialize card checkout failed: empty authorization_url")
	}

	return CheckoutURL{
		AuthorizationURL: result.Data.AuthorizationURL,
		AccessCode:       result.Data.AccessCode,
		Reference:        result.Data.Reference,
	}, nil
}

func (p *PaystackProvider) VerifyWebhook(rawBody []byte, headers http.Header) (Event, error) {
	if p == nil || p.client == nil || !p.client.VerifySignatureHeader(rawBody, headers) {
		return Event{}, ErrInvalidWebhookSig
	}
	return ParsePaystackWebhookEvent(rawBody)
}

// ParsePaystackWebhookEvent parses a verified Paystack webhook body into a normalized storefront Event.
func ParsePaystackWebhookEvent(rawBody []byte) (Event, error) {
	var payload struct {
		Event string `json:"event"`
		Data  struct {
			ID        any    `json:"id"`
			Reference string `json:"reference"`
			Amount    int64  `json:"amount"`
			Fees      int64  `json:"fees"`
			Status    string `json:"status"`
			PaidAt    string `json:"paid_at"`
			Channel   string `json:"channel"`
			Metadata  struct {
				Kind             string `json:"kind"`
				AttemptReference string `json:"attempt_reference"`
			} `json:"metadata"`
		} `json:"data"`
	}

	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return Event{}, fmt.Errorf("unmarshal webhook body: %w", err)
	}

	paidAt := time.Now().UTC()
	if payload.Data.PaidAt != "" {
		if t, err := time.Parse(time.RFC3339, payload.Data.PaidAt); err == nil {
			paidAt = t.UTC()
		}
	}

	ref := strings.TrimSpace(payload.Data.Reference)
	if ref == "" {
		ref = strings.TrimSpace(payload.Data.Metadata.AttemptReference)
	}

	providerEvtID := ""
	if payload.Data.ID != nil {
		if s := strings.TrimSpace(fmt.Sprintf("%v", payload.Data.ID)); s != "" && s != "<nil>" {
			providerEvtID = s
		}
	}

	status := "pending"
	switch strings.ToLower(strings.TrimSpace(payload.Event)) {
	case "charge.success":
		status = "paid"
	case "bank.transfer.rejected":
		status = "rejected"
	case "charge.failed", "transfer.failed":
		status = "failed"
	default:
		if strings.EqualFold(payload.Data.Status, "success") {
			status = "paid"
		} else if strings.EqualFold(payload.Data.Status, "failed") {
			status = "failed"
		}
	}

	return Event{
		Provider:        "paystack",
		ProviderEventID: providerEvtID,
		Type:            strings.TrimSpace(payload.Event),
		Reference:       ref,
		AmountMinor:     payload.Data.Amount,
		FeeMinor:        payload.Data.Fees,
		PaidAt:          paidAt,
		Status:          status,
		Raw:             rawBody,
	}, nil
}

func (p *PaystackProvider) VerifyTransaction(ctx context.Context, reference string) (PaymentResult, error) {
	path := fmt.Sprintf("/transaction/verify/%s", url.PathEscape(strings.TrimSpace(reference)))
	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			Reference string `json:"reference"`
			Status    string `json:"status"`
			Amount    int64  `json:"amount"`
			Fees      int64  `json:"fees"`
			Channel   string `json:"channel"`
			PaidAt    string `json:"paid_at"`
		} `json:"data"`
	}
	if statusCode, err := p.client.DoJSON(ctx, http.MethodGet, path, nil, &result); err != nil {
		if statusCode == http.StatusNotFound {
			return PaymentResult{}, ErrTransactionNotFound
		}
		var apiErr *paystack.APIError
		if errors.As(err, &apiErr) {
			return PaymentResult{}, fmt.Errorf("verify transaction failed: %s", apiErr.Message)
		}
		return PaymentResult{}, fmt.Errorf("verify transaction: %w", mapPaystackError(err))
	}

	paidAt := time.Now().UTC()
	if result.Data.PaidAt != "" {
		if t, err := time.Parse(time.RFC3339, result.Data.PaidAt); err == nil {
			paidAt = t.UTC()
		}
	}

	status := "pending"
	if result.Data.Status == "success" {
		status = "paid"
	} else if result.Data.Status == "failed" || result.Data.Status == "reversed" {
		status = "failed"
	}

	return PaymentResult{
		Reference:   result.Data.Reference,
		Status:      status,
		AmountMinor: result.Data.Amount,
		FeeMinor:    result.Data.Fees,
		Channel:     result.Data.Channel,
		PaidAt:      paidAt,
	}, nil
}
