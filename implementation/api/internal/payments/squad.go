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
	"net/url"
	"strings"
	"time"
)

// SquadOption configures optional behavior of SquadProvider.
type SquadOption func(*SquadProvider)

// WithSquadDynamicVA marks whether Squad's dynamic virtual-account pool API is
// approved and enabled for this integration. When false (default), virtual_account
// is hidden via MethodSupportChecker and CreateOrderVirtualAccount returns ErrNotSupported.
func WithSquadDynamicVA(enabled bool) SquadOption {
	return func(p *SquadProvider) {
		p.supportsDynamicVA = enabled
	}
}

type SquadProvider struct {
	secretKey         string
	webhookSecret     string
	baseURL           string
	client            *http.Client
	supportsDynamicVA bool
}

func NewSquadProvider(secretKey, webhookSecret, baseURL string, timeout time.Duration, opts ...SquadOption) *SquadProvider {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = "https://api-d.squadco.com"
	}
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	whSecret := strings.TrimSpace(webhookSecret)
	if whSecret == "" {
		whSecret = strings.TrimSpace(secretKey)
	}
	p := &SquadProvider{
		secretKey:     strings.TrimSpace(secretKey),
		webhookSecret: whSecret,
		baseURL:       base,
		client:        &http.Client{Timeout: timeout},
	}
	for _, opt := range opts {
		if opt != nil {
			opt(p)
		}
	}
	return p
}

func (p *SquadProvider) Key() string {
	return "squad"
}

func (p *SquadProvider) IsConfigured() bool {
	return p != nil && p.secretKey != ""
}

func (p *SquadProvider) SupportsMethod(method string) bool {
	switch strings.ToLower(strings.TrimSpace(method)) {
	case "card":
		return true
	case "virtual_account":
		return p.supportsDynamicVA
	default:
		return false
	}
}

// Static CBN Nigerian commercial & fintech bank directory used because Squad's
// public API documentation does not expose an unauthenticated/dedicated bank-list endpoint.
var staticCBNBanks = []Bank{
	{Code: "044", Name: "Access Bank"},
	{Code: "023", Name: "Citibank Nigeria"},
	{Code: "050", Name: "Ecobank Nigeria"},
	{Code: "070", Name: "Fidelity Bank"},
	{Code: "011", Name: "First Bank of Nigeria"},
	{Code: "214", Name: "First City Monument Bank (FCMB)"},
	{Code: "103", Name: "Globus Bank"},
	{Code: "058", Name: "Guaranty Trust Bank (GTBank)"},
	{Code: "301", Name: "Jaiz Bank"},
	{Code: "082", Name: "Keystone Bank"},
	{Code: "50211", Name: "Kuda Bank"},
	{Code: "303", Name: "Lotus Bank"},
	{Code: "50515", Name: "Moniepoint Microfinance Bank"},
	{Code: "999992", Name: "OPay Digital Services"},
	{Code: "999991", Name: "PalmPay"},
	{Code: "526", Name: "Parallex Bank"},
	{Code: "076", Name: "Polaris Bank"},
	{Code: "101", Name: "Providus Bank"},
	{Code: "221", Name: "Stanbic IBTC Bank"},
	{Code: "068", Name: "Standard Chartered Bank"},
	{Code: "232", Name: "Sterling Bank"},
	{Code: "100", Name: "SunTrust Bank"},
	{Code: "302", Name: "TAJ Bank"},
	{Code: "102", Name: "Titan Trust Bank"},
	{Code: "032", Name: "Union Bank of Nigeria"},
	{Code: "033", Name: "United Bank for Africa (UBA)"},
	{Code: "215", Name: "Unity Bank"},
	{Code: "035", Name: "Wema Bank"},
	{Code: "057", Name: "Zenith Bank"},
}

func squadBankNameFromCode(code string) string {
	trimmed := strings.TrimSpace(code)
	for _, b := range staticCBNBanks {
		if b.Code == trimmed {
			return b.Name
		}
	}
	return trimmed
}

func (p *SquadProvider) ListBanks(ctx context.Context) ([]Bank, error) {
	out := make([]Bank, len(staticCBNBanks))
	copy(out, staticCBNBanks)
	return out, nil
}

type squadEnvelope[T any] struct {
	Status  int    `json:"status"`
	Success *bool  `json:"success"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

func (p *SquadProvider) doJSON(ctx context.Context, method, path string, reqBody any, out any) (int, string, error) {
	if p == nil || p.secretKey == "" {
		return 0, "", fmt.Errorf("%w: squad secret key not configured", ErrProviderUnavailable)
	}
	var bodyReader io.Reader
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return 0, "", err
		}
		bodyReader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, bodyReader)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Authorization", "Bearer "+p.secretKey)
	if reqBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return 0, "", fmt.Errorf("%w: %v", ErrProviderUnavailable, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return resp.StatusCode, "", fmt.Errorf("%w: read squad response: %v", ErrProviderUnavailable, err)
	}

	var meta struct {
		Status  int    `json:"status"`
		Success *bool  `json:"success"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(raw, &meta)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 || (meta.Success != nil && !*meta.Success) {
		msg := strings.TrimSpace(meta.Message)
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return resp.StatusCode, msg, fmt.Errorf("squad api error (%d): %s", resp.StatusCode, msg)
	}
	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			return resp.StatusCode, meta.Message, fmt.Errorf("decode squad response: %w", err)
		}
	}
	return resp.StatusCode, meta.Message, nil
}

func (p *SquadProvider) ResolveBankAccount(ctx context.Context, bankCode, accountNumber string) (string, error) {
	var resp squadEnvelope[struct {
		AccountName   string `json:"account_name"`
		AccountNumber string `json:"account_number"`
	}]
	_, _, err := p.doJSON(ctx, http.MethodPost, "/payout/account/lookup", map[string]any{
		"bank_code":      strings.TrimSpace(bankCode),
		"account_number": strings.TrimSpace(accountNumber),
	}, &resp)
	if err != nil {
		return "", err
	}
	name := strings.TrimSpace(resp.Data.AccountName)
	if name == "" {
		return "", fmt.Errorf("squad account lookup returned empty account name")
	}
	return name, nil
}

func (p *SquadProvider) CreateSubaccount(ctx context.Context, account MerchantPayoutAccount) (SubaccountRef, error) {
	displayName := strings.TrimSpace(account.BusinessName)
	if displayName == "" {
		displayName = strings.TrimSpace(account.AccountName)
	}
	bankName := squadBankNameFromCode(account.BankCode)
	var resp squadEnvelope[struct {
		SubMerchantID  string `json:"sub_merchant_id"`
		SubaccountCode string `json:"subaccount_code"`
		MerchantID     string `json:"merchant_id"`
		ID             string `json:"id"`
	}]
	_, _, err := p.doJSON(ctx, http.MethodPost, "/merchant/create-sub-users", map[string]any{
		"display_name":   displayName,
		"account_name":   strings.TrimSpace(account.AccountName),
		"account_number": strings.TrimSpace(account.AccountNumber),
		"bank_code":      strings.TrimSpace(account.BankCode),
		"bank":           bankName,
	}, &resp)
	if err != nil {
		return SubaccountRef{}, err
	}
	code := firstSquadNonEmpty(resp.Data.SubMerchantID, resp.Data.SubaccountCode, resp.Data.MerchantID, resp.Data.ID)
	if code == "" {
		return SubaccountRef{}, fmt.Errorf("squad subaccount creation returned empty sub_merchant_id")
	}
	return SubaccountRef{
		Code:      code,
		AccountID: firstSquadNonEmpty(resp.Data.ID, resp.Data.MerchantID),
	}, nil
}

func (p *SquadProvider) CreateOrderVirtualAccount(ctx context.Context, req OrderPaymentRequest) (VirtualAccount, error) {
	if !p.supportsDynamicVA {
		return VirtualAccount{}, fmt.Errorf("%w: dynamic virtual accounts are not enabled for Squad", ErrNotSupported)
	}
	firstName, lastName := splitSquadCustomerName(req.CustomerName)
	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "NGN"
	}
	payload := map[string]any{
		"customer_identifier": req.Reference,
		"first_name":          firstName,
		"last_name":           lastName,
		"email":               strings.TrimSpace(req.CustomerEmail),
		"amount":              req.AmountMinor,
		"currency":            currency,
	}
	if strings.TrimSpace(req.SubaccountRef) != "" {
		payload["sub_merchant_id"] = strings.TrimSpace(req.SubaccountRef)
	}

	var resp squadEnvelope[struct {
		VirtualAccountNumber string `json:"virtual_account_number"`
		AccountNumber        string `json:"account_number"`
		BankName             string `json:"bank_name"`
		AccountName          string `json:"account_name"`
	}]
	statusCode, msg, err := p.doJSON(ctx, http.MethodPost, "/virtual-account", payload, &resp)
	if err != nil {
		lowerMsg := strings.ToLower(msg)
		if statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden || statusCode == http.StatusNotFound || statusCode == http.StatusNotImplemented ||
			strings.Contains(lowerMsg, "not enabled") || strings.Contains(lowerMsg, "not supported") || strings.Contains(lowerMsg, "not authorized") || strings.Contains(lowerMsg, "pool") {
			return VirtualAccount{}, fmt.Errorf("%w: %s", ErrNotSupported, msg)
		}
		return VirtualAccount{}, err
	}
	accNum := firstSquadNonEmpty(resp.Data.VirtualAccountNumber, resp.Data.AccountNumber)
	if accNum == "" {
		return VirtualAccount{}, fmt.Errorf("%w: squad virtual account response missing account number", ErrNotSupported)
	}
	bankName := firstSquadNonEmpty(resp.Data.BankName, "GTBank")
	accName := firstSquadNonEmpty(resp.Data.AccountName, req.CustomerName)
	exp := req.ExpiresAt
	return VirtualAccount{
		AccountNumber: accNum,
		BankName:      bankName,
		AccountName:   accName,
		ExpiresAt:     &exp,
	}, nil
}

func (p *SquadProvider) InitializeCardCheckout(ctx context.Context, req OrderPaymentRequest) (CheckoutURL, error) {
	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "NGN"
	}
	payload := map[string]any{
		"amount":           req.AmountMinor,
		"email":            strings.TrimSpace(req.CustomerEmail),
		"currency":         currency,
		"initiate_type":    "inline",
		"transaction_ref":  req.Reference,
		"payment_channels": []string{"card"},
		"pass_charge":      strings.EqualFold(strings.TrimSpace(req.FeeBearer), "customer"),
	}
	if strings.TrimSpace(req.CallbackURL) != "" {
		payload["callback_url"] = strings.TrimSpace(req.CallbackURL)
	}
	if strings.TrimSpace(req.SubaccountRef) != "" {
		payload["sub_merchant_id"] = strings.TrimSpace(req.SubaccountRef)
	}

	var resp squadEnvelope[struct {
		CheckoutURL      string `json:"checkout_url"`
		AuthorizationURL string `json:"authorization_url"`
		TransactionRef   string `json:"transaction_ref"`
	}]
	_, _, err := p.doJSON(ctx, http.MethodPost, "/transaction/initiate", payload, &resp)
	if err != nil {
		return CheckoutURL{}, err
	}
	checkoutURL := firstSquadNonEmpty(resp.Data.CheckoutURL, resp.Data.AuthorizationURL)
	if checkoutURL == "" {
		return CheckoutURL{}, fmt.Errorf("squad transaction initiation returned empty checkout_url")
	}
	return CheckoutURL{
		AuthorizationURL: checkoutURL,
		Reference:        firstSquadNonEmpty(resp.Data.TransactionRef, req.Reference),
	}, nil
}

func (p *SquadProvider) VerifyTransaction(ctx context.Context, reference string) (PaymentResult, error) {
	var resp squadEnvelope[struct {
		TransactionRef    string `json:"transaction_ref"`
		TransactionAmount int64  `json:"transaction_amount"`
		MerchantAmount    int64  `json:"merchant_amount"`
		Fee               int64  `json:"fee"`
		TransactionStatus string `json:"transaction_status"`
		TransactionType   string `json:"transaction_type"`
		CreatedAt         string `json:"created_at"`
	}]
	statusCode, _, err := p.doJSON(ctx, http.MethodGet, "/transaction/verify/"+url.PathEscape(strings.TrimSpace(reference)), nil, &resp)
	if err != nil {
		if statusCode == http.StatusNotFound {
			return PaymentResult{}, ErrTransactionNotFound
		}
		return PaymentResult{}, err
	}

	feeMinor := resp.Data.Fee
	if feeMinor == 0 && resp.Data.MerchantAmount > 0 && resp.Data.TransactionAmount > resp.Data.MerchantAmount {
		feeMinor = resp.Data.TransactionAmount - resp.Data.MerchantAmount
	}
	paidAt := time.Now().UTC()
	if resp.Data.CreatedAt != "" {
		if parsed, pErr := time.Parse(time.RFC3339, resp.Data.CreatedAt); pErr == nil {
			paidAt = parsed
		}
	}

	return PaymentResult{
		Reference:   firstSquadNonEmpty(resp.Data.TransactionRef, reference),
		Status:      normalizeSquadVerifyStatus(resp.Data.TransactionStatus),
		AmountMinor: resp.Data.TransactionAmount,
		FeeMinor:    feeMinor,
		Channel:     strings.ToLower(strings.TrimSpace(resp.Data.TransactionType)),
		PaidAt:      paidAt,
	}, nil
}

func (p *SquadProvider) VerifyWebhook(rawBody []byte, headers http.Header) (Event, error) {
	if p == nil || strings.TrimSpace(p.webhookSecret) == "" {
		return Event{}, ErrInvalidWebhookSig
	}
	sigHex := strings.TrimSpace(headers.Get("x-squad-encrypted-body"))
	if sigHex == "" {
		sigHex = strings.TrimSpace(headers.Get("x-squad-signature"))
	}
	if sigHex == "" {
		return Event{}, ErrInvalidWebhookSig
	}
	sigBytes, err := hex.DecodeString(sigHex)
	if err != nil {
		return Event{}, ErrInvalidWebhookSig
	}
	mac := hmac.New(sha512.New, []byte(p.webhookSecret))
	mac.Write(rawBody)
	expectedMAC := mac.Sum(nil)
	if !hmac.Equal(sigBytes, expectedMAC) {
		return Event{}, ErrInvalidWebhookSig
	}

	var payload struct {
		Event             string `json:"Event"`
		EventLower        string `json:"event"`
		TransactionRef    string `json:"TransactionRef"`
		TransactionRefLow string `json:"transaction_ref"`
		Reference         string `json:"reference"`
		Amount            int64  `json:"amount"`
		Fee               int64  `json:"fee"`
		MerchantAmount    int64  `json:"merchant_amount"`
		Status            string `json:"status"`
		TransactionStatus string `json:"transaction_status"`
		CreatedAt         string `json:"created_at"`
		Body              struct {
			TransactionRef    string `json:"transaction_ref"`
			Reference         string `json:"reference"`
			Amount            int64  `json:"amount"`
			MerchantAmount    int64  `json:"merchant_amount"`
			Fee               int64  `json:"fee"`
			TransactionStatus string `json:"transaction_status"`
			Status            string `json:"status"`
			CreatedAt         string `json:"created_at"`
		} `json:"Body"`
	}
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return Event{}, fmt.Errorf("invalid squad webhook json: %w", err)
	}

	evName := firstSquadNonEmpty(payload.Event, payload.EventLower)
	ref := firstSquadNonEmpty(payload.Body.TransactionRef, payload.Body.Reference, payload.TransactionRef, payload.TransactionRefLow, payload.Reference)
	amount := payload.Body.Amount
	if amount == 0 {
		amount = payload.Amount
	}
	merchantAmt := payload.Body.MerchantAmount
	if merchantAmt == 0 {
		merchantAmt = payload.MerchantAmount
	}
	fee := payload.Body.Fee
	if fee == 0 {
		fee = payload.Fee
	}
	if fee == 0 && merchantAmt > 0 && amount > merchantAmt {
		fee = amount - merchantAmt
	}

	rawStatus := firstSquadNonEmpty(payload.Body.TransactionStatus, payload.Body.Status, payload.TransactionStatus, payload.Status)
	status, evType := mapSquadWebhookEvent(evName, rawStatus)
	paidAt := time.Now().UTC()
	if created := firstSquadNonEmpty(payload.Body.CreatedAt, payload.CreatedAt); created != "" {
		if parsed, pErr := time.Parse(time.RFC3339, created); pErr == nil {
			paidAt = parsed
		}
	}

	return Event{
		Provider:    "squad",
		Type:        evType,
		Reference:   ref,
		AmountMinor: amount,
		FeeMinor:    fee,
		PaidAt:      paidAt,
		Status:      status,
		Raw:         json.RawMessage(rawBody),
	}, nil
}

func mapSquadWebhookEvent(eventName, status string) (string, string) {
	evLow := strings.ToLower(strings.TrimSpace(eventName))
	stLow := strings.ToLower(strings.TrimSpace(status))
	switch {
	case stLow == "reversed" || stLow == "refunded" || strings.Contains(evLow, "revers") || strings.Contains(evLow, "refund"):
		return "rejected", "payment.rejected"
	case stLow == "failed" || stLow == "declined" || stLow == "abandoned" || strings.Contains(evLow, "fail"):
		return "failed", "charge.failed"
	case stLow == "success" || stLow == "successful" || stLow == "completed" || strings.Contains(evLow, "success"):
		return "paid", "charge.success"
	default:
		if evLow == "" {
			return "failed", "charge.unknown"
		}
		return "failed", evLow
	}
}

func normalizeSquadVerifyStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "success", "successful", "completed":
		return "paid"
	case "failed", "declined", "abandoned":
		return "failed"
	default:
		return "pending"
	}
}

func splitSquadCustomerName(name string) (string, string) {
	parts := strings.Fields(strings.TrimSpace(name))
	if len(parts) == 0 {
		return "Shopper", "Customer"
	}
	if len(parts) == 1 {
		return parts[0], parts[0]
	}
	return parts[0], strings.Join(parts[1:], " ")
}

func firstSquadNonEmpty(vals ...string) string {
	for _, v := range vals {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}
