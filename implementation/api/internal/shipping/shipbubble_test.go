package shipping

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func signShipbubble(apiKey string, raw []byte) string {
	mac := hmac.New(sha512.New, []byte(apiKey))
	mac.Write(raw)
	return hex.EncodeToString(mac.Sum(nil))
}

func TestShipbubbleClientAndWebhookVerification(t *testing.T) {
	apiKey := "sb_test_key_123"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer "+apiKey, r.Header.Get("Authorization"))
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/shipping/address":
			var body map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			code := 1001
			if body["address"] == "20 Buyer Road, Abuja" {
				code = 2002
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "success",
				"data": map[string]any{
					"address_code":      code,
					"formatted_address": body["address"],
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/shipping/couriers":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "success",
				"data": []map[string]any{
					{"courier_id": 11, "service_code": "gigl", "name": "GIG Logistics", "status": "operational"},
					{"courier_id": 22, "service_code": "dhl", "name": "DHL Express", "status": "maintenance"},
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/shipping/fetch_rates":
			var body map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			require.Equal(t, float64(1001), body["sender_address_code"])
			require.Equal(t, float64(2002), body["reciever_address_code"])
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "success",
				"data": map[string]any{
					"request_token": "sb_req_tok_1",
					"couriers": []map[string]any{
						{"courier_id": 11, "service_code": "gigl", "courier_name": "GIG Logistics", "total": 3500.50, "currency": "NGN", "delivery_eta_time": "2-3 days"},
						{"courier_id": "dhl_1", "service_code": "dhl", "courier_name": "DHL", "total": "6200", "currency": "NGN", "delivery_eta_time": "1 day"},
					},
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/shipping/labels":
			var body map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			require.Equal(t, "sb_req_tok_1", body["request_token"])
			require.Equal(t, "gigl", body["service_code"])
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "success",
				"data": map[string]any{
					"order_id":        "SB-901",
					"tracking_number": "TRK-SB-901",
					"tracking_url":    "https://track.shipbubble.com/TRK-SB-901",
					"courier_name":    "GIG Logistics",
					"status":          "confirmed",
				},
			})
		default:
			t.Fatalf("unexpected shipbubble call: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer srv.Close()

	c := NewShipbubbleClient(srv.URL, 5*time.Second)
	couriers, err := c.ListCouriers(context.Background(), apiKey)
	require.NoError(t, err)
	require.Len(t, couriers, 1)
	require.Equal(t, "gigl", couriers[0].ServiceCode)

	sender, err := c.ValidateAddress(context.Background(), apiKey, AddressInput{Name: "Store", Email: "store@example.com", Phone: "+2348001", Address: "1 Store Street, Lagos"})
	require.NoError(t, err)
	require.Equal(t, int64(1001), sender.AddressCode)

	recv, err := c.ValidateAddress(context.Background(), apiKey, AddressInput{Name: "Buyer", Email: "buyer@example.com", Phone: "+2348002", Address: "20 Buyer Road, Abuja"})
	require.NoError(t, err)
	require.Equal(t, int64(2002), recv.AddressCode)

	rates, err := c.FetchRates(context.Background(), apiKey, RateRequest{
		SenderAddressCode:   sender.AddressCode,
		ReceiverAddressCode: recv.AddressCode,
		PackageItems: []PackageItem{{
			Name: "Tote", Description: "Leather Tote", UnitWeightKG: "0.500", UnitAmount: "15000.00", Quantity: 1,
		}},
	})
	require.NoError(t, err)
	require.Equal(t, "sb_req_tok_1", rates.RequestToken)
	require.Len(t, rates.Couriers, 2)
	require.Equal(t, int64(350050), rates.Couriers[0].TotalMinor)
	require.Equal(t, int64(620000), rates.Couriers[1].TotalMinor)

	lbl, err := c.CreateLabel(context.Background(), apiKey, LabelRequest{
		RequestToken: rates.RequestToken,
		ServiceCode:  "gigl",
		CourierID:    "11",
	})
	require.NoError(t, err)
	require.Equal(t, "TRK-SB-901", lbl.TrackingNumber)
	require.Equal(t, "https://track.shipbubble.com/TRK-SB-901", lbl.TrackingURL)

	whBody := []byte(`{"event":"shipment.status.changed","status":"completed","tracking_number":"TRK-SB-901","courier_name":"GIG Logistics"}`)
	hdr := http.Header{}
	hdr.Set("x-ship-signature", signShipbubble(apiKey, whBody))
	ev, err := c.VerifyWebhook(apiKey, whBody, hdr)
	require.NoError(t, err)
	require.Equal(t, "delivered", ev.Status)
	require.Equal(t, "TRK-SB-901", ev.TrackingNumber)

	badHdr := http.Header{}
	badHdr.Set("x-ship-signature", "badhex")
	_, err = c.VerifyWebhook(apiKey, whBody, badHdr)
	require.ErrorIs(t, err, ErrInvalidWebhookSig)
}
