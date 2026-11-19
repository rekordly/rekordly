package payments

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

var (
	ErrNotSupported        = errors.New("PROVIDER_FEATURE_NOT_SUPPORTED")
	ErrProviderUnavailable = errors.New("PROVIDER_UNAVAILABLE")
	ErrInvalidWebhookSig   = errors.New("INVALID_WEBHOOK_SIGNATURE")
	ErrTransactionNotFound = errors.New("TRANSACTION_NOT_FOUND")
	ErrAmountMismatch      = errors.New("PAYMENT_AMOUNT_MISMATCH")
)

type MerchantPayoutAccount struct {
	BankCode      string `json:"bank_code"`
	AccountNumber string `json:"account_number"`
	AccountName   string `json:"account_name"`
	BusinessName  string `json:"business_name"`
}

type SubaccountRef struct {
	Code      string `json:"code"`
	AccountID string `json:"account_id,omitempty"`
}

type Bank struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type OrderPaymentRequest struct {
	AmountMinor               int64     `json:"amount_minor"`
	Currency                  string    `json:"currency"`
	Reference                 string    `json:"reference"`
	CustomerEmail             string    `json:"customer_email"`
	CustomerName              string    `json:"customer_name"`
	SubaccountRef             string    `json:"subaccount_ref"`
	PlatformCommissionPercent float64   `json:"platform_commission_percent"`
	FeeBearer                 string    `json:"fee_bearer"` // "merchant" | "customer"
	ExpiresAt                 time.Time `json:"expires_at"`
	CallbackURL               string    `json:"callback_url,omitempty"`
}

type VirtualAccount struct {
	AccountNumber string     `json:"account_number"`
	BankName      string     `json:"bank_name"`
	AccountName   string     `json:"account_name"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
}

type CheckoutURL struct {
	AuthorizationURL string `json:"authorization_url"`
	AccessCode       string `json:"access_code,omitempty"`
	Reference        string `json:"reference"`
}

type Event struct {
	Provider    string          `json:"provider"`
	Type        string          `json:"type"` // e.g. "charge.success", "payment.rejected"
	Reference   string          `json:"reference"`
	AmountMinor int64           `json:"amount_minor"`
	FeeMinor    int64           `json:"fee_minor"`
	PaidAt      time.Time       `json:"paid_at"`
	Status      string          `json:"status"` // "paid", "failed", "rejected"
	Raw         json.RawMessage `json:"raw"`
}

type PaymentResult struct {
	Reference   string    `json:"reference"`
	Status      string    `json:"status"` // "paid", "failed", "pending"
	AmountMinor int64     `json:"amount_minor"`
	FeeMinor    int64     `json:"fee_minor"`
	Channel     string    `json:"channel"`
	PaidAt      time.Time `json:"paid_at"`
}

// MethodSupportChecker is optionally implemented by payment providers whose
// per-method availability depends on merchant or provider capabilities.
type MethodSupportChecker interface {
	SupportsMethod(method string) bool
}

// ProviderSupportsMethod checks whether p supports the given storefront payment
// method ("virtual_account" or "card"). Providers without MethodSupportChecker
// are treated as supporting both methods.
func ProviderSupportsMethod(p Provider, method string) bool {
	if p == nil {
		return false
	}
	if checker, ok := p.(MethodSupportChecker); ok {
		return checker.SupportsMethod(method)
	}
	return true
}

type Provider interface {
	Key() string // "paystack" | "squad"
	CreateSubaccount(ctx context.Context, account MerchantPayoutAccount) (SubaccountRef, error)
	ResolveBankAccount(ctx context.Context, bankCode, accountNumber string) (accountName string, err error)
	ListBanks(ctx context.Context) ([]Bank, error)
	CreateOrderVirtualAccount(ctx context.Context, req OrderPaymentRequest) (VirtualAccount, error)
	InitializeCardCheckout(ctx context.Context, req OrderPaymentRequest) (CheckoutURL, error)
	VerifyWebhook(rawBody []byte, headers http.Header) (Event, error)
	VerifyTransaction(ctx context.Context, reference string) (PaymentResult, error)
}
