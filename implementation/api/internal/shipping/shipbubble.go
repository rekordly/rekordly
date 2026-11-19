package shipping

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
	"strconv"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

var (
	ErrProviderUnavailable = errors.New("SHIPPING_PROVIDER_UNAVAILABLE")
	ErrInvalidWebhookSig   = errors.New("INVALID_SHIPBUBBLE_SIGNATURE")
)

const DefaultCategoryID = 7717956

type AddressInput struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
}

type ValidatedAddress struct {
	AddressCode int64  `json:"address_code"`
	Formatted   string `json:"formatted_address"`
}

type CourierInfo struct {
	CourierID   string `json:"courier_id"`
	ServiceCode string `json:"service_code"`
	Name        string `json:"name"`
	Status      string `json:"status"`
}

type PackageItem struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	UnitWeightKG string `json:"unit_weight"`
	UnitAmount   string `json:"unit_amount"`
	Quantity     int    `json:"quantity"`
}

type RateRequest struct {
	SenderAddressCode   int64
	ReceiverAddressCode int64
	PickupDate          string
	CategoryID          int
	PackageItems        []PackageItem
}

type CourierRate struct {
	CourierID    string `json:"courier_id"`
	ServiceCode  string `json:"service_code"`
	CourierName  string `json:"courier_name"`
	TotalMinor   int64  `json:"total_minor,string"`
	EstimateText string `json:"estimate_text"`
	Currency     string `json:"currency"`
}

type RatesResponse struct {
	RequestToken string        `json:"request_token"`
	ExpiresAt    time.Time     `json:"expires_at"`
	Couriers     []CourierRate `json:"couriers"`
}

type LabelRequest struct {
	RequestToken string `json:"request_token"`
	ServiceCode  string `json:"service_code"`
	CourierID    string `json:"courier_id"`
}

type ShipmentLabel struct {
	OrderID        string `json:"order_id"`
	TrackingNumber string `json:"tracking_number"`
	TrackingURL    string `json:"tracking_url"`
	CourierName    string `json:"courier_name"`
	Status         string `json:"status"`
}

type WebhookEvent struct {
	Event          string          `json:"event"`
	Status         string          `json:"status"` // picked_up, in_transit, delivered, failed, pending, confirmed
	TrackingNumber string          `json:"tracking_number"`
	TrackingURL    string          `json:"tracking_url"`
	CourierName    string          `json:"courier_name"`
	OrderID        string          `json:"order_id"`
	Raw            json.RawMessage `json:"raw"`
}

type Client interface {
	ValidateAddress(ctx context.Context, apiKey string, in AddressInput) (ValidatedAddress, error)
	ListCouriers(ctx context.Context, apiKey string) ([]CourierInfo, error)
	FetchRates(ctx context.Context, apiKey string, req RateRequest) (RatesResponse, error)
	CreateLabel(ctx context.Context, apiKey string, req LabelRequest) (ShipmentLabel, error)
	VerifyWebhook(apiKey string, rawBody []byte, headers http.Header) (WebhookEvent, error)
}

type ShipbubbleClient struct {
	baseURL string
	client  *http.Client
}

func NewShipbubbleClient(baseURL string, timeout time.Duration) *ShipbubbleClient {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = "https://api.shipbubble.com/v1"
	}
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	return &ShipbubbleClient{
		baseURL: base,
		client:  &http.Client{Timeout: timeout},
	}
}

func (c *ShipbubbleClient) doJSON(ctx context.Context, apiKey, method, path string, reqBody any, out any) error {
	key := strings.TrimSpace(apiKey)
	if key == "" {
		return fmt.Errorf("%w: shipbubble api key is required", ErrProviderUnavailable)
	}
	var reader io.Reader
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	if reqBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrProviderUnavailable, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return fmt.Errorf("%w: read shipbubble response: %v", ErrProviderUnavailable, err)
	}

	var meta struct {
		Status  string `json:"status"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(raw, &meta)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || strings.EqualFold(meta.Status, "error") {
		msg := strings.TrimSpace(meta.Message)
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return fmt.Errorf("shipbubble api error (%d): %s", resp.StatusCode, msg)
	}
	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("decode shipbubble response: %w", err)
		}
	}
	return nil
}

func (c *ShipbubbleClient) ValidateAddress(ctx context.Context, apiKey string, in AddressInput) (ValidatedAddress, error) {
	var resp struct {
		Data struct {
			AddressCode      json.RawMessage `json:"address_code"`
			FormattedAddress string          `json:"formatted_address"`
		} `json:"data"`
	}
	err := c.doJSON(ctx, apiKey, http.MethodPost, "/shipping/address", map[string]any{
		"name":    strings.TrimSpace(in.Name),
		"email":   strings.TrimSpace(in.Email),
		"phone":   strings.TrimSpace(in.Phone),
		"address": strings.TrimSpace(in.Address),
	}, &resp)
	if err != nil {
		return ValidatedAddress{}, err
	}
	code, err := parseFlexInt64(resp.Data.AddressCode)
	if err != nil || code <= 0 {
		return ValidatedAddress{}, errors.New("shipbubble address validation returned no address_code")
	}
	return ValidatedAddress{
		AddressCode: code,
		Formatted:   strings.TrimSpace(resp.Data.FormattedAddress),
	}, nil
}

func (c *ShipbubbleClient) ListCouriers(ctx context.Context, apiKey string) ([]CourierInfo, error) {
	var resp struct {
		Data []struct {
			CourierID   json.RawMessage `json:"courier_id"`
			ID          json.RawMessage `json:"id"`
			ServiceCode string          `json:"service_code"`
			Name        string          `json:"name"`
			Status      string          `json:"status"`
		} `json:"data"`
	}
	if err := c.doJSON(ctx, apiKey, http.MethodGet, "/shipping/couriers", nil, &resp); err != nil {
		return nil, err
	}
	out := make([]CourierInfo, 0, len(resp.Data))
	for _, row := range resp.Data {
		status := strings.ToLower(strings.TrimSpace(row.Status))
		if status != "" && status != "operational" {
			continue
		}
		cid := firstShippingNonEmpty(parseFlexString(row.CourierID), parseFlexString(row.ID), row.ServiceCode)
		out = append(out, CourierInfo{
			CourierID:   cid,
			ServiceCode: strings.TrimSpace(row.ServiceCode),
			Name:        strings.TrimSpace(row.Name),
			Status:      status,
		})
	}
	return out, nil
}

func (c *ShipbubbleClient) FetchRates(ctx context.Context, apiKey string, req RateRequest) (RatesResponse, error) {
	pickupDate := strings.TrimSpace(req.PickupDate)
	if pickupDate == "" {
		pickupDate = time.Now().UTC().Add(24 * time.Hour).Format("2006-01-02")
	}
	catID := req.CategoryID
	if catID <= 0 {
		catID = DefaultCategoryID
	}
	payload := map[string]any{
		"sender_address_code":   req.SenderAddressCode,
		"reciever_address_code": req.ReceiverAddressCode, // Exact Shipbubble API spelling
		"pickup_date":           pickupDate,
		"category_id":           catID,
		"package_items":         req.PackageItems,
		"package_dimension": map[string]int{
			"length": 12,
			"width":  10,
			"height": 10,
		},
	}
	var resp struct {
		Data struct {
			RequestToken string `json:"request_token"`
			Couriers     []struct {
				CourierID       json.RawMessage `json:"courier_id"`
				ServiceCode     string          `json:"service_code"`
				CourierName     string          `json:"courier_name"`
				Total           json.RawMessage `json:"total"`
				Currency        string          `json:"currency"`
				DeliveryETATime string          `json:"delivery_eta_time"`
				DeliveryETA     string          `json:"delivery_eta"`
			} `json:"couriers"`
		} `json:"data"`
	}
	if err := c.doJSON(ctx, apiKey, http.MethodPost, "/shipping/fetch_rates", payload, &resp); err != nil {
		return RatesResponse{}, err
	}
	reqToken := strings.TrimSpace(resp.Data.RequestToken)
	if reqToken == "" {
		return RatesResponse{}, errors.New("shipbubble fetch_rates returned empty request_token")
	}
	rates := make([]CourierRate, 0, len(resp.Data.Couriers))
	for _, item := range resp.Data.Couriers {
		totalMinor, err := parseMajorAmountToMinor(item.Total)
		if err != nil || totalMinor < 0 {
			continue
		}
		curr := strings.ToUpper(strings.TrimSpace(item.Currency))
		if curr == "" {
			curr = "NGN"
		}
		rates = append(rates, CourierRate{
			CourierID:    firstShippingNonEmpty(parseFlexString(item.CourierID), item.ServiceCode),
			ServiceCode:  strings.TrimSpace(item.ServiceCode),
			CourierName:  strings.TrimSpace(item.CourierName),
			TotalMinor:   totalMinor,
			EstimateText: firstShippingNonEmpty(item.DeliveryETATime, item.DeliveryETA),
			Currency:     curr,
		})
	}
	return RatesResponse{
		RequestToken: reqToken,
		ExpiresAt:    time.Now().UTC().Add(30 * time.Minute),
		Couriers:     rates,
	}, nil
}

func (c *ShipbubbleClient) CreateLabel(ctx context.Context, apiKey string, req LabelRequest) (ShipmentLabel, error) {
	var resp struct {
		Data struct {
			OrderID        json.RawMessage `json:"order_id"`
			TrackingNumber string          `json:"tracking_number"`
			TrackingURL    string          `json:"tracking_url"`
			CourierName    string          `json:"courier_name"`
			Status         string          `json:"status"`
			Courier        struct {
				Name string `json:"name"`
			} `json:"courier"`
		} `json:"data"`
	}
	err := c.doJSON(ctx, apiKey, http.MethodPost, "/shipping/labels", map[string]any{
		"request_token": strings.TrimSpace(req.RequestToken),
		"service_code":  strings.TrimSpace(req.ServiceCode),
		"courier_id":    strings.TrimSpace(req.CourierID),
		"is_cod_label":  false,
	}, &resp)
	if err != nil {
		return ShipmentLabel{}, err
	}
	ordID := parseFlexString(resp.Data.OrderID)
	trackingNum := firstShippingNonEmpty(resp.Data.TrackingNumber, ordID)
	if trackingNum == "" {
		return ShipmentLabel{}, errors.New("shipbubble label creation returned no tracking number")
	}
	return ShipmentLabel{
		OrderID:        ordID,
		TrackingNumber: trackingNum,
		TrackingURL:    strings.TrimSpace(resp.Data.TrackingURL),
		CourierName:    firstShippingNonEmpty(resp.Data.CourierName, resp.Data.Courier.Name),
		Status:         normalizeShipbubbleStatus(resp.Data.Status, ""),
	}, nil
}

func (c *ShipbubbleClient) VerifyWebhook(apiKey string, rawBody []byte, headers http.Header) (WebhookEvent, error) {
	key := strings.TrimSpace(apiKey)
	if key == "" {
		return WebhookEvent{}, ErrInvalidWebhookSig
	}
	sigHex := strings.TrimSpace(headers.Get("x-ship-signature"))
	if sigHex == "" {
		return WebhookEvent{}, ErrInvalidWebhookSig
	}
	sigBytes, err := hex.DecodeString(sigHex)
	if err != nil {
		return WebhookEvent{}, ErrInvalidWebhookSig
	}
	mac := hmac.New(sha512.New, []byte(key))
	mac.Write(rawBody)
	if !hmac.Equal(sigBytes, mac.Sum(nil)) {
		return WebhookEvent{}, ErrInvalidWebhookSig
	}

	var payload struct {
		Event          string          `json:"event"`
		Status         string          `json:"status"`
		OrderID        json.RawMessage `json:"order_id"`
		TrackingNumber string          `json:"tracking_number"`
		TrackingURL    string          `json:"tracking_url"`
		CourierName    string          `json:"courier_name"`
		Courier        struct {
			Name string `json:"name"`
		} `json:"courier"`
		Data struct {
			Status         string          `json:"status"`
			OrderID        json.RawMessage `json:"order_id"`
			TrackingNumber string          `json:"tracking_number"`
			TrackingURL    string          `json:"tracking_url"`
			CourierName    string          `json:"courier_name"`
			Courier        struct {
				Name string `json:"name"`
			} `json:"courier"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return WebhookEvent{}, fmt.Errorf("invalid shipbubble webhook json: %w", err)
	}

	rawStatus := firstShippingNonEmpty(payload.Data.Status, payload.Status)
	return WebhookEvent{
		Event:          strings.TrimSpace(payload.Event),
		Status:         normalizeShipbubbleStatus(rawStatus, payload.Event),
		TrackingNumber: firstShippingNonEmpty(payload.Data.TrackingNumber, payload.TrackingNumber),
		TrackingURL:    firstShippingNonEmpty(payload.Data.TrackingURL, payload.TrackingURL),
		CourierName:    firstShippingNonEmpty(payload.Data.CourierName, payload.Data.Courier.Name, payload.CourierName, payload.Courier.Name),
		OrderID:        firstShippingNonEmpty(parseFlexString(payload.Data.OrderID), parseFlexString(payload.OrderID)),
		Raw:            json.RawMessage(rawBody),
	}, nil
}

func normalizeShipbubbleStatus(status, eventName string) string {
	st := strings.ToLower(strings.TrimSpace(status))
	ev := strings.ToLower(strings.TrimSpace(eventName))
	switch {
	case st == "completed" || st == "delivered":
		return "delivered"
	case st == "in_transit" || st == "in transit" || st == "on_hold":
		return "in_transit"
	case st == "picked_up" || st == "picked up" || st == "picked":
		return "picked_up"
	case st == "cancelled" || st == "canceled" || st == "failed" || st == "returned" || ev == "shipment.cancelled":
		return "failed"
	case st == "confirmed" || st == "pending":
		return st
	default:
		if st != "" {
			return st
		}
		return "pending"
	}
}

func parseFlexInt64(raw json.RawMessage) (int64, error) {
	s := strings.Trim(strings.TrimSpace(string(raw)), `"`)
	if s == "" || s == "null" {
		return 0, errors.New("empty integer")
	}
	if i, err := strconv.ParseInt(s, 10, 64); err == nil {
		return i, nil
	}
	d, err := decimal.NewFromString(s)
	if err != nil {
		return 0, err
	}
	return d.IntPart(), nil
}

func parseFlexString(raw json.RawMessage) string {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return ""
	}
	var str string
	if err := json.Unmarshal(raw, &str); err == nil {
		return strings.TrimSpace(str)
	}
	return strings.Trim(s, `"`)
}

func parseMajorAmountToMinor(raw json.RawMessage) (int64, error) {
	s := strings.Trim(strings.TrimSpace(string(raw)), `"`)
	if s == "" || s == "null" {
		return 0, errors.New("empty amount")
	}
	d, err := decimal.NewFromString(s)
	if err != nil {
		return 0, err
	}
	return d.Mul(decimal.NewFromInt(100)).Round(0).IntPart(), nil
}

func firstShippingNonEmpty(vals ...string) string {
	for _, v := range vals {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}
