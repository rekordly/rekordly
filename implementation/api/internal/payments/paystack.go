package payments

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

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

func (p *PaystackProvider) Key() string {
	return "paystack"
}

func (p *PaystackProvider) IsConfigured() bool {
	return p.secretKey != ""
}

func (p *PaystackProvider) newRequest(ctx context.Context, method, path string, body any) (*http.Request, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	url := p.baseURL + path
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+p.secretKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Rekordly-Storefront/2.0")
	return req, nil
}

func (p *PaystackProvider) ListBanks(ctx context.Context) ([]Bank, error) {
	req, err := p.newRequest(ctx, http.MethodGet, "/bank?country=nigeria&perPage=100", nil)
	if err != nil {
		return nil, err
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("list banks: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return nil, ErrProviderUnavailable
	}

	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    []struct {
			Name   string `json:"name"`
			Code   string `json:"code"`
			Active bool   `json:"active"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode banks response: %w", err)
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
	path := fmt.Sprintf("/bank/resolve?account_number=%s&bank_code=%s", accountNumber, bankCode)
	req, err := p.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return "", err
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("resolve bank account: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return "", ErrProviderUnavailable
	}

	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			AccountName   string `json:"account_name"`
			AccountNumber string `json:"account_number"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode resolve account response: %w", err)
	}
	if !result.Status || strings.TrimSpace(result.Data.AccountName) == "" {
		return "", fmt.Errorf("account resolution failed: %s", result.Message)
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

	req, err := p.newRequest(ctx, http.MethodPost, "/subaccount", payload)
	if err != nil {
		return SubaccountRef{}, err
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return SubaccountRef{}, fmt.Errorf("create subaccount: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return SubaccountRef{}, ErrProviderUnavailable
	}

	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			SubaccountCode string `json:"subaccount_code"`
			ID             int64  `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return SubaccountRef{}, fmt.Errorf("decode subaccount response: %w", err)
	}
	if !result.Status || result.Data.SubaccountCode == "" {
		return SubaccountRef{}, fmt.Errorf("create subaccount failed: %s", result.Message)
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

	commissionMinor := int64(0)
	if req.PlatformCommissionPercent > 0 {
		commissionMinor = int64(float64(req.AmountMinor) * (req.PlatformCommissionPercent / 100.0))
	}

	payload := map[string]any{
		"email":              req.CustomerEmail,
		"amount":             req.AmountMinor,
		"reference":          req.Reference,
		"currency":           req.Currency,
		"subaccount":         req.SubaccountRef,
		"bearer":             bearer,
		"transaction_charge": commissionMinor,
		"bank_transfer": map[string]any{
			"account_expires_at": req.ExpiresAt.Format(time.RFC3339),
		},
	}

	httpReq, err := p.newRequest(ctx, http.MethodPost, "/charge", payload)
	if err != nil {
		return VirtualAccount{}, err
	}

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return VirtualAccount{}, fmt.Errorf("charge bank transfer: %w", err)
	}
	defer resp.Body.Close()

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

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return VirtualAccount{}, fmt.Errorf("decode charge response: %w", err)
	}

	if !result.Status {
		return VirtualAccount{}, fmt.Errorf("virtual account creation failed: %s", result.Message)
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

	commissionMinor := int64(0)
	if req.PlatformCommissionPercent > 0 {
		commissionMinor = int64(float64(req.AmountMinor) * (req.PlatformCommissionPercent / 100.0))
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
		"channels":           []string{"card", "ussd", "bank_transfer"},
	}

	httpReq, err := p.newRequest(ctx, http.MethodPost, "/transaction/initialize", payload)
	if err != nil {
		return CheckoutURL{}, err
	}

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return CheckoutURL{}, fmt.Errorf("initialize checkout: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return CheckoutURL{}, ErrProviderUnavailable
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
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return CheckoutURL{}, fmt.Errorf("decode initialize response: %w", err)
	}
	if !result.Status || result.Data.AuthorizationURL == "" {
		return CheckoutURL{}, fmt.Errorf("initialize card checkout failed: %s", result.Message)
	}

	return CheckoutURL{
		AuthorizationURL: result.Data.AuthorizationURL,
		AccessCode:       result.Data.AccessCode,
		Reference:        result.Data.Reference,
	}, nil
}

func (p *PaystackProvider) VerifyWebhook(rawBody []byte, headers http.Header) (Event, error) {
	sig := headers.Get("x-paystack-signature")
	if strings.TrimSpace(sig) == "" || p.webhookSecret == "" {
		return Event{}, ErrInvalidWebhookSig
	}

	mac := hmac.New(sha512.New, []byte(p.webhookSecret))
	_, _ = mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(strings.ToLower(sig)), []byte(strings.ToLower(expected))) {
		return Event{}, ErrInvalidWebhookSig
	}

	var payload struct {
		Event string `json:"event"`
		Data  struct {
			Reference string `json:"reference"`
			Amount    int64  `json:"amount"`
			Fees      int64  `json:"fees"`
			Status    string `json:"status"`
			PaidAt    string `json:"paid_at"`
			Channel   string `json:"channel"`
		} `json:"data"`
	}

	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return Event{}, fmt.Errorf("unmarshal webhook body: %w", err)
	}

	paidAt := time.Now()
	if payload.Data.PaidAt != "" {
		if t, err := time.Parse(time.RFC3339, payload.Data.PaidAt); err == nil {
			paidAt = t
		}
	}

	status := "pending"
	switch payload.Event {
	case "charge.success":
		status = "paid"
	case "bank.transfer.rejected":
		status = "rejected"
	default:
		if payload.Data.Status == "success" {
			status = "paid"
		} else if payload.Data.Status == "failed" {
			status = "failed"
		}
	}

	return Event{
		Provider:    "paystack",
		Type:        payload.Event,
		Reference:   payload.Data.Reference,
		AmountMinor: payload.Data.Amount,
		FeeMinor:    payload.Data.Fees,
		PaidAt:      paidAt,
		Status:      status,
		Raw:         rawBody,
	}, nil
}

func (p *PaystackProvider) VerifyTransaction(ctx context.Context, reference string) (PaymentResult, error) {
	path := fmt.Sprintf("/transaction/verify/%s", reference)
	req, err := p.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return PaymentResult{}, err
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return PaymentResult{}, fmt.Errorf("verify transaction: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return PaymentResult{}, ErrTransactionNotFound
	}
	if resp.StatusCode >= 500 {
		return PaymentResult{}, ErrProviderUnavailable
	}

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
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return PaymentResult{}, fmt.Errorf("decode verify transaction response: %w", err)
	}
	if !result.Status {
		return PaymentResult{}, fmt.Errorf("verify transaction failed: %s", result.Message)
	}

	paidAt := time.Now()
	if result.Data.PaidAt != "" {
		if t, err := time.Parse(time.RFC3339, result.Data.PaidAt); err == nil {
			paidAt = t
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
