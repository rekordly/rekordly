package finance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/crypto"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/notify"
	"github.com/rekordly/rekordly-api/internal/shipping"
	"github.com/shopspring/decimal"
)

func (s *Service) shipping() shipping.Client {
	if s.shippingClient != nil {
		return s.shippingClient
	}
	return shipping.NewShipbubbleClient("", 15*time.Second)
}

type StorefrontShipbubbleSettingsView struct {
	Connected          bool     `json:"connected"`
	APIKeyMasked       string   `json:"api_key_masked"`
	Strategy           string   `json:"strategy"`
	SelectedCouriers   []string `json:"selected_couriers"`
	DefaultWeightGrams int32    `json:"default_weight_grams"`
	WebhookURL         string   `json:"webhook_url"`
}

type UpdateStorefrontShipbubbleSettingsInput struct {
	APIKey             *string  `json:"api_key"`
	Disconnect         bool     `json:"disconnect"`
	Strategy           string   `json:"strategy"`
	SelectedCouriers   []string `json:"selected_couriers"`
	DefaultWeightGrams *int32   `json:"default_weight_grams"`
}

type PublicDeliveryRatesInput struct {
	Address string          `json:"address"`
	Name    string          `json:"name"`
	Email   string          `json:"email"`
	Phone   string          `json:"phone"`
	Lines   []CartLineInput `json:"lines"`
}

type PublicDeliveryRatesResponse struct {
	RequestToken string                 `json:"request_token"`
	ExpiresAt    string                 `json:"expires_at"`
	Cached       bool                   `json:"cached"`
	Rates        []shipping.CourierRate `json:"rates"`
}

func (s *Service) GetStorefrontShipbubbleSettings(ctx context.Context, wsID int64) (StorefrontShipbubbleSettingsView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, wsID)
	if errors.Is(err, pgx.ErrNoRows) {
		return StorefrontShipbubbleSettingsView{}, ErrNotFound
	}
	if err != nil {
		return StorefrontShipbubbleSettingsView{}, err
	}
	st, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{
		StorefrontID: sf.ID,
		WorkspaceID:  wsID,
	})
	if err != nil {
		return StorefrontShipbubbleSettingsView{}, err
	}
	if st.ShipbubbleApiKey.Valid && strings.TrimSpace(st.ShipbubbleApiKey.String) != "" && (!st.ShipbubbleWebhookToken.Valid || strings.TrimSpace(st.ShipbubbleWebhookToken.String) == "") {
		if tok, tokErr := randomHexToken(16); tokErr == nil && tok != "" {
			if updatedSt, uErr := s.queries.SetStorefrontShipbubbleWebhookToken(ctx, db.SetStorefrontShipbubbleWebhookTokenParams{
				WorkspaceID:            wsID,
				StorefrontID:           sf.ID,
				ShipbubbleWebhookToken: pgtype.Text{String: tok, Valid: true},
			}); uErr == nil {
				st = updatedSt
			}
		}
	}
	return s.buildShipbubbleSettingsView(st), nil
}

func (s *Service) shipbubbleWebhookURL(token string) string {
	tok := strings.TrimSpace(token)
	if tok == "" {
		return ""
	}
	base := strings.TrimRight(strings.TrimSpace(s.publicAPIBaseURL), "/")
	if base == "" {
		base = "http://localhost:8080"
	}
	return base + "/api/v1/webhooks/shipbubble/" + tok
}

func (s *Service) buildShipbubbleSettingsView(st db.StorefrontSetting) StorefrontShipbubbleSettingsView {
	var selected []string
	if len(st.ShipbubbleCouriers) > 0 {
		_ = json.Unmarshal(st.ShipbubbleCouriers, &selected)
	}
	if selected == nil {
		selected = []string{}
	}
	strategy := strings.TrimSpace(st.ShipbubbleStrategy)
	if strategy == "" {
		strategy = "cheapest"
	}
	defaultWeight := st.DefaultWeightGrams
	if defaultWeight <= 0 {
		defaultWeight = 500
	}
	masked := ""
	connected := false
	webhookURL := ""
	if st.ShipbubbleApiKey.Valid && strings.TrimSpace(st.ShipbubbleApiKey.String) != "" {
		connected = true
		if plain, decErr := crypto.Decrypt(st.ShipbubbleApiKey.String); decErr == nil {
			masked = crypto.MaskSecret(plain)
		} else {
			masked = "****"
		}
		if st.ShipbubbleWebhookToken.Valid && strings.TrimSpace(st.ShipbubbleWebhookToken.String) != "" {
			webhookURL = s.shipbubbleWebhookURL(st.ShipbubbleWebhookToken.String)
		}
	}
	return StorefrontShipbubbleSettingsView{
		Connected:          connected,
		APIKeyMasked:       masked,
		Strategy:           strategy,
		SelectedCouriers:   selected,
		DefaultWeightGrams: defaultWeight,
		WebhookURL:         webhookURL,
	}
}

func (s *Service) UpdateStorefrontShipbubbleSettings(ctx context.Context, wsID int64, in UpdateStorefrontShipbubbleSettingsInput) (StorefrontShipbubbleSettingsView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, wsID)
	if errors.Is(err, pgx.ErrNoRows) {
		return StorefrontShipbubbleSettingsView{}, ErrNotFound
	}
	if err != nil {
		return StorefrontShipbubbleSettingsView{}, err
	}
	st, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{
		StorefrontID: sf.ID,
		WorkspaceID:  wsID,
	})
	if err != nil {
		return StorefrontShipbubbleSettingsView{}, err
	}

	strategy := strings.ToLower(strings.TrimSpace(in.Strategy))
	if strategy == "" {
		strategy = st.ShipbubbleStrategy
	}
	if strategy != "cheapest" && strategy != "selected" {
		return StorefrontShipbubbleSettingsView{}, errors.New("shipbubble strategy must be cheapest or selected")
	}

	defaultWeight := st.DefaultWeightGrams
	if defaultWeight <= 0 {
		defaultWeight = 500
	}
	if in.DefaultWeightGrams != nil {
		if *in.DefaultWeightGrams <= 0 || *in.DefaultWeightGrams > 1000000 {
			return StorefrontShipbubbleSettingsView{}, errors.New("default weight must be between 1 and 1,000,000 grams")
		}
		defaultWeight = *in.DefaultWeightGrams
	}

	encKey := st.ShipbubbleApiKey
	webhookToken := st.ShipbubbleWebhookToken
	if in.Disconnect {
		encKey = pgtype.Text{Valid: false}
		webhookToken = pgtype.Text{Valid: false}
	} else if in.APIKey != nil && strings.TrimSpace(*in.APIKey) != "" {
		enc, encErr := crypto.Encrypt(strings.TrimSpace(*in.APIKey))
		if encErr != nil {
			return StorefrontShipbubbleSettingsView{}, fmt.Errorf("encrypt shipbubble api key: %w", encErr)
		}
		encKey = pgtype.Text{String: enc, Valid: true}
	}
	if encKey.Valid && strings.TrimSpace(encKey.String) != "" && (!webhookToken.Valid || strings.TrimSpace(webhookToken.String) == "") {
		tok, tokErr := randomHexToken(16)
		if tokErr != nil {
			return StorefrontShipbubbleSettingsView{}, fmt.Errorf("generate shipbubble webhook token: %w", tokErr)
		}
		webhookToken = pgtype.Text{String: tok, Valid: true}
	}

	couriersRaw := st.ShipbubbleCouriers
	if len(couriersRaw) == 0 {
		couriersRaw = []byte("[]")
	}
	if in.SelectedCouriers != nil {
		clean := make([]string, 0, len(in.SelectedCouriers))
		seen := map[string]bool{}
		for _, c := range in.SelectedCouriers {
			trimmed := strings.TrimSpace(c)
			if trimmed == "" || seen[strings.ToLower(trimmed)] {
				continue
			}
			seen[strings.ToLower(trimmed)] = true
			clean = append(clean, trimmed)
		}
		couriersRaw, _ = json.Marshal(clean)
	}

	updated, err := s.queries.UpdateStorefrontShipbubbleSettings(ctx, db.UpdateStorefrontShipbubbleSettingsParams{
		WorkspaceID:            wsID,
		StorefrontID:           sf.ID,
		ShipbubbleApiKey:       encKey,
		ShipbubbleStrategy:     strategy,
		ShipbubbleCouriers:     couriersRaw,
		DefaultWeightGrams:     defaultWeight,
		ShipbubbleWebhookToken: webhookToken,
	})
	if err != nil {
		return StorefrontShipbubbleSettingsView{}, err
	}
	invalidateStorefrontCache(sf.Slug)
	return s.buildShipbubbleSettingsView(updated), nil
}

func (s *Service) TestStorefrontShipbubbleConnection(ctx context.Context, wsID int64, rawAPIKey string) ([]shipping.CourierInfo, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, wsID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	st, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{
		StorefrontID: sf.ID,
		WorkspaceID:  wsID,
	})
	if err != nil {
		return nil, err
	}
	plainKey := strings.TrimSpace(rawAPIKey)
	if plainKey == "" {
		if !st.ShipbubbleApiKey.Valid || strings.TrimSpace(st.ShipbubbleApiKey.String) == "" {
			return nil, errors.New("enter a Shipbubble API key or save one first")
		}
		dec, decErr := crypto.Decrypt(st.ShipbubbleApiKey.String)
		if decErr != nil {
			return nil, fmt.Errorf("decrypt shipbubble api key: %w", decErr)
		}
		plainKey = dec
	}
	return s.shipping().ListCouriers(ctx, plainKey)
}

func (s *Service) GetPublicDeliveryRates(ctx context.Context, slugOrHost string, isHost bool, in PublicDeliveryRatesInput) (PublicDeliveryRatesResponse, error) {
	proj, err := s.GetPublicStorefrontProjection(ctx, slugOrHost, isHost, "", "")
	if err != nil {
		return PublicDeliveryRatesResponse{}, err
	}
	if len(in.Lines) == 0 {
		return PublicDeliveryRatesResponse{}, errors.New("cart items are required to calculate courier rates")
	}
	destAddr := sanitizePublicText(in.Address, 400)
	if destAddr == "" {
		return PublicDeliveryRatesResponse{}, errors.New("delivery address is required")
	}
	st, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{
		StorefrontID: proj.internalID,
		WorkspaceID:  proj.internalWS,
	})
	if err != nil {
		return PublicDeliveryRatesResponse{}, err
	}
	if !st.ShipbubbleApiKey.Valid || strings.TrimSpace(st.ShipbubbleApiKey.String) == "" {
		return PublicDeliveryRatesResponse{}, errors.New("courier delivery is not configured for this store")
	}
	apiKey, decErr := crypto.Decrypt(st.ShipbubbleApiKey.String)
	if decErr != nil || strings.TrimSpace(apiKey) == "" {
		return PublicDeliveryRatesResponse{}, errors.New("courier delivery key could not be loaded")
	}

	originAddr := ""
	originPhone := st.ContactPhone.String
	originEmail := st.ContactEmail.String
	if proj.internalOutletID.Valid {
		if loc, lErr := s.queries.GetInventoryLocationByID(ctx, db.GetInventoryLocationByIDParams{
			WorkspaceID: proj.internalWS,
			ID:          proj.internalOutletID.Int64,
		}); lErr == nil {
			if loc.Address.Valid && strings.TrimSpace(loc.Address.String) != "" {
				originAddr = strings.TrimSpace(loc.Address.String)
			}
			if loc.Phone.Valid && strings.TrimSpace(loc.Phone.String) != "" {
				originPhone = strings.TrimSpace(loc.Phone.String)
			}
		}
	}
	if originAddr == "" && st.Address.Valid {
		originAddr = strings.TrimSpace(st.Address.String)
	}
	if originAddr == "" {
		return PublicDeliveryRatesResponse{}, errors.New("store pickup address is required for courier rates")
	}
	if strings.TrimSpace(originPhone) == "" {
		originPhone = "+2348000000000"
	}
	if strings.TrimSpace(originEmail) == "" {
		originEmail = "orders@rekordly.com"
	}

	ids := make([]int64, 0, len(in.Lines))
	qtyByID := map[int64]decimal.Decimal{}
	for _, line := range in.Lines {
		if line.StorefrontProductID <= 0 {
			continue
		}
		qDec, parseErr := decimal.NewFromString(strings.TrimSpace(line.Quantity))
		if parseErr != nil || qDec.LessThanOrEqual(decimal.Zero) {
			return PublicDeliveryRatesResponse{}, errors.New("line quantity must be positive")
		}
		if _, seen := qtyByID[line.StorefrontProductID]; !seen {
			ids = append(ids, line.StorefrontProductID)
		}
		qtyByID[line.StorefrontProductID] = qtyByID[line.StorefrontProductID].Add(qDec)
	}
	if len(ids) == 0 {
		return PublicDeliveryRatesResponse{}, errors.New("cart items are required")
	}

	weightRows, err := s.queries.ListStorefrontProductWeights(ctx, db.ListStorefrontProductWeightsParams{
		StorefrontID: proj.internalID,
		Column2:      ids,
	})
	if err != nil {
		return PublicDeliveryRatesResponse{}, err
	}
	rowByID := map[int64]db.ListStorefrontProductWeightsRow{}
	for _, r := range weightRows {
		rowByID[r.StorefrontProductID] = r
	}

	defaultGrams := st.DefaultWeightGrams
	if defaultGrams <= 0 {
		defaultGrams = 500
	}
	var selectedCouriers []string
	if len(st.ShipbubbleCouriers) > 0 {
		_ = json.Unmarshal(st.ShipbubbleCouriers, &selectedCouriers)
	}
	strategy := strings.TrimSpace(st.ShipbubbleStrategy)
	if strategy == "" {
		strategy = "cheapest"
	}

	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	packageItems := make([]shipping.PackageItem, 0, len(ids))
	var keyBuilder strings.Builder
	keyBuilder.WriteString(fmt.Sprintf("%d|%s|%s|%s|%v|", proj.internalID, strings.ToLower(originAddr), strings.ToLower(destAddr), strategy, selectedCouriers))
	for _, spID := range ids {
		row, ok := rowByID[spID]
		if !ok {
			return PublicDeliveryRatesResponse{}, ErrNotFound
		}
		grams := defaultGrams
		if row.VariantWeightGrams.Valid && row.VariantWeightGrams.Int32 > 0 {
			grams = row.VariantWeightGrams.Int32
		} else if row.ProductWeightGrams.Valid && row.ProductWeightGrams.Int32 > 0 {
			grams = row.ProductWeightGrams.Int32
		}
		qtyDec := qtyByID[spID]
		qtyInt := int(qtyDec.Ceil().IntPart())
		if qtyInt < 1 {
			qtyInt = 1
		}
		unitWeightKG := decimal.NewFromInt(int64(grams)).Div(decimal.NewFromInt(1000)).StringFixed(3)
		priceMinor := int64(0)
		if row.PublicPriceMinor.Valid {
			priceMinor = row.PublicPriceMinor.Int64
		}
		itemTitle := strings.TrimSpace(row.PublicTitle.String)
		if itemTitle == "" {
			itemTitle = "Item"
		}
		unitAmount := decimal.NewFromInt(priceMinor).Div(decimal.NewFromInt(100)).StringFixed(2)
		packageItems = append(packageItems, shipping.PackageItem{
			Name:         itemTitle,
			Description:  itemTitle,
			UnitWeightKG: unitWeightKG,
			UnitAmount:   unitAmount,
			Quantity:     qtyInt,
		})
		keyBuilder.WriteString(fmt.Sprintf("%d:%d:%dg;", spID, qtyInt, grams))
	}

	sum := sha256.Sum256([]byte(keyBuilder.String()))
	cacheKey := hex.EncodeToString(sum[:])

	if cached, cErr := s.queries.GetStorefrontShippingRateCache(ctx, cacheKey); cErr == nil {
		var cachedRates []shipping.CourierRate
		if uErr := json.Unmarshal(cached.RatesJson, &cachedRates); uErr == nil && len(cachedRates) > 0 {
			return PublicDeliveryRatesResponse{
				RequestToken: cached.RequestToken,
				ExpiresAt:    cached.ExpiresAt.Time.UTC().Format(time.RFC3339),
				Cached:       true,
				Rates:        cachedRates,
			}, nil
		}
	}

	buyerName := sanitizePublicText(in.Name, 120)
	if buyerName == "" {
		buyerName = "Customer"
	}
	buyerEmail := strings.TrimSpace(in.Email)
	if buyerEmail == "" {
		buyerEmail = "shopper@rekordly.com"
	}
	buyerPhone := sanitizePublicText(in.Phone, 40)
	if buyerPhone == "" {
		buyerPhone = "+2348000000000"
	}

	senderAddr, err := s.shipping().ValidateAddress(ctx, apiKey, shipping.AddressInput{
		Name:    proj.Name,
		Email:   originEmail,
		Phone:   originPhone,
		Address: originAddr,
	})
	if err != nil {
		return PublicDeliveryRatesResponse{}, fmt.Errorf("validate pickup address: %w", err)
	}
	recvAddr, err := s.shipping().ValidateAddress(ctx, apiKey, shipping.AddressInput{
		Name:    buyerName,
		Email:   buyerEmail,
		Phone:   buyerPhone,
		Address: destAddr,
	})
	if err != nil {
		return PublicDeliveryRatesResponse{}, fmt.Errorf("validate delivery address: %w", err)
	}

	rawRates, err := s.shipping().FetchRates(ctx, apiKey, shipping.RateRequest{
		SenderAddressCode:   senderAddr.AddressCode,
		ReceiverAddressCode: recvAddr.AddressCode,
		PackageItems:        packageItems,
	})
	if err != nil {
		return PublicDeliveryRatesResponse{}, err
	}

	filtered := filterShipbubbleRates(rawRates.Couriers, strategy, selectedCouriers)
	if len(filtered) == 0 {
		return PublicDeliveryRatesResponse{}, errors.New("no courier options available for this address")
	}
	ratesBytes, _ := json.Marshal(filtered)
	expAt := rawRates.ExpiresAt
	if expAt.IsZero() {
		expAt = time.Now().UTC().Add(30 * time.Minute)
	}
	_, err = s.queries.UpsertStorefrontShippingRateCache(ctx, db.UpsertStorefrontShippingRateCacheParams{
		CacheKey:     cacheKey,
		WorkspaceID:  proj.internalWS,
		StorefrontID: proj.internalID,
		RequestToken: rawRates.RequestToken,
		RatesJson:    ratesBytes,
		ExpiresAt:    pgtype.Timestamptz{Time: expAt, Valid: true},
	})
	if err != nil {
		return PublicDeliveryRatesResponse{}, err
	}

	return PublicDeliveryRatesResponse{
		RequestToken: rawRates.RequestToken,
		ExpiresAt:    expAt.UTC().Format(time.RFC3339),
		Cached:       false,
		Rates:        filtered,
	}, nil
}

func filterShipbubbleRates(all []shipping.CourierRate, strategy string, selected []string) []shipping.CourierRate {
	if len(all) == 0 {
		return nil
	}
	out := make([]shipping.CourierRate, len(all))
	copy(out, all)
	sort.Slice(out, func(i, j int) bool {
		if out[i].TotalMinor != out[j].TotalMinor {
			return out[i].TotalMinor < out[j].TotalMinor
		}
		return out[i].CourierName < out[j].CourierName
	})
	if strategy == "selected" && len(selected) > 0 {
		wanted := map[string]bool{}
		for _, s := range selected {
			wanted[strings.ToLower(strings.TrimSpace(s))] = true
		}
		var matched []shipping.CourierRate
		for _, r := range out {
			if wanted[strings.ToLower(r.ServiceCode)] || wanted[strings.ToLower(r.CourierID)] || wanted[strings.ToLower(r.CourierName)] {
				matched = append(matched, r)
			}
		}
		return matched
	}
	if strategy == "cheapest" {
		return out[:1]
	}
	return out
}

func (s *Service) BookStorefrontShipment(ctx context.Context, wsID, orderID int64) error {
	order, err := s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{
		WorkspaceID: wsID,
		ID:          orderID,
	})
	if err != nil {
		return err
	}
	if order.DeliveryMethod != "courier" {
		return nil
	}
	if order.CourierTrackingNumber.Valid && strings.TrimSpace(order.CourierTrackingNumber.String) != "" {
		return nil // already booked idempotently
	}
	if order.PaymentStatus != "paid" {
		return errors.New("courier shipment can only be booked for paid orders")
	}

	st, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{
		StorefrontID: order.StorefrontID,
		WorkspaceID:  wsID,
	})
	if err != nil {
		return err
	}

	failBooking := func(reason string) error {
		_, _ = s.queries.UpdateStorefrontOrderCourierFull(ctx, db.UpdateStorefrontOrderCourierFullParams{
			WorkspaceID:           wsID,
			ID:                    order.ID,
			CourierName:           order.CourierName,
			CourierTrackingNumber: pgtype.Text{Valid: false},
			CourierStatus:         pgtype.Text{String: "booking_failed", Valid: true},
			CourierBookingError:   pgtype.Text{String: reason, Valid: true},
			CourierTrackingUrl:    pgtype.Text{Valid: false},
		})
		_, _ = s.queries.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
			WorkspaceID:     wsID,
			OrderID:         order.ID,
			EventType:       "courier_booking_failed",
			ActorType:       "system",
			CustomerVisible: false,
			Message:         optionalPgText("Courier booking failed: Retry — " + reason),
		})
		s.notifyStorefrontWorkspace(ctx, wsID, fmt.Sprintf("Courier booking failed for %s", order.OrderReference), "Courier booking failed: Retry from the order page ("+reason+")")
		if s.emailProvider != nil {
			merchantEmail := strings.TrimSpace(st.ContactEmail.String)
			if merchantEmail == "" {
				_ = s.pool.QueryRow(ctx, `
					SELECT u.email FROM workspace_memberships m
					JOIN users u ON u.id = m.user_id
					WHERE m.workspace_id = $1 AND m.status = 'active'
					ORDER BY m.id LIMIT 1
				`, wsID).Scan(&merchantEmail)
			}
			if strings.TrimSpace(merchantEmail) != "" {
				_, _ = s.emailProvider.SendEmail(ctx, notify.SendEmailRequest{
					To:       strings.TrimSpace(merchantEmail),
					Subject:  fmt.Sprintf("Courier booking failed: Order %s", order.OrderReference),
					HTMLBody: fmt.Sprintf("<p>Payment was received for order <strong>%s</strong>, but automatic Shipbubble courier booking failed.</p><p>Reason: %s</p><p>Open Store Orders in Rekordly and click Retry courier booking.</p>", order.OrderReference, reason),
				})
			}
		}
		return errors.New(reason)
	}

	if !order.RateToken.Valid || strings.TrimSpace(order.RateToken.String) == "" || !order.CourierServiceCode.Valid || strings.TrimSpace(order.CourierServiceCode.String) == "" {
		return failBooking("missing courier rate token or service code on order")
	}
	if !st.ShipbubbleApiKey.Valid || strings.TrimSpace(st.ShipbubbleApiKey.String) == "" {
		return failBooking("Shipbubble API key is missing")
	}
	apiKey, decErr := crypto.Decrypt(st.ShipbubbleApiKey.String)
	if decErr != nil {
		return failBooking("unable to decrypt Shipbubble API key")
	}

	label, err := s.shipping().CreateLabel(ctx, apiKey, shipping.LabelRequest{
		RequestToken: order.RateToken.String,
		ServiceCode:  order.CourierServiceCode.String,
		CourierID:    order.CourierID.String,
	})
	if err != nil {
		return failBooking(err.Error())
	}

	courierName := order.CourierName
	if strings.TrimSpace(label.CourierName) != "" {
		courierName = pgtype.Text{String: label.CourierName, Valid: true}
	}
	_, err = s.queries.UpdateStorefrontOrderCourierFull(ctx, db.UpdateStorefrontOrderCourierFullParams{
		WorkspaceID:           wsID,
		ID:                    order.ID,
		CourierName:           courierName,
		CourierTrackingNumber: pgtype.Text{String: label.TrackingNumber, Valid: true},
		CourierStatus:         pgtype.Text{String: "booked", Valid: true},
		CourierBookingError:   pgtype.Text{Valid: false},
		CourierTrackingUrl:    optionalPgText(label.TrackingURL),
	})
	if err != nil {
		return err
	}
	_, _ = s.queries.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     wsID,
		OrderID:         order.ID,
		EventType:       "courier_booked",
		ActorType:       "system",
		CustomerVisible: true,
		Message:         optionalPgText(fmt.Sprintf("Courier shipment booked (%s). Tracking number: %s", courierName.String, label.TrackingNumber)),
	})
	invalidateStorefrontCache("")
	return nil
}

func (s *Service) RetryStorefrontOrderCourierBooking(ctx context.Context, wsID, orderID int64) (MerchantOrderView, error) {
	order, err := s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{
		WorkspaceID: wsID,
		ID:          orderID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantOrderView{}, ErrNotFound
	}
	if err != nil {
		return MerchantOrderView{}, err
	}
	if err := s.BookStorefrontShipment(ctx, wsID, order.ID); err != nil {
		return MerchantOrderView{}, err
	}
	updated, err := s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{
		WorkspaceID: wsID,
		ID:          order.ID,
	})
	if err != nil {
		return MerchantOrderView{}, err
	}
	return s.buildMerchantOrderDetail(ctx, updated)
}

func (s *Service) HandleShipbubbleWebhook(ctx context.Context, webhookToken string, rawBody []byte, headers http.Header) error {
	tok := strings.TrimSpace(webhookToken)
	if tok == "" {
		return ErrInvalidWebhookSignature
	}

	st, err := s.queries.GetStorefrontSettingsByShipbubbleWebhookToken(ctx, pgtype.Text{String: tok, Valid: true})
	if err != nil || !st.ShipbubbleApiKey.Valid || strings.TrimSpace(st.ShipbubbleApiKey.String) == "" {
		return ErrInvalidWebhookSignature
	}
	apiKey, decErr := crypto.Decrypt(st.ShipbubbleApiKey.String)
	if decErr != nil || strings.TrimSpace(apiKey) == "" {
		return ErrInvalidWebhookSignature
	}

	ev, err := s.shipping().VerifyWebhook(apiKey, rawBody, headers)
	if err != nil {
		return ErrInvalidWebhookSignature
	}

	tracking := strings.TrimSpace(ev.TrackingNumber)
	if tracking == "" {
		var probe struct {
			TrackingNumber string `json:"tracking_number"`
			Data           struct {
				TrackingNumber string `json:"tracking_number"`
			} `json:"data"`
		}
		_ = json.Unmarshal(rawBody, &probe)
		tracking = strings.TrimSpace(probe.Data.TrackingNumber)
		if tracking == "" {
			tracking = strings.TrimSpace(probe.TrackingNumber)
		}
	}
	if tracking == "" {
		return ErrInvalidWebhookSignature
	}

	order, err := s.queries.GetStorefrontOrderByWorkspaceAndTrackingNumber(ctx, db.GetStorefrontOrderByWorkspaceAndTrackingNumberParams{
		WorkspaceID:           st.WorkspaceID,
		CourierTrackingNumber: pgtype.Text{String: tracking, Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidWebhookSignature
	}
	if err != nil {
		return err
	}

	eventID := fmt.Sprintf("sb:%d:%s:%s", order.ID, tracking, ev.Status)
	rec, recErr := s.queries.InsertPaymentWebhookEvent(ctx, db.InsertPaymentWebhookEventParams{
		Provider: "shipbubble",
		EventID:  eventID,
		Outcome:  "processed",
	})
	if errors.Is(recErr, pgx.ErrNoRows) || (recErr == nil && rec.ID == 0) {
		return nil // idempotent replay
	}
	if recErr != nil {
		return recErr
	}

	trackingURL := order.CourierTrackingUrl
	if strings.TrimSpace(ev.TrackingURL) != "" {
		trackingURL = pgtype.Text{String: ev.TrackingURL, Valid: true}
	}
	courierName := order.CourierName
	if strings.TrimSpace(ev.CourierName) != "" {
		courierName = pgtype.Text{String: ev.CourierName, Valid: true}
	}

	_, err = s.queries.UpdateStorefrontOrderCourierFull(ctx, db.UpdateStorefrontOrderCourierFullParams{
		WorkspaceID:           order.WorkspaceID,
		ID:                    order.ID,
		CourierName:           courierName,
		CourierTrackingNumber: order.CourierTrackingNumber,
		CourierStatus:         pgtype.Text{String: ev.Status, Valid: true},
		CourierBookingError:   pgtype.Text{Valid: false},
		CourierTrackingUrl:    trackingURL,
	})
	if err != nil {
		return err
	}

	msg := fmt.Sprintf("Courier update (%s): %s", courierName.String, strings.ReplaceAll(ev.Status, "_", " "))
	evType := "courier_" + ev.Status
	_, _ = s.queries.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     order.WorkspaceID,
		OrderID:         order.ID,
		EventType:       evType,
		ActorType:       "system",
		CustomerVisible: true,
		Message:         optionalPgText(msg),
	})

	if ev.Status == "delivered" && order.FulfilmentStatus != "fulfilled" {
		if _, fErr := s.FulfilStorefrontOrder(ctx, order.WorkspaceID, 0, order.ID, FulfilStorefrontOrderInput{
			ExpectedVersion: order.Version,
			RecipientName:   order.CustomerName,
			TrackingNote:    fmt.Sprintf("Delivered via %s (%s)", courierName.String, tracking),
		}); fErr != nil {
			return fErr
		}
	} else if ev.Status == "failed" {
		s.notifyStorefrontWorkspace(ctx, order.WorkspaceID, fmt.Sprintf("Courier delivery failed for %s", order.OrderReference), msg)
	}

	invalidateStorefrontCache("")
	return nil
}
