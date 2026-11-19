package finance

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/crypto"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/payments"
	"github.com/shopspring/decimal"
)

var (
	checkoutRateMu      sync.Mutex
	checkoutRateBuckets = map[string][]time.Time{}
)

func checkCheckoutRateLimit(bucketKey string, maxRequests int, window time.Duration) bool {
	if bucketKey == "" || maxRequests <= 0 {
		return true
	}
	now := time.Now().UTC()
	cutoff := now.Add(-window)
	checkoutRateMu.Lock()
	defer checkoutRateMu.Unlock()
	prev := checkoutRateBuckets[bucketKey]
	kept := prev[:0]
	for _, ts := range prev {
		if ts.After(cutoff) {
			kept = append(kept, ts)
		}
	}
	if len(kept) >= maxRequests {
		checkoutRateBuckets[bucketKey] = kept
		return false
	}
	kept = append(kept, now)
	checkoutRateBuckets[bucketKey] = kept
	return true
}

type PublicProductView struct {
	ID                 int64    `json:"id"`
	ProductID          int64    `json:"product_id"`
	VariantID          int64    `json:"variant_id"`
	CollectionID       *int64   `json:"collection_id,omitempty"`
	IsFeatured         bool     `json:"is_featured"`
	Title              string   `json:"title"`
	Description        *string  `json:"description,omitempty"`
	SKU                *string  `json:"sku,omitempty"`
	ImageURLs          []string `json:"image_urls"`
	PriceMinor         string   `json:"price_minor"`
	Currency           string   `json:"currency"`
	CurrencyExponent   int32    `json:"currency_exponent"`
	ProductKind        string   `json:"product_kind"`
	VariantName        string   `json:"variant_name"`
	UnitName           string   `json:"unit_name"`
	AvailabilityPolicy string   `json:"availability_policy"`
	AvailabilityState  string   `json:"availability_state"`
	AvailableQuantity  *string  `json:"available_quantity,omitempty"`
	MaxQtyPerOrder     int32    `json:"max_qty_per_order"`
	ContactOnly        bool     `json:"contact_only"`
	SeoSlug            *string  `json:"seo_slug,omitempty"`
	SeoTitle           *string  `json:"seo_title,omitempty"`
	SeoDescription     *string  `json:"seo_description,omitempty"`
}

type PublicStorefrontProjection struct {
	Name                         string                       `json:"name"`
	Slug                         string                       `json:"slug"`
	ThemeKey                     string                       `json:"theme_key"`
	Currency                     string                       `json:"currency"`
	CurrencyExponent             int32                        `json:"currency_exponent"`
	Tagline                      *string                      `json:"tagline,omitempty"`
	Description                  *string                      `json:"description,omitempty"`
	LogoURL                      *string                      `json:"logo_url,omitempty"`
	BannerURL                    *string                      `json:"banner_url,omitempty"`
	PrimaryColor                 string                       `json:"primary_color"`
	AccentColor                  string                       `json:"accent_color"`
	BackgroundColor              string                       `json:"background_color"`
	TextColor                    string                       `json:"text_color"`
	FontFamily                   string                       `json:"font_family"`
	Brand                        json.RawMessage              `json:"brand"`
	Sections                     []StorefrontSection          `json:"sections"`
	SectionOrder                 []string                     `json:"section_order"`
	ContactPhone                 *string                      `json:"contact_phone,omitempty"`
	ContactEmail                 *string                      `json:"contact_email,omitempty"`
	WhatsappNumber               *string                      `json:"whatsapp_number,omitempty"`
	Address                      *string                      `json:"address,omitempty"`
	BusinessHours                map[string]string            `json:"business_hours"`
	SocialLinks                  map[string]string            `json:"social_links"`
	DeliveryMethods              []string                     `json:"delivery_methods"`
	DeliveryGuidance             *string                      `json:"delivery_guidance,omitempty"`
	DefaultDeliveryFeeMinor      string                       `json:"default_delivery_fee_minor"`
	FreeDeliveryThresholdMinor   *string                      `json:"free_delivery_threshold_minor,omitempty"`
	DeliveryAreas                []StorefrontDeliveryAreaView `json:"delivery_areas"`
	PickupPoints                 []StorefrontPickupPointView  `json:"pickup_points"`
	PaymentBankTransferEnabled   bool                         `json:"payment_bank_transfer_enabled"`
	PaymentCardEnabled           bool                         `json:"payment_card_enabled"`
	PaymentManualTransferEnabled bool                         `json:"payment_manual_transfer_enabled"`
	PaymentCodEnabled            bool                         `json:"payment_cod_enabled"`
	OnlinePaymentsReady          bool                         `json:"online_payments_ready"`
	AvailablePaymentProviders    []string                     `json:"available_payment_providers"`
	FeeBearer                    string                       `json:"fee_bearer"`
	ShipbubbleEnabled            bool                         `json:"shipbubble_enabled"`
	ManualBankDetails            *ManualBankDetailsView       `json:"manual_bank_details,omitempty"`
	CheckoutRequireEmail         bool                         `json:"checkout_require_email"`
	CheckoutRequirePhone         bool                         `json:"checkout_require_phone"`
	ShowSoldOut                  bool                         `json:"show_sold_out"`
	ShowStockCount               bool                         `json:"show_stock_count"`
	LowStockThreshold            int32                        `json:"low_stock_threshold"`
	ReturnPolicy                 *string                      `json:"return_policy,omitempty"`
	PrivacyPolicy                *string                      `json:"privacy_policy,omitempty"`
	TermsPolicy                  *string                      `json:"terms_policy,omitempty"`
	CustomPolicy                 *string                      `json:"custom_policy,omitempty"`
	SeoTitle                     *string                      `json:"seo_title,omitempty"`
	SeoDescription               *string                      `json:"seo_description,omitempty"`
	SeoImageURL                  *string                      `json:"seo_image_url,omitempty"`
	SeoIndexable                 bool                         `json:"seo_indexable"`
	AvailabilityAsOf             string                       `json:"availability_as_of"`
	Collections                  []StorefrontCollectionView   `json:"collections"`
	Products                     []PublicProductView          `json:"products"`
	// Server-internal resolved fields hidden from public JSON
	internalID        int64
	internalWS        int64
	internalOutletID  pgtype.Int8
	internalSettingsV int32
}

type ManualBankDetailsView struct {
	BankName      string `json:"bank_name"`
	AccountNumber string `json:"account_number"`
	AccountName   string `json:"account_name"`
}

type storefrontReferrerContextKey struct{}
type storefrontVisitorContextKey struct{}

func storefrontReferrerClass(ctx context.Context) string {
	if class, ok := ctx.Value(storefrontReferrerContextKey{}).(string); ok && class != "" {
		return class
	}
	return "direct"
}

func storefrontVisitorHash(ctx context.Context) string {
	hash, _ := ctx.Value(storefrontVisitorContextKey{}).(string)
	return hash
}

func (s *Service) TrackStorefrontCheckoutStarted(ctx context.Context, slug string) error {
	sf, err := s.resolveActiveStorefrontRow(ctx, slug, false)
	if err != nil {
		return err
	}
	return s.queries.InsertStorefrontAnalyticsEvent(ctx, db.InsertStorefrontAnalyticsEventParams{WorkspaceID: sf.WorkspaceID, StorefrontID: sf.ID, EventType: "checkout_started", ReferrerClass: pgtype.Text{String: storefrontReferrerClass(ctx), Valid: true}})
}

func (s *Service) TrackStorefrontProductView(ctx context.Context, projection PublicStorefrontProjection, storefrontProductID int64) {
	if storefrontProductID <= 0 || projection.internalID <= 0 {
		return
	}
	_ = s.queries.InsertStorefrontAnalyticsEvent(ctx, db.InsertStorefrontAnalyticsEventParams{WorkspaceID: projection.internalWS, StorefrontID: projection.internalID, EventType: "product_view", StorefrontProductID: pgtype.Int8{Int64: storefrontProductID, Valid: true}, ReferrerClass: pgtype.Text{String: storefrontReferrerClass(ctx), Valid: true}})
}

func (s *Service) resolveActiveStorefrontRow(ctx context.Context, slugOrHost string, isHost bool) (db.Storefront, error) {
	target := strings.ToLower(strings.TrimSpace(slugOrHost))
	if target == "" {
		return db.Storefront{}, ErrStorefrontNotPublished
	}
	var sf db.Storefront
	var err error
	if isHost {
		target = strings.Split(target, ":")[0]
		dom, dErr := s.queries.GetStorefrontDomainByHost(ctx, target)
		if errors.Is(dErr, pgx.ErrNoRows) {
			return db.Storefront{}, ErrStorefrontNotPublished
		}
		if dErr != nil {
			return db.Storefront{}, dErr
		}
		if dom.Status == "grace" || dom.Status == "disabled" {
			return db.Storefront{}, ErrStorefrontEntitlementLocked
		}
		if dom.Status != "active" {
			return db.Storefront{}, ErrStorefrontNotPublished
		}
		sf, err = s.queries.GetStorefrontBySlug(ctx, dom.StorefrontSlug)
	} else {
		sf, err = s.queries.GetStorefrontBySlug(ctx, target)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Storefront{}, ErrStorefrontNotPublished
	}
	if err != nil {
		return db.Storefront{}, err
	}
	if sf.EntitlementStatus != "active" {
		return db.Storefront{}, ErrStorefrontEntitlementLocked
	}
	if sf.Status != "published" {
		return db.Storefront{}, ErrStorefrontNotPublished
	}
	return sf, nil
}

func computePublicAvailability(kind, policy string, lowThreshold int32, avail decimal.Decimal) (state string, visible bool, exactStr *string) {
	if kind != "stock_tracked" {
		if policy == "hide_unavailable" {
			return "in_stock", true, nil
		}
		return "in_stock", true, nil
	}
	isAvail := avail.GreaterThan(decimal.Zero)
	if !isAvail {
		switch policy {
		case "hide_unavailable":
			return "out_of_stock", false, nil
		case "allow_request":
			return "request_only", true, nil
		default:
			zero := "0"
			if policy == "exact_quantity" {
				return "out_of_stock", true, &zero
			}
			return "out_of_stock", true, nil
		}
	}
	if policy == "low_stock" && avail.LessThanOrEqual(decimal.NewFromInt(int64(lowThreshold))) {
		return "low_stock", true, nil
	}
	if policy == "exact_quantity" {
		s := avail.Truncate(2).String()
		return "in_stock", true, &s
	}
	return "in_stock", true, nil
}

func (s *Service) GetPublicStorefrontProjection(ctx context.Context, slugOrHost string, isHost bool, filterQuery, collectionSlug string) (PublicStorefrontProjection, error) {
	sf, err := s.resolveActiveStorefrontRow(ctx, slugOrHost, isHost)
	if err != nil {
		return PublicStorefrontProjection{}, err
	}

	var proj PublicStorefrontProjection
	cacheKey := sf.Slug
	storefrontCacheMu.RLock()
	cached, ok := storefrontProjectionMap[cacheKey]
	storefrontCacheMu.RUnlock()
	if ok && cached.expiresAt.After(time.Now().UTC()) {
		proj = cached.data
	} else {
		st, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{StorefrontID: sf.ID, WorkspaceID: sf.WorkspaceID})
		if err != nil {
			return PublicStorefrontProjection{}, err
		}
		cols, err := s.queries.ListPublicStorefrontCollections(ctx, sf.ID)
		if err != nil {
			return PublicStorefrontProjection{}, err
		}
		colViews := make([]StorefrontCollectionView, 0, len(cols))
		for _, c := range cols {
			colViews = append(colViews, StorefrontCollectionView{
				ID:          c.ID,
				Name:        c.Name,
				Slug:        string(c.Slug),
				Description: nullableText(c.Description),
				ImageURL:    nullableText(c.ImageUrl),
				Position:    c.Position,
				IsVisible:   true,
			})
		}
		prods, err := s.queries.ListPublicStorefrontProducts(ctx, db.ListPublicStorefrontProductsParams{
			StorefrontID: sf.ID,
			OutletID:     sf.DefaultOutletID,
		})
		if err != nil {
			return PublicStorefrontProjection{}, err
		}
		prodViews := make([]PublicProductView, 0, len(prods))
		for _, p := range prods {
			state, visible, _ := computePublicAvailability(p.ProductKind, p.AvailabilityPolicy, p.LowStockThreshold, p.AvailableQuantity)
			if p.ProductKind == "stock_tracked" && p.AvailableQuantity.LessThanOrEqual(decimal.Zero) {
				visible = st.ShowSoldOut
				state = "out_of_stock"
			}
			if !visible {
				continue
			}
			var exact *string
			if p.ProductKind == "stock_tracked" && p.AvailableQuantity.GreaterThan(decimal.Zero) && (st.ShowStockCount || p.AvailableQuantity.LessThanOrEqual(decimal.NewFromInt(int64(st.LowStockThreshold)))) {
				quantity := p.AvailableQuantity.Truncate(2).String()
				exact = &quantity
			}
			if p.ProductKind == "stock_tracked" && p.AvailableQuantity.GreaterThan(decimal.Zero) && p.AvailableQuantity.LessThanOrEqual(decimal.NewFromInt(int64(st.LowStockThreshold))) {
				state = "low_stock"
			}
			var imgs []string
			_ = json.Unmarshal(p.ImageUrls, &imgs)
			if imgs == nil {
				imgs = []string{}
			}
			prodViews = append(prodViews, PublicProductView{
				ID:                 p.ID,
				ProductID:          p.ProductID,
				VariantID:          p.VariantID,
				CollectionID:       nullableInt8(p.CollectionID),
				IsFeatured:         p.IsFeatured,
				Title:              p.PublicTitle,
				Description:        nullableText(p.PublicDescription),
				SKU:                nullableText(p.PublicSku),
				ImageURLs:          imgs,
				PriceMinor:         fmt.Sprint(p.PublicPriceMinor),
				Currency:           p.Currency,
				CurrencyExponent:   p.CurrencyExponent,
				ProductKind:        p.ProductKind,
				VariantName:        p.VariantName,
				UnitName:           p.UnitName,
				AvailabilityPolicy: p.AvailabilityPolicy,
				AvailabilityState:  state,
				AvailableQuantity:  exact,
				MaxQtyPerOrder:     p.MaxQtyPerOrder,
				ContactOnly:        p.ContactOnly,
				SeoSlug:            nullableText(p.SeoSlug),
				SeoTitle:           nullableText(p.SeoTitle),
				SeoDescription:     nullableText(p.SeoDescription),
			})
		}
		stView := settingsToView(st)
		areas, areaErr := s.queries.GetActiveStorefrontDeliveryAreas(ctx, db.GetActiveStorefrontDeliveryAreasParams{WorkspaceID: sf.WorkspaceID, StorefrontID: sf.ID})
		if areaErr != nil {
			return PublicStorefrontProjection{}, areaErr
		}
		publicAreas := make([]StorefrontDeliveryAreaView, 0, len(areas))
		for _, area := range areas {
			publicAreas = append(publicAreas, StorefrontDeliveryAreaView{
				ID:           area.ID,
				Name:         area.Name,
				FeeMinor:     fmt.Sprint(area.FeeMinor),
				Description:  area.Description,
				Position:     area.Position,
				IsActive:     true,
				State:        nullableText(area.State),
				EstimateText: area.EstimateText,
				OutletID:     nullableInt8(area.OutletID),
			})
		}
		ppRows, _ := s.queries.ListStorefrontPickupPoints(ctx, sf.WorkspaceID)
		pickupPoints := make([]StorefrontPickupPointView, 0, len(ppRows))
		for _, pp := range ppRows {
			pickupPoints = append(pickupPoints, StorefrontPickupPointView{
				ID:         pp.ID,
				Name:       pp.Name,
				Address:    nullableText(pp.Address),
				Phone:      nullableText(pp.Phone),
				PickupNote: pp.PickupNote,
			})
		}
		payoutAccounts, _ := s.queries.ListMerchantPayoutAccounts(ctx, sf.WorkspaceID)
		activeProviders := activeRegisteredProviders(payoutAccounts, s.storefrontPaymentProviders)
		_, primaryProv := selectPrimaryPayoutAccount(payoutAccounts, s.storefrontPaymentProviders, "")
		onlineReady := len(activeProviders) > 0
		bankTransferSupported := onlineReady && payments.ProviderSupportsMethod(primaryProv, "virtual_account")
		cardSupported := onlineReady && payments.ProviderSupportsMethod(primaryProv, "card")
		onlineReady = onlineReady && (bankTransferSupported || cardSupported)
		var manualBank *ManualBankDetailsView
		if st.PaymentManualTransferEnabled && st.ManualBankAccountNumber.Valid && strings.TrimSpace(st.ManualBankAccountNumber.String) != "" {
			manualBank = &ManualBankDetailsView{
				BankName:      st.ManualBankName.String,
				AccountNumber: st.ManualBankAccountNumber.String,
				AccountName:   st.ManualBankAccountName.String,
			}
		}
		shipbubbleOn := st.ShipbubbleApiKey.Valid && strings.TrimSpace(st.ShipbubbleApiKey.String) != ""
		var brand StorefrontBrand
		_ = json.Unmarshal(st.Brand, &brand)
		brand.ResolvedPalette = resolveStorefrontPalette(brand)
		brandJSON, _ := json.Marshal(brand)
		var sections []StorefrontSection
		_ = json.Unmarshal(st.Sections, &sections)
		if sections == nil {
			sections = []StorefrontSection{}
		}
		proj = PublicStorefrontProjection{
			Name:                         sf.Name,
			Slug:                         sf.Slug,
			ThemeKey:                     sf.ThemeKey,
			Currency:                     sf.Currency,
			CurrencyExponent:             sf.CurrencyExponent,
			Tagline:                      stView.Tagline,
			Description:                  stView.Description,
			LogoURL:                      stView.LogoURL,
			BannerURL:                    stView.BannerURL,
			PrimaryColor:                 stView.PrimaryColor,
			AccentColor:                  stView.AccentColor,
			BackgroundColor:              stView.BackgroundColor,
			TextColor:                    stView.TextColor,
			FontFamily:                   stView.FontFamily,
			Brand:                        brandJSON,
			Sections:                     sections,
			SectionOrder:                 stView.SectionOrder,
			ContactPhone:                 stView.ContactPhone,
			ContactEmail:                 stView.ContactEmail,
			WhatsappNumber:               stView.WhatsappNumber,
			Address:                      stView.Address,
			BusinessHours:                stView.BusinessHours,
			SocialLinks:                  stView.SocialLinks,
			DeliveryMethods:              stView.DeliveryMethods,
			DeliveryGuidance:             stView.DeliveryGuidance,
			DefaultDeliveryFeeMinor:      stView.DefaultDeliveryFeeMinor,
			FreeDeliveryThresholdMinor:   stView.FreeDeliveryThresholdMinor,
			DeliveryAreas:                publicAreas,
			PickupPoints:                 pickupPoints,
			PaymentBankTransferEnabled:   st.PaymentBankTransferEnabled && bankTransferSupported,
			PaymentCardEnabled:           st.PaymentCardEnabled && cardSupported,
			PaymentManualTransferEnabled: st.PaymentManualTransferEnabled,
			PaymentCodEnabled:            st.PaymentCodEnabled,
			OnlinePaymentsReady:          onlineReady,
			AvailablePaymentProviders:    activeProviders,
			FeeBearer:                    st.FeeBearer,
			ShipbubbleEnabled:            shipbubbleOn,
			ManualBankDetails:            manualBank,
			CheckoutRequireEmail:         stView.CheckoutRequireEmail,
			CheckoutRequirePhone:         stView.CheckoutRequirePhone,
			ShowSoldOut:                  stView.ShowSoldOut,
			ShowStockCount:               stView.ShowStockCount,
			LowStockThreshold:            stView.LowStockThreshold,
			ReturnPolicy:                 stView.ReturnPolicy,
			PrivacyPolicy:                stView.PrivacyPolicy,
			TermsPolicy:                  stView.TermsPolicy,
			CustomPolicy:                 stView.CustomPolicy,
			SeoTitle:                     stView.SeoTitle,
			SeoDescription:               stView.SeoDescription,
			SeoImageURL:                  stView.SeoImageURL,
			SeoIndexable:                 stView.SeoIndexable,
			AvailabilityAsOf:             time.Now().UTC().Format(time.RFC3339),
			Collections:                  colViews,
			Products:                     prodViews,
			internalID:                   sf.ID,
			internalWS:                   sf.WorkspaceID,
			internalOutletID:             sf.DefaultOutletID,
			internalSettingsV:            stView.Version,
		}
		storefrontCacheMu.Lock()
		storefrontProjectionMap[cacheKey] = cachedStorefrontEntry{
			expiresAt: time.Now().UTC().Add(15 * time.Second),
			data:      proj,
		}
		storefrontCacheMu.Unlock()
	}

	// Privacy-minimized analytics event
	qClean := strings.ToLower(strings.TrimSpace(filterQuery))
	var searchHash pgtype.Text
	if qClean != "" {
		sum := sha256.Sum256([]byte(qClean))
		searchHash = pgtype.Text{String: hex.EncodeToString(sum[:8]), Valid: true}
	}
	referrer := storefrontReferrerClass(ctx)
	_ = s.queries.InsertStorefrontPageView(ctx, db.InsertStorefrontPageViewParams{WorkspaceID: proj.internalWS, StorefrontID: proj.internalID, ReferrerClass: pgtype.Text{String: referrer, Valid: true}, SearchQueryHash: searchHash, VisitorKeyHash: pgtype.Text{String: storefrontVisitorHash(ctx), Valid: storefrontVisitorHash(ctx) != ""}})
	if collection := strings.TrimSpace(collectionSlug); collection != "" {
		var collectionID int64
		for _, item := range proj.Collections {
			if strings.EqualFold(item.Slug, collection) {
				collectionID = item.ID
				break
			}
		}
		_ = s.queries.InsertStorefrontAnalyticsEvent(ctx, db.InsertStorefrontAnalyticsEventParams{WorkspaceID: proj.internalWS, StorefrontID: proj.internalID, EventType: "collection_view", CollectionID: pgtype.Int8{Int64: collectionID, Valid: collectionID > 0}, ReferrerClass: pgtype.Text{String: referrer, Valid: true}})
	}
	if qClean != "" {
		_ = s.queries.InsertStorefrontAnalyticsEvent(ctx, db.InsertStorefrontAnalyticsEventParams{WorkspaceID: proj.internalWS, StorefrontID: proj.internalID, EventType: "search", SearchQueryHash: searchHash, ReferrerClass: pgtype.Text{String: referrer, Valid: true}})
	}

	// Apply safe filtering over allowlisted fields only
	if qClean != "" || strings.TrimSpace(collectionSlug) != "" {
		var targetColID int64
		if cs := strings.ToLower(strings.TrimSpace(collectionSlug)); cs != "" {
			for _, c := range proj.Collections {
				if c.Slug == cs || fmt.Sprint(c.ID) == cs {
					targetColID = c.ID
					break
				}
			}
		}
		filtered := make([]PublicProductView, 0, len(proj.Products))
		for _, p := range proj.Products {
			if targetColID > 0 && (p.CollectionID == nil || *p.CollectionID != targetColID) {
				continue
			}
			if qClean != "" {
				haystack := strings.ToLower(p.Title)
				if p.Description != nil {
					haystack += " " + strings.ToLower(*p.Description)
				}
				if p.SKU != nil {
					haystack += " " + strings.ToLower(*p.SKU)
				}
				if !strings.Contains(haystack, qClean) {
					continue
				}
			}
			filtered = append(filtered, p)
		}
		proj.Products = filtered
	}
	return proj, nil
}

// Carts & Server Recalculation

type CartLineInput struct {
	StorefrontProductID int64  `json:"storefront_product_id"`
	Quantity            string `json:"quantity"`
	ExpectedPriceMinor  string `json:"expected_price_minor"`
}

type ValidatedCartLineView struct {
	StorefrontProductID int64  `json:"storefront_product_id"`
	Title               string `json:"title"`
	VariantName         string `json:"variant_name"`
	Quantity            string `json:"quantity"`
	UnitPriceMinor      string `json:"unit_price_minor"`
	LineTotalMinor      string `json:"line_total_minor"`
	AvailabilityState   string `json:"availability_state"`
	Changed             bool   `json:"changed"`
	ChangeReason        string `json:"change_reason,omitempty"`
}

type ValidatedCartView struct {
	CartToken         string                  `json:"cart_token,omitempty"`
	Currency          string                  `json:"currency"`
	CurrencyExponent  int32                   `json:"currency_exponent"`
	SubtotalMinor     string                  `json:"subtotal_minor"`
	EstimatedTaxMinor string                  `json:"estimated_tax_minor"`
	DeliveryFeeMinor  string                  `json:"delivery_fee_minor"`
	DeliveryAreaID    int64                   `json:"delivery_area_id,omitempty"`
	DeliveryAreaName  string                  `json:"delivery_area_name,omitempty"`
	EstimatedTotal    string                  `json:"estimated_total_minor"`
	HasChanges        bool                    `json:"has_changes"`
	Lines             []ValidatedCartLineView `json:"lines"`
}

func (s *Service) ValidateAndRecalculateCart(ctx context.Context, slugOrHost string, isHost bool, rawLines []CartLineInput, deliveryMethod string) (ValidatedCartView, PublicStorefrontProjection, error) {
	return s.ValidateAndRecalculateCartWithArea(ctx, slugOrHost, isHost, rawLines, deliveryMethod, 0)
}

func (s *Service) ValidateAndRecalculateCartWithArea(ctx context.Context, slugOrHost string, isHost bool, rawLines []CartLineInput, deliveryMethod string, deliveryAreaID int64) (ValidatedCartView, PublicStorefrontProjection, error) {
	invalidateStorefrontCache(slugOrHost)
	proj, err := s.GetPublicStorefrontProjection(ctx, slugOrHost, isHost, "", "")
	if err != nil {
		return ValidatedCartView{}, PublicStorefrontProjection{}, err
	}
	byID := map[int64]PublicProductView{}
	for _, p := range proj.Products {
		byID[p.ID] = p
	}
	var subtotal int64
	hasChanges := false
	outLines := make([]ValidatedCartLineView, 0, len(rawLines))
	for _, item := range rawLines {
		qty, _, qErr := parseRequestQuantity(item.Quantity)
		if qErr != nil {
			return ValidatedCartView{}, proj, qErr
		}
		p, ok := byID[item.StorefrontProductID]
		if !ok {
			hasChanges = true
			outLines = append(outLines, ValidatedCartLineView{
				StorefrontProductID: item.StorefrontProductID,
				Quantity:            qty.StringFixed(4),
				Changed:             true,
				ChangeReason:        "Item is no longer published or active",
			})
			continue
		}
		if qty.GreaterThan(decimal.NewFromInt(int64(p.MaxQtyPerOrder))) {
			return ValidatedCartView{}, proj, fmt.Errorf("quantity for %s exceeds limit of %d per order", p.Title, p.MaxQtyPerOrder)
		}
		unitMinor, _ := decimal.NewFromString(p.PriceMinor)
		unitInt := unitMinor.IntPart()
		changed := false
		reason := ""
		if strings.TrimSpace(item.ExpectedPriceMinor) != "" && strings.TrimSpace(item.ExpectedPriceMinor) != p.PriceMinor {
			changed = true
			hasChanges = true
			reason = "Public price updated since added to cart"
		}
		var lineTotal int64
		if unitInt > 0 {
			lineTotal, err = requestLineTotal(unitInt, qty)
			if err != nil {
				return ValidatedCartView{}, proj, err
			}
		}
		subtotal += lineTotal
		outLines = append(outLines, ValidatedCartLineView{
			StorefrontProductID: p.ID,
			Title:               p.Title,
			VariantName:         p.VariantName,
			Quantity:            qty.StringFixed(4),
			UnitPriceMinor:      p.PriceMinor,
			LineTotalMinor:      fmt.Sprint(lineTotal),
			AvailabilityState:   p.AvailabilityState,
			Changed:             changed,
			ChangeReason:        reason,
		})
	}
	var delivFee int64
	var selectedAreaName string
	if deliveryMethod == "merchant_delivery" {
		if len(proj.DeliveryAreas) > 0 {
			for _, area := range proj.DeliveryAreas {
				if area.ID == deliveryAreaID {
					delivFee, _ = strconv.ParseInt(area.FeeMinor, 10, 64)
					selectedAreaName = area.Name
					break
				}
			}
			if deliveryAreaID <= 0 {
				return ValidatedCartView{}, proj, errors.New("choose a delivery area")
			}
			if selectedAreaName == "" {
				return ValidatedCartView{}, proj, errors.New("that delivery area is no longer available")
			}
		} else {
			if deliveryAreaID > 0 {
				return ValidatedCartView{}, proj, errors.New("that delivery area is no longer available")
			}
			d, _ := decimal.NewFromString(proj.DefaultDeliveryFeeMinor)
			delivFee = d.IntPart()
		}
		if proj.FreeDeliveryThresholdMinor != nil {
			threshold, _ := strconv.ParseInt(*proj.FreeDeliveryThresholdMinor, 10, 64)
			if threshold > 0 && subtotal >= threshold {
				delivFee = 0
			}
		}
	}
	return ValidatedCartView{
		Currency:          proj.Currency,
		CurrencyExponent:  proj.CurrencyExponent,
		SubtotalMinor:     fmt.Sprint(subtotal),
		EstimatedTaxMinor: "0",
		DeliveryFeeMinor:  fmt.Sprint(delivFee),
		DeliveryAreaID:    deliveryAreaID,
		DeliveryAreaName:  selectedAreaName,
		EstimatedTotal:    fmt.Sprint(subtotal + delivFee),
		HasChanges:        hasChanges,
		Lines:             outLines,
	}, proj, nil
}

func (s *Service) UpsertVisitorCart(ctx context.Context, slug string, existingToken string, rawLines []CartLineInput, deliveryMethod string) (ValidatedCartView, error) {
	return s.UpsertVisitorCartWithArea(ctx, slug, existingToken, rawLines, deliveryMethod, 0)
}

func (s *Service) UpsertVisitorCartWithArea(ctx context.Context, slug string, existingToken string, rawLines []CartLineInput, deliveryMethod string, deliveryAreaID int64) (ValidatedCartView, error) {
	if len(rawLines) == 0 {
		return ValidatedCartView{}, errors.New("at least one item is required")
	}
	calc, proj, err := s.ValidateAndRecalculateCartWithArea(ctx, slug, false, rawLines, deliveryMethod, deliveryAreaID)
	if err != nil {
		return ValidatedCartView{}, err
	}
	if calc.HasChanges {
		return calc, ErrCartItemChanged
	}
	token := strings.TrimSpace(existingToken)
	var cart db.StorefrontCart
	if token != "" {
		cart, err = s.queries.GetStorefrontCartByHash(ctx, db.GetStorefrontCartByHashParams{
			CartTokenHash: hashOpaqueToken(token),
			StorefrontID:  proj.internalID,
		})
	}
	if token == "" || err != nil {
		token, err = randomHexToken(24)
		if err != nil {
			return ValidatedCartView{}, err
		}
		cart, err = s.queries.CreateStorefrontCart(ctx, db.CreateStorefrontCartParams{
			WorkspaceID:   proj.internalWS,
			StorefrontID:  proj.internalID,
			CartTokenHash: hashOpaqueToken(token),
			Currency:      proj.Currency,
			ExpiresAt:     pgtype.Timestamptz{Time: time.Now().UTC().Add(14 * 24 * time.Hour), Valid: true},
		})
		if err != nil {
			return ValidatedCartView{}, err
		}
	} else {
		_ = s.queries.ClearStorefrontCart(ctx, cart.ID)
	}
	for _, l := range calc.Lines {
		qty, _ := decimal.NewFromString(l.Quantity)
		uPrice, _ := decimal.NewFromString(l.UnitPriceMinor)
		if _, err := s.queries.UpsertStorefrontCartLine(ctx, db.UpsertStorefrontCartLineParams{
			CartID:                 cart.ID,
			StorefrontProductID:    l.StorefrontProductID,
			Quantity:               qty,
			UnitPriceSnapshotMinor: uPrice.IntPart(),
		}); err != nil {
			return ValidatedCartView{}, err
		}
		_ = s.queries.InsertStorefrontAnalyticsEvent(ctx, db.InsertStorefrontAnalyticsEventParams{
			WorkspaceID:         proj.internalWS,
			StorefrontID:        proj.internalID,
			EventType:           "add_to_cart",
			StorefrontProductID: pgtype.Int8{Int64: l.StorefrontProductID, Valid: true},
		})
	}
	calc.CartToken = token
	return calc, nil
}

func (s *Service) GetVisitorCart(ctx context.Context, slug, rawToken, deliveryMethod string) (ValidatedCartView, error) {
	return s.GetVisitorCartWithArea(ctx, slug, rawToken, deliveryMethod, 0)
}

func (s *Service) GetVisitorCartWithArea(ctx context.Context, slug, rawToken, deliveryMethod string, deliveryAreaID int64) (ValidatedCartView, error) {
	token := strings.TrimSpace(rawToken)
	if token == "" {
		return ValidatedCartView{}, ErrNotFound
	}
	sf, err := s.resolveActiveStorefrontRow(ctx, slug, false)
	if err != nil {
		return ValidatedCartView{}, err
	}
	cart, err := s.queries.GetStorefrontCartByHash(ctx, db.GetStorefrontCartByHashParams{
		CartTokenHash: hashOpaqueToken(token),
		StorefrontID:  sf.ID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return ValidatedCartView{}, ErrNotFound
	}
	if err != nil {
		return ValidatedCartView{}, err
	}
	lines, err := s.queries.ListStorefrontCartLines(ctx, cart.ID)
	if err != nil {
		return ValidatedCartView{}, err
	}
	if len(lines) == 0 {
		return ValidatedCartView{CartToken: token, Currency: sf.Currency, CurrencyExponent: sf.CurrencyExponent, Lines: []ValidatedCartLineView{}}, nil
	}
	rawLines := make([]CartLineInput, 0, len(lines))
	for _, l := range lines {
		rawLines = append(rawLines, CartLineInput{
			StorefrontProductID: l.StorefrontProductID,
			Quantity:            l.Quantity.String(),
		})
	}
	calc, _, err := s.ValidateAndRecalculateCartWithArea(ctx, slug, false, rawLines, deliveryMethod, deliveryAreaID)
	if err != nil {
		return ValidatedCartView{}, err
	}
	calc.CartToken = token
	return calc, nil
}

// Guest Checkout Request (Atomic Stock Holds & Double-Entry Checkout Launch)

func generatePickupCode() string {
	const charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

type PublicVirtualAccountView struct {
	AccountNumber string  `json:"account_number"`
	BankName      string  `json:"bank_name"`
	AccountName   string  `json:"account_name"`
	ExpiresAt     *string `json:"expires_at,omitempty"`
}

type PublicPaymentAttemptView struct {
	ID                   int64   `json:"id"`
	Provider             string  `json:"provider"`
	Method               string  `json:"method"`
	Reference            string  `json:"reference"`
	AmountMinor          int64   `json:"amount_minor"`
	VirtualAccountNumber *string `json:"virtual_account_number,omitempty"`
	BankName             *string `json:"bank_name,omitempty"`
	ExpiresAt            *string `json:"expires_at,omitempty"`
	Status               string  `json:"status"`
}

type GuestCheckoutInput struct {
	ClientKey             string          `json:"-"`
	ShopperID             int64           `json:"-"`
	SaveDetails           bool            `json:"save_details"`
	CartToken             string          `json:"cart_token"`
	Lines                 []CartLineInput `json:"lines"`
	CustomerName          string          `json:"customer_name"`
	CustomerPhone         string          `json:"customer_phone"`
	CustomerEmail         string          `json:"customer_email"`
	OrganizationName      string          `json:"organization_name"`
	PreferredContact      string          `json:"preferred_contact_method"`
	DeliveryMethod        string          `json:"delivery_method"`
	DeliveryAreaID        int64           `json:"delivery_area_id"`
	PickupPointID         int64           `json:"pickup_point_id"`
	PaymentMethod         string          `json:"payment_method"`
	PaymentProvider       string          `json:"payment_provider"`
	RateToken             string          `json:"rate_token"`
	CourierServiceCode    string          `json:"courier_service_code"`
	CourierID             string          `json:"courier_id"`
	DeliveryAddress       string          `json:"delivery_address"`
	DeliveryLandmark      string          `json:"delivery_landmark"`
	PreferredDeliveryTime string          `json:"preferred_delivery_time"`
	CustomerNote          string          `json:"customer_note"`
	PolicyAcknowledged    bool            `json:"policy_acknowledged"`
	IdempotencyKey        string          `json:"idempotency_key"`
}

type GuestCheckoutConfirmation struct {
	OrderReference     string                    `json:"order_reference"`
	StatusToken        string                    `json:"status_token,omitempty"`
	CommercialStatus   string                    `json:"commercial_status"`
	FulfilmentStatus   string                    `json:"fulfilment_status"`
	PaymentStatus      string                    `json:"payment_status"`
	Currency           string                    `json:"currency"`
	TotalMinor         string                    `json:"total_minor"`
	ProcessingFeeMinor int64                     `json:"processing_fee_minor"`
	Message            string                    `json:"message"`
	HoldType           *string                   `json:"hold_type,omitempty"`
	HoldExpiresAt      *string                   `json:"hold_expires_at,omitempty"`
	VirtualAccount     *PublicVirtualAccountView `json:"virtual_account,omitempty"`
	CardCheckoutURL    *string                   `json:"card_checkout_url,omitempty"`
	PickupCode         *string                   `json:"pickup_code,omitempty"`
}

func (s *Service) SubmitGuestCheckout(ctx context.Context, slugOrHost string, isHost bool, in GuestCheckoutInput) (GuestCheckoutConfirmation, error) {
	key := strings.TrimSpace(in.IdempotencyKey)
	if key == "" || len(key) > 200 {
		return GuestCheckoutConfirmation{}, errors.New("idempotency key is required")
	}
	if !in.PolicyAcknowledged {
		return GuestCheckoutConfirmation{}, errors.New("policy acknowledgement is required")
	}
	rateBucket := slugOrHost + "|" + strings.TrimSpace(in.ClientKey)
	if !checkCheckoutRateLimit(rateBucket, 20, time.Minute) {
		return GuestCheckoutConfirmation{}, ErrCheckoutRateLimited
	}

	delivMethod := strings.TrimSpace(in.DeliveryMethod)
	if delivMethod != "pickup" && delivMethod != "merchant_delivery" && delivMethod != "customer_arranged" && delivMethod != "courier" {
		return GuestCheckoutConfirmation{}, errors.New("delivery method must be pickup, merchant_delivery, customer_arranged, or courier")
	}
	custName := sanitizePublicText(in.CustomerName, 160)
	custPhone := sanitizePublicText(in.CustomerPhone, 50)
	custEmail := sanitizePublicText(in.CustomerEmail, 160)
	delivAddr := sanitizePublicText(in.DeliveryAddress, 400)
	if custName == "" {
		return GuestCheckoutConfirmation{}, errors.New("customer name is required")
	}
	if (delivMethod == "merchant_delivery" || delivMethod == "courier") && delivAddr == "" {
		return GuestCheckoutConfirmation{}, errors.New("delivery address is required for delivery")
	}

	// Recompute authoritative server totals & visibility
	calc, proj, err := s.ValidateAndRecalculateCartWithArea(ctx, slugOrHost, isHost, in.Lines, delivMethod, in.DeliveryAreaID)
	if err != nil {
		return GuestCheckoutConfirmation{}, err
	}
	if len(calc.Lines) == 0 {
		return GuestCheckoutConfirmation{}, errors.New("at least one product is required to submit an order request")
	}
	if calc.HasChanges {
		return GuestCheckoutConfirmation{}, ErrCartItemChanged
	}
	if proj.CheckoutRequirePhone && custPhone == "" {
		return GuestCheckoutConfirmation{}, errors.New("phone number is required by merchant policy")
	}
	if proj.CheckoutRequireEmail && custEmail == "" {
		return GuestCheckoutConfirmation{}, errors.New("email address is required by merchant policy")
	}

	if old, err := s.queries.GetStorefrontOrderByIdempotency(ctx, db.GetStorefrontOrderByIdempotencyParams{
		WorkspaceID:    proj.internalWS,
		IdempotencyKey: key,
	}); err == nil {
		var va *PublicVirtualAccountView
		var cardURL *string
		if att, aErr := s.queries.GetPublicPaymentAttemptByOrder(ctx, old.ID); aErr == nil {
			if att.Method == "virtual_account" && att.VirtualAccountNumber.Valid {
				var expStr *string
				if att.ExpiresAt.Valid {
					s := att.ExpiresAt.Time.UTC().Format(time.RFC3339)
					expStr = &s
				}
				va = &PublicVirtualAccountView{
					AccountNumber: att.VirtualAccountNumber.String,
					BankName:      att.BankName.String,
					AccountName:   "REKORDLY / " + old.CustomerName,
					ExpiresAt:     expStr,
				}
			}
		}
		var expStr *string
		if old.ReservationExpiresAt.Valid {
			s := old.ReservationExpiresAt.Time.UTC().Format(time.RFC3339)
			expStr = &s
		}
		var rawTok string
		if old.PublicTokenEnc.Valid && old.PublicTokenEnc.String != "" {
			if dec, dErr := crypto.Decrypt(old.PublicTokenEnc.String); dErr == nil {
				rawTok = dec
			}
		}
		return GuestCheckoutConfirmation{
			OrderReference:     old.OrderReference,
			StatusToken:        rawTok,
			CommercialStatus:   old.CommercialStatus,
			FulfilmentStatus:   old.FulfilmentStatus,
			PaymentStatus:      old.PaymentStatus,
			Currency:           old.Currency,
			TotalMinor:         fmt.Sprint(old.TotalMinor),
			ProcessingFeeMinor: old.ProcessingFeeMinor,
			Message:            "Order placed; hold active.",
			HoldType:           nullableText(old.HoldType),
			HoldExpiresAt:      expStr,
			VirtualAccount:     va,
			CardCheckoutURL:    cardURL,
			PickupCode:         nullableText(old.PickupCode),
		}, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return GuestCheckoutConfirmation{}, err
	}

	// Fetch Storefront Settings for Hold durations & fee bearer
	settings, _ := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{
		StorefrontID: proj.internalID,
		WorkspaceID:  proj.internalWS,
	})

	// Resolve active provider + payout account
	payoutAccounts, _ := s.queries.ListMerchantPayoutAccounts(ctx, proj.internalWS)
	chosenPayout, chosenProvider := selectPrimaryPayoutAccount(payoutAccounts, s.storefrontPaymentProviders, in.PaymentProvider)

	// Determine & validate payment method
	payMethod := strings.ToLower(strings.TrimSpace(in.PaymentMethod))
	if payMethod == "" {
		if chosenProvider != nil && settings.PaymentBankTransferEnabled && payments.ProviderSupportsMethod(chosenProvider, "virtual_account") {
			payMethod = "virtual_account"
		} else if chosenProvider != nil && settings.PaymentCardEnabled && payments.ProviderSupportsMethod(chosenProvider, "card") {
			payMethod = "card"
		} else if delivMethod != "courier" && settings.PaymentManualTransferEnabled {
			payMethod = "manual_transfer"
		} else if delivMethod != "courier" && settings.PaymentCodEnabled {
			payMethod = "cod"
		} else if delivMethod == "courier" {
			return GuestCheckoutConfirmation{}, errors.New("online payment provider does not support courier checkout")
		} else {
			payMethod = "manual_transfer"
		}
	}
	switch payMethod {
	case "virtual_account":
		if !settings.PaymentBankTransferEnabled && in.PaymentMethod != "" {
			return GuestCheckoutConfirmation{}, errors.New("online bank transfer is disabled for this store")
		}
		if chosenProvider != nil && !payments.ProviderSupportsMethod(chosenProvider, "virtual_account") {
			return GuestCheckoutConfirmation{}, errors.New("online bank transfer is not supported by the active payment provider")
		}
	case "card":
		if !settings.PaymentCardEnabled {
			return GuestCheckoutConfirmation{}, errors.New("card payment is disabled for this store")
		}
		if chosenProvider != nil && !payments.ProviderSupportsMethod(chosenProvider, "card") {
			return GuestCheckoutConfirmation{}, errors.New("card payment is not supported by the active payment provider")
		}
	case "manual_transfer":
		if delivMethod == "courier" {
			return GuestCheckoutConfirmation{}, errors.New("courier delivery requires online payment")
		}
		if !settings.PaymentManualTransferEnabled && in.PaymentMethod != "" {
			return GuestCheckoutConfirmation{}, errors.New("manual bank transfer is disabled for this store")
		}
	case "cod":
		if delivMethod == "courier" {
			return GuestCheckoutConfirmation{}, errors.New("courier delivery requires online payment")
		}
		if !settings.PaymentCodEnabled {
			return GuestCheckoutConfirmation{}, errors.New("pay on delivery or pickup is disabled for this store")
		}
	default:
		return GuestCheckoutConfirmation{}, errors.New("unsupported payment method")
	}

	if (payMethod == "virtual_account" || payMethod == "card") && custEmail == "" {
		return GuestCheckoutConfirmation{}, errors.New("email address is required for online payment")
	}

	// Determine outlet: pickup point OR area outlet OR storefront default outlet
	targetOutletID := proj.internalOutletID
	var pPointID pgtype.Int8
	if delivMethod == "pickup" && in.PickupPointID > 0 {
		var validPickup bool
		_ = s.pool.QueryRow(ctx, `
			SELECT true FROM inventory_locations
			WHERE workspace_id = $1 AND id = $2 AND is_active = true AND is_pickup_point = true
		`, proj.internalWS, in.PickupPointID).Scan(&validPickup)
		if !validPickup {
			return GuestCheckoutConfirmation{}, errors.New("selected pickup point is unavailable")
		}
		targetOutletID = pgtype.Int8{Int64: in.PickupPointID, Valid: true}
		pPointID = targetOutletID
	} else if delivMethod == "merchant_delivery" && in.DeliveryAreaID > 0 {
		for _, area := range proj.DeliveryAreas {
			if area.ID == in.DeliveryAreaID && area.OutletID != nil && *area.OutletID > 0 {
				targetOutletID = pgtype.Int8{Int64: *area.OutletID, Valid: true}
				break
			}
		}
	}

	// Courier rate validation hook (populated when Shipbubble rate token is passed in Section 5)
	var courierFeeMinor int64
	var courierName, courierServiceCode, courierID, rateToken pgtype.Text
	if delivMethod == "courier" {
		rate, cErr := s.resolveAndValidateCourierRate(ctx, proj.internalID, in.RateToken, in.CourierServiceCode, in.CourierID)
		if cErr != nil {
			return GuestCheckoutConfirmation{}, cErr
		}
		courierFeeMinor = rate.TotalMinor
		rateToken = optionalPgText(rate.RequestToken)
		courierName = optionalPgText(rate.CourierName)
		courierServiceCode = optionalPgText(rate.ServiceCode)
		courierID = optionalPgText(rate.CourierID)
	}

	// Determine hold type (matching CHECK constraint in 000070) and countdown duration
	holdType := "payment"
	holdDuration := 15 * time.Minute
	if settings.HoldPaymentMinutes > 0 {
		holdDuration = time.Duration(settings.HoldPaymentMinutes) * time.Minute
	}
	switch payMethod {
	case "manual_transfer":
		holdType = "transfer_manual"
		holdDuration = 2 * time.Hour
		if settings.HoldManualTransferHours > 0 {
			holdDuration = time.Duration(settings.HoldManualTransferHours) * time.Hour
		}
	case "cod":
		if delivMethod == "pickup" {
			holdType = "pickup"
			holdDuration = 48 * time.Hour
			if settings.HoldPickupHours > 0 {
				holdDuration = time.Duration(settings.HoldPickupHours) * time.Hour
			}
		} else {
			holdType = "awaiting_confirmation"
			holdDuration = 2 * time.Hour
			if settings.HoldConfirmationHours > 0 {
				holdDuration = time.Duration(settings.HoldConfirmationHours) * time.Hour
			}
		}
	case "card", "virtual_account":
		holdType = "payment"
	}
	holdExpiresAt := time.Now().UTC().Add(holdDuration)

	// Processing fee calculation (if customer bears fee)
	subVal, _ := decimal.NewFromString(calc.SubtotalMinor)
	delivVal, _ := decimal.NewFromString(calc.DeliveryFeeMinor)
	delivMinor := delivVal.IntPart()
	if delivMethod == "courier" {
		delivMinor = courierFeeMinor
	}
	baseTotal := subVal.IntPart() + delivMinor
	processingFeeMinor := int64(0)
	if settings.FeeBearer == "customer" && (payMethod == "virtual_account" || payMethod == "card") {
		fee := int64(float64(baseTotal) * 0.015)
		if fee > 200000 {
			fee = 200000
		}
		processingFeeMinor = fee
	}
	finalTotal := baseTotal + processingFeeMinor

	var pickupCode pgtype.Text
	if delivMethod == "pickup" {
		code := generatePickupCode()
		pickupCode = pgtype.Text{String: code, Valid: true}
	}

	publicProdRows, err := s.queries.ListPublicStorefrontProducts(ctx, db.ListPublicStorefrontProductsParams{
		StorefrontID: proj.internalID,
		OutletID:     targetOutletID,
	})
	if err != nil {
		return GuestCheckoutConfirmation{}, err
	}
	prodMap := map[int64]db.ListPublicStorefrontProductsRow{}
	for _, r := range publicProdRows {
		prodMap[r.ID] = r
	}

	rawStatusToken, err := randomHexToken(24)
	if err != nil {
		return GuestCheckoutConfirmation{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return GuestCheckoutConfirmation{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	// Verify and lock stock for tracked items
	type reservedStockItem struct {
		lineIndex int
		productID int64
		variantID int64
		quantity  decimal.Decimal
		balance   db.InventoryBalance
	}
	toReserve := make([]reservedStockItem, 0, len(calc.Lines))
	for idx, cl := range calc.Lines {
		row, ok := prodMap[cl.StorefrontProductID]
		if !ok {
			return GuestCheckoutConfirmation{}, ErrCartItemChanged
		}
		if row.ProductKind == "stock_tracked" {
			bal, bErr := q.GetInventoryBalanceForUpdate(ctx, db.GetInventoryBalanceForUpdateParams{
				WorkspaceID: proj.internalWS,
				LocationID:  targetOutletID.Int64,
				ProductID:   row.ProductID,
				VariantID:   pgtype.Int8{Int64: row.VariantID, Valid: true},
			})
			reqQty, _ := decimal.NewFromString(cl.Quantity)
			if bErr != nil {
				return GuestCheckoutConfirmation{}, fmt.Errorf("item %s is not stocked at this outlet", row.PublicTitle)
			}
			avail := bal.QuantityOnHand.Sub(bal.ReservedQuantity)
			if avail.LessThan(reqQty) {
				variantDesc := ""
				if strings.TrimSpace(row.VariantName) != "" {
					variantDesc = " (" + row.VariantName + ")"
				}
				if avail.LessThanOrEqual(decimal.Zero) {
					return GuestCheckoutConfirmation{}, fmt.Errorf("%s%s is sold out", row.PublicTitle, variantDesc)
				}
				return GuestCheckoutConfirmation{}, fmt.Errorf("only %s left of %s%s", avail.String(), row.PublicTitle, variantDesc)
			}
			toReserve = append(toReserve, reservedStockItem{
				lineIndex: idx,
				productID: row.ProductID,
				variantID: row.VariantID,
				quantity:  reqQty,
				balance:   bal,
			})
		}
	}

	seq, err := q.NextStorefrontOrderSequence(ctx, proj.internalID)
	if err != nil {
		return GuestCheckoutConfirmation{}, err
	}
	orderRef := fmt.Sprintf("ORD-%06d", seq)

	order, err := q.CreateStorefrontOrder(ctx, db.CreateStorefrontOrderParams{
		WorkspaceID:            proj.internalWS,
		StorefrontID:           proj.internalID,
		OrderReference:         orderRef,
		PublicTokenHash:        hashOpaqueToken(rawStatusToken),
		OutletID:               targetOutletID,
		Currency:               proj.Currency,
		CurrencyExponent:       proj.CurrencyExponent,
		SubtotalMinor:          subVal.IntPart(),
		TaxMinor:               0,
		DeliveryFeeMinor:       delivMinor,
		TotalMinor:             finalTotal,
		DeliveryMethod:         delivMethod,
		DeliveryAreaID:         pgtype.Int8{Int64: calc.DeliveryAreaID, Valid: calc.DeliveryAreaID > 0},
		CustomerName:           custName,
		CustomerPhone:          optionalPgText(custPhone),
		CustomerEmail:          optionalPgText(custEmail),
		OrganizationName:       optionalPgText(sanitizePublicText(in.OrganizationName, 160)),
		PreferredContactMethod: optionalPgText(sanitizePublicText(in.PreferredContact, 40)),
		DeliveryAddress:        optionalPgText(delivAddr),
		DeliveryLandmark:       optionalPgText(sanitizePublicText(in.DeliveryLandmark, 200)),
		PreferredDeliveryTime:  optionalPgText(sanitizePublicText(in.PreferredDeliveryTime, 100)),
		CustomerNote:           optionalPgText(sanitizePublicText(in.CustomerNote, 1000)),
		PolicyAcknowledged:     true,
		PolicyVersion:          proj.internalSettingsV,
		IdempotencyKey:         key,
	})
	if err != nil {
		return GuestCheckoutConfirmation{}, err
	}

	encToken, encErr := crypto.Encrypt(rawStatusToken)
	if encErr != nil {
		return GuestCheckoutConfirmation{}, fmt.Errorf("encrypt status token: %w", encErr)
	}
	var shopperParam pgtype.Int8
	if in.ShopperID > 0 {
		shopperParam = pgtype.Int8{Int64: in.ShopperID, Valid: true}
	}
	if _, err := q.UpdateStorefrontOrderCheckoutMeta(ctx, db.UpdateStorefrontOrderCheckoutMetaParams{
		WorkspaceID:          proj.internalWS,
		ID:                   order.ID,
		HoldType:             pgtype.Text{String: holdType, Valid: true},
		ReservationExpiresAt: pgtype.Timestamptz{Time: holdExpiresAt, Valid: true},
		ProcessingFeeMinor:   processingFeeMinor,
		PickupCode:           pickupCode,
		PickupPointID:        pPointID,
		PublicTokenEnc:       pgtype.Text{String: encToken, Valid: encToken != ""},
		RateToken:            rateToken,
		CourierName:          courierName,
		CourierServiceCode:   courierServiceCode,
		CourierID:            courierID,
		CommercialStatus:     "confirmed",
		FulfilmentStatus:     "reserved",
		PaymentStatus:        "unpaid",
		ShopperID:            shopperParam,
	}); err != nil {
		return GuestCheckoutConfirmation{}, fmt.Errorf("update storefront order hold: %w", err)
	}
	_, _ = tx.Exec(ctx, `UPDATE storefront_orders SET payment_arrangement = $2 WHERE id = $1`, order.ID, payMethod)

	if err := linkMatchingOrderCustomer(ctx, tx, proj.internalWS, order.ID, custEmail, custPhone); err != nil {
		return GuestCheckoutConfirmation{}, err
	}

	// Atomically increment reserved_quantity and create stock reservations
	reservationsByLine := map[int]int64{}
	for _, res := range toReserve {
		newRes := res.balance.ReservedQuantity.Add(res.quantity)
		_, err := q.UpdateInventoryBalanceQuantities(ctx, db.UpdateInventoryBalanceQuantitiesParams{
			WorkspaceID:       proj.internalWS,
			LocationID:        targetOutletID.Int64,
			ProductID:         res.productID,
			VariantID:         pgtype.Int8{Int64: res.variantID, Valid: true},
			QuantityOnHand:    res.balance.QuantityOnHand,
			ReservedQuantity:  newRes,
			InTransitQuantity: res.balance.InTransitQuantity,
			ValueOnHandMinor:  res.balance.ValueOnHandMinor,
		})
		if err != nil {
			return GuestCheckoutConfirmation{}, err
		}
		sr, err := q.CreateStockReservation(ctx, db.CreateStockReservationParams{
			WorkspaceID:    proj.internalWS,
			LocationID:     targetOutletID.Int64,
			ProductID:      res.productID,
			VariantID:      pgtype.Int8{Int64: res.variantID, Valid: true},
			OrderID:        pgtype.Int8{Int64: order.ID, Valid: true},
			Quantity:       res.quantity,
			Status:         "active",
			ExpiresAt:      pgtype.Timestamptz{Time: holdExpiresAt, Valid: true},
			Notes:          pgtype.Text{String: "Held for storefront order " + orderRef, Valid: true},
			IdempotencyKey: pgtype.Text{String: fmt.Sprintf("sf-ord-%d-line-%d", order.ID, res.lineIndex), Valid: true},
		})
		if err != nil {
			return GuestCheckoutConfirmation{}, err
		}
		reservationsByLine[res.lineIndex] = sr.ID
	}

	createdLines := make([]db.StorefrontOrderLine, 0, len(calc.Lines))
	for idx, cl := range calc.Lines {
		row, ok := prodMap[cl.StorefrontProductID]
		if !ok {
			return GuestCheckoutConfirmation{}, ErrCartItemChanged
		}
		qty, _ := decimal.NewFromString(cl.Quantity)
		uPrice, _ := decimal.NewFromString(cl.UnitPriceMinor)
		lTotal, _ := decimal.NewFromString(cl.LineTotalMinor)
		ol, err := q.CreateStorefrontOrderLine(ctx, db.CreateStorefrontOrderLineParams{
			WorkspaceID:         proj.internalWS,
			OrderID:             order.ID,
			StorefrontProductID: pgtype.Int8{Int64: row.ID, Valid: true},
			ProductID:           row.ProductID,
			VariantID:           pgtype.Int8{Int64: row.VariantID, Valid: true},
			ProductKind:         row.ProductKind,
			TitleSnapshot:       row.PublicTitle,
			VariantSnapshot:     optionalPgText(row.VariantName),
			UnitName:            row.UnitName,
			RequestedQuantity:   qty,
			ConfirmedQuantity:   qty,
			UnitPriceMinor:      uPrice.IntPart(),
			LineTotalMinor:      lTotal.IntPart(),
		})
		if err != nil {
			return GuestCheckoutConfirmation{}, err
		}
		if resID, has := reservationsByLine[idx]; has {
			_, _ = tx.Exec(ctx, `UPDATE storefront_order_lines SET reservation_id = $2 WHERE id = $1`, ol.ID, resID)
		}
		createdLines = append(createdLines, ol)
	}

	snapBytes, _ := json.Marshal(map[string]any{
		"total_minor": order.TotalMinor,
		"lines":       createdLines,
	})
	if _, err := q.CreateStorefrontOrderVersion(ctx, db.CreateStorefrontOrderVersionParams{
		WorkspaceID:         proj.internalWS,
		OrderID:             order.ID,
		Version:             1,
		Snapshot:            snapBytes,
		ChangeSummary:       optionalPgText("Order placed by customer"),
		RequiresCustomerAck: false,
		ActorType:           "customer",
	}); err != nil {
		return GuestCheckoutConfirmation{}, err
	}
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     proj.internalWS,
		OrderID:         order.ID,
		EventType:       "order_placed",
		ActorType:       "customer",
		CustomerVisible: true,
		Message:         optionalPgText(fmt.Sprintf("Order placed. Stock held for %v.", holdDuration)),
	}); err != nil {
		return GuestCheckoutConfirmation{}, err
	}

	// If online payment (virtual account or card): decrypt merchant subaccount & create payment attempt
	var publicVA *PublicVirtualAccountView
	var cardCheckoutURL *string
	if payMethod == "virtual_account" || payMethod == "card" {
		if chosenProvider == nil || chosenPayout == nil {
			return GuestCheckoutConfirmation{}, ErrProviderNotAvailable
		}
		decryptedSubRef, decErr := crypto.Decrypt(chosenPayout.SubaccountRef)
		if decErr != nil {
			return GuestCheckoutConfirmation{}, fmt.Errorf("merchant payout account configuration error: %w", decErr)
		}
		attemptRef := fmt.Sprintf("att_%s_%d", orderRef, time.Now().UnixNano()%1000000)
		if payMethod == "virtual_account" {
			va, vaErr := chosenProvider.CreateOrderVirtualAccount(ctx, payments.OrderPaymentRequest{
				Reference:                 attemptRef,
				AmountMinor:               finalTotal,
				Currency:                  proj.Currency,
				CustomerEmail:             custEmail,
				CustomerName:              custName,
				SubaccountRef:             decryptedSubRef,
				FeeBearer:                 settings.FeeBearer,
				PlatformCommissionPercent: s.platformCommissionPercent,
				ExpiresAt:                 holdExpiresAt,
			})
			if vaErr != nil {
				if errors.Is(vaErr, payments.ErrNotSupported) {
					return GuestCheckoutConfirmation{}, errors.New("online bank transfer is not supported by the active payment provider")
				}
				return GuestCheckoutConfirmation{}, vaErr
			}
			if _, aErr := q.CreateStorefrontPaymentAttempt(ctx, db.CreateStorefrontPaymentAttemptParams{
				WorkspaceID:          proj.internalWS,
				OrderID:              order.ID,
				Provider:             chosenProvider.Key(),
				Method:               "virtual_account",
				Reference:            attemptRef,
				AmountMinor:          finalTotal,
				FeeMinor:             0,
				CommissionMinor:      0,
				VirtualAccountNumber: pgtype.Text{String: va.AccountNumber, Valid: true},
				BankName:             pgtype.Text{String: va.BankName, Valid: true},
				ExpiresAt:            pgtype.Timestamptz{Time: holdExpiresAt, Valid: true},
				Status:               "pending",
			}); aErr != nil {
				return GuestCheckoutConfirmation{}, aErr
			}
			expS := holdExpiresAt.Format(time.RFC3339)
			publicVA = &PublicVirtualAccountView{
				AccountNumber: va.AccountNumber,
				BankName:      va.BankName,
				AccountName:   va.AccountName,
				ExpiresAt:     &expS,
			}
		} else if payMethod == "card" {
			cardRes, cErr := chosenProvider.InitializeCardCheckout(ctx, payments.OrderPaymentRequest{
				Reference:                 attemptRef,
				AmountMinor:               finalTotal,
				Currency:                  proj.Currency,
				CustomerEmail:             custEmail,
				CustomerName:              custName,
				SubaccountRef:             decryptedSubRef,
				FeeBearer:                 settings.FeeBearer,
				PlatformCommissionPercent: s.platformCommissionPercent,
				CallbackURL:               fmt.Sprintf("%s/orders/status/%s", s.frontendOrigin(), rawStatusToken),
			})
			if cErr != nil {
				return GuestCheckoutConfirmation{}, cErr
			}
			if _, aErr := q.CreateStorefrontPaymentAttempt(ctx, db.CreateStorefrontPaymentAttemptParams{
				WorkspaceID:     proj.internalWS,
				OrderID:         order.ID,
				Provider:        chosenProvider.Key(),
				Method:          "card",
				Reference:       attemptRef,
				AmountMinor:     finalTotal,
				FeeMinor:        0,
				CommissionMinor: 0,
				ExpiresAt:       pgtype.Timestamptz{Time: holdExpiresAt, Valid: true},
				Status:          "pending",
			}); aErr != nil {
				return GuestCheckoutConfirmation{}, aErr
			}
			cardCheckoutURL = &cardRes.AuthorizationURL
		}
	}

	if strings.TrimSpace(in.CartToken) != "" {
		if cart, cErr := q.GetStorefrontCartByHash(ctx, db.GetStorefrontCartByHashParams{
			CartTokenHash: hashOpaqueToken(in.CartToken),
			StorefrontID:  proj.internalID,
		}); cErr == nil {
			_ = q.ClearStorefrontCart(ctx, cart.ID)
		}
	}
	_ = q.InsertStorefrontAnalyticsEvent(ctx, db.InsertStorefrontAnalyticsEventParams{
		WorkspaceID:  proj.internalWS,
		StorefrontID: proj.internalID,
		EventType:    "checkout_submitted",
	})
	_ = q.InsertStorefrontAnalyticsEvent(ctx, db.InsertStorefrontAnalyticsEventParams{
		WorkspaceID:  proj.internalWS,
		StorefrontID: proj.internalID,
		EventType:    "order_confirmed",
	})
	if err := tx.Commit(ctx); err != nil {
		return GuestCheckoutConfirmation{}, err
	}

	// Best-effort workspace notification outside transaction so delivery issue cannot rollback valid order
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO notifications (workspace_id, user_id, category, title, body, action_url)
		SELECT m.workspace_id, m.user_id, 'orders', $2, $3, '/store'
		FROM workspace_memberships m
		WHERE m.workspace_id = $1 AND m.status = 'active'
		LIMIT 5
	`, proj.internalWS, fmt.Sprintf("New order %s", orderRef), fmt.Sprintf("%s placed an order totaling %s %s", custName, FormatMinorToMajorMust(fmt.Sprint(finalTotal), int(order.CurrencyExponent)), order.Currency))

	expStr := holdExpiresAt.Format(time.RFC3339)
	return GuestCheckoutConfirmation{
		OrderReference:     orderRef,
		StatusToken:        rawStatusToken,
		CommercialStatus:   "confirmed",
		FulfilmentStatus:   "reserved",
		PaymentStatus:      "unpaid",
		Currency:           order.Currency,
		TotalMinor:         fmt.Sprint(finalTotal),
		ProcessingFeeMinor: processingFeeMinor,
		Message:            "Order placed successfully. Please complete payment before the hold expires.",
		HoldType:           &holdType,
		HoldExpiresAt:      &expStr,
		VirtualAccount:     publicVA,
		CardCheckoutURL:    cardCheckoutURL,
		PickupCode:         nullableText(pickupCode),
	}, nil
}

// Public Customer Order Status Portal (Strict Opaque Projection)

type PublicOrderLineView struct {
	Title             string  `json:"title"`
	VariantName       *string `json:"variant_name,omitempty"`
	UnitName          string  `json:"unit_name"`
	RequestedQuantity string  `json:"requested_quantity"`
	ConfirmedQuantity string  `json:"confirmed_quantity"`
	FulfilledQuantity string  `json:"fulfilled_quantity"`
	UnitPriceMinor    string  `json:"unit_price_minor"`
	LineTotalMinor    string  `json:"line_total_minor"`
}

type PublicOrderEventView struct {
	EventType string  `json:"event_type"`
	ActorType string  `json:"actor_type"`
	Message   *string `json:"message,omitempty"`
	CreatedAt string  `json:"created_at"`
}

type PublicOrderStatusView struct {
	OrderReference          string                     `json:"order_reference"`
	StorefrontName          string                     `json:"storefront_name"`
	StorefrontSlug          string                     `json:"storefront_slug"`
	MerchantPhone           *string                    `json:"merchant_phone,omitempty"`
	MerchantEmail           *string                    `json:"merchant_email,omitempty"`
	MerchantWhatsapp        *string                    `json:"merchant_whatsapp,omitempty"`
	CommercialStatus        string                     `json:"commercial_status"`
	FulfilmentStatus        string                     `json:"fulfilment_status"`
	PaymentStatus           string                     `json:"payment_status"`
	Version                 int32                      `json:"version"`
	Currency                string                     `json:"currency"`
	CurrencyExponent        int32                      `json:"currency_exponent"`
	SubtotalMinor           string                     `json:"subtotal_minor"`
	DeliveryFeeMinor        string                     `json:"delivery_fee_minor"`
	TotalMinor              string                     `json:"total_minor"`
	ProcessingFeeMinor      int64                      `json:"processing_fee_minor"`
	DeliveryMethod          string                     `json:"delivery_method"`
	DeliveryAddress         *string                    `json:"delivery_address,omitempty"`
	PaymentArrangement      *string                    `json:"payment_arrangement,omitempty"`
	RequiresCustomerAck     bool                       `json:"requires_customer_ack"`
	LatestChangeSummary     *string                    `json:"latest_change_summary,omitempty"`
	LinkedInvoiceShareToken *string                    `json:"linked_invoice_share_token,omitempty"`
	DeclineOrCancelReason   *string                    `json:"decline_or_cancel_reason,omitempty"`
	HoldType                *string                    `json:"hold_type,omitempty"`
	HoldExpiresAt           *string                    `json:"hold_expires_at,omitempty"`
	PickupCode              *string                    `json:"pickup_code,omitempty"`
	PickupPoint             *StorefrontPickupPointView `json:"pickup_point,omitempty"`
	ManualBankDetails       *ManualBankDetailsView     `json:"manual_bank_details,omitempty"`
	CustomerPhoneMasked     *string                    `json:"customer_phone_masked,omitempty"`
	CourierName             *string                    `json:"courier_name,omitempty"`
	CourierTrackingNumber   *string                    `json:"courier_tracking_number,omitempty"`
	CourierStatus           *string                    `json:"courier_status,omitempty"`
	CourierTrackingURL      *string                    `json:"courier_tracking_url,omitempty"`
	LatestPaymentAttempt    *PublicPaymentAttemptView  `json:"latest_payment_attempt,omitempty"`
	Lines                   []PublicOrderLineView      `json:"lines"`
	Events                  []PublicOrderEventView     `json:"events"`
	CreatedAt               string                     `json:"created_at"`
}

func maskPublicPhone(raw pgtype.Text) *string {
	if !raw.Valid {
		return nil
	}
	s := strings.TrimSpace(raw.String)
	if len(s) <= 4 {
		return nil
	}
	masked := strings.Repeat("•", len(s)-4) + s[len(s)-4:]
	return &masked
}

func (s *Service) frontendOrigin() string {
	base := strings.TrimRight(strings.TrimSuffix(strings.TrimRight(s.guestShareBaseURL, "/"), "/share"), "/")
	if base == "" {
		return "http://localhost:3000"
	}
	return base
}

func (s *Service) buildPublicOrderStatusView(ctx context.Context, o db.StorefrontOrder) (PublicOrderStatusView, error) {
	var sfName, sfSlug string
	var phone, email, wa, manBank, manAcct, manName pgtype.Text
	var manEnabled bool
	_ = s.pool.QueryRow(ctx, `
		SELECT sf.name, sf.slug, st.contact_phone, st.contact_email, st.whatsapp_number,
		       st.payment_manual_transfer_enabled, st.manual_bank_name, st.manual_bank_account_number, st.manual_bank_account_name
		FROM storefronts sf
		JOIN storefront_settings st ON st.storefront_id = sf.id
		WHERE sf.id = $1
	`, o.StorefrontID).Scan(&sfName, &sfSlug, &phone, &email, &wa, &manEnabled, &manBank, &manAcct, &manName)

	var pickupView *StorefrontPickupPointView
	if o.DeliveryMethod == "pickup" && o.PickupPointID.Valid {
		if ppLoc, pErr := s.queries.GetInventoryLocationByID(ctx, db.GetInventoryLocationByIDParams{
			WorkspaceID: o.WorkspaceID,
			ID:          o.PickupPointID.Int64,
		}); pErr == nil {
			pickupView = &StorefrontPickupPointView{
				ID:         ppLoc.ID,
				Name:       ppLoc.Name,
				Address:    nullableText(ppLoc.Address),
				Phone:      nullableText(ppLoc.Phone),
				PickupNote: ppLoc.PickupNote,
			}
		}
	}
	var manualBank *ManualBankDetailsView
	if manEnabled && manAcct.Valid && strings.TrimSpace(manAcct.String) != "" {
		manualBank = &ManualBankDetailsView{
			BankName:      manBank.String,
			AccountNumber: manAcct.String,
			AccountName:   manName.String,
		}
	}

	lines, err := s.queries.ListStorefrontOrderLines(ctx, o.ID)
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	pubLines := make([]PublicOrderLineView, 0, len(lines))
	for _, l := range lines {
		pubLines = append(pubLines, PublicOrderLineView{
			Title:             l.TitleSnapshot,
			VariantName:       nullableText(l.VariantSnapshot),
			UnitName:          l.UnitName,
			RequestedQuantity: l.RequestedQuantity.String(),
			ConfirmedQuantity: l.ConfirmedQuantity.String(),
			FulfilledQuantity: l.FulfilledQuantity.String(),
			UnitPriceMinor:    fmt.Sprint(l.UnitPriceMinor),
			LineTotalMinor:    fmt.Sprint(l.LineTotalMinor),
		})
	}
	events, err := s.queries.ListStorefrontOrderEvents(ctx, db.ListStorefrontOrderEventsParams{OrderID: o.ID, Column2: true})
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	pubEvents := make([]PublicOrderEventView, 0, len(events))
	for _, e := range events {
		pubEvents = append(pubEvents, PublicOrderEventView{
			EventType: e.EventType,
			ActorType: e.ActorType,
			Message:   nullableText(e.Message),
			CreatedAt: e.CreatedAt.Time.UTC().Format(time.RFC3339),
		})
	}
	versions, _ := s.queries.ListStorefrontOrderVersions(ctx, o.ID)
	var reqAck bool
	var changeSum *string
	if len(versions) > 0 && versions[0].Version == o.Version && versions[0].RequiresCustomerAck && !versions[0].AcknowledgedAt.Valid {
		reqAck = true
		changeSum = nullableText(versions[0].ChangeSummary)
	}

	var latestAttempt *PublicPaymentAttemptView
	if att, aErr := s.queries.GetPublicPaymentAttemptByOrder(ctx, o.ID); aErr == nil {
		var expStr *string
		if att.ExpiresAt.Valid {
			s := att.ExpiresAt.Time.UTC().Format(time.RFC3339)
			expStr = &s
		}
		latestAttempt = &PublicPaymentAttemptView{
			ID:                   att.ID,
			Provider:             att.Provider,
			Method:               att.Method,
			Reference:            att.Reference,
			AmountMinor:          att.AmountMinor,
			VirtualAccountNumber: nullableText(att.VirtualAccountNumber),
			BankName:             nullableText(att.BankName),
			ExpiresAt:            expStr,
			Status:               att.Status,
		}
	}

	var holdExpStr *string
	if o.ReservationExpiresAt.Valid {
		s := o.ReservationExpiresAt.Time.UTC().Format(time.RFC3339)
		holdExpStr = &s
	}

	return PublicOrderStatusView{
		OrderReference:          o.OrderReference,
		StorefrontName:          sfName,
		StorefrontSlug:          sfSlug,
		MerchantPhone:           nullableText(phone),
		MerchantEmail:           nullableText(email),
		MerchantWhatsapp:        nullableText(wa),
		CommercialStatus:        o.CommercialStatus,
		FulfilmentStatus:        o.FulfilmentStatus,
		PaymentStatus:           o.PaymentStatus,
		Version:                 o.Version,
		Currency:                o.Currency,
		CurrencyExponent:        o.CurrencyExponent,
		SubtotalMinor:           fmt.Sprint(o.SubtotalMinor),
		DeliveryFeeMinor:        fmt.Sprint(o.DeliveryFeeMinor),
		TotalMinor:              fmt.Sprint(o.TotalMinor),
		ProcessingFeeMinor:      o.ProcessingFeeMinor,
		DeliveryMethod:          o.DeliveryMethod,
		DeliveryAddress:         nullableText(o.DeliveryAddress),
		PaymentArrangement:      nullableText(o.PaymentArrangement),
		RequiresCustomerAck:     reqAck,
		LatestChangeSummary:     changeSum,
		LinkedInvoiceShareToken: nullableText(o.LinkedInvoiceShareToken),
		DeclineOrCancelReason:   nullableText(o.DeclineOrCancelReason),
		HoldType:                nullableText(o.HoldType),
		HoldExpiresAt:           holdExpStr,
		PickupCode:              nullableText(o.PickupCode),
		PickupPoint:             pickupView,
		ManualBankDetails:       manualBank,
		CustomerPhoneMasked:     maskPublicPhone(o.CustomerPhone),
		CourierName:             nullableText(o.CourierName),
		CourierTrackingNumber:   nullableText(o.CourierTrackingNumber),
		CourierStatus:           nullableText(o.CourierStatus),
		CourierTrackingURL:      nullableText(o.CourierTrackingUrl),
		LatestPaymentAttempt:    latestAttempt,
		Lines:                   pubLines,
		Events:                  pubEvents,
		CreatedAt:               o.CreatedAt.Time.UTC().Format(time.RFC3339),
	}, nil
}

func (s *Service) GetPublicOrderStatus(ctx context.Context, rawToken string) (PublicOrderStatusView, error) {
	o, err := s.queries.GetStorefrontOrderByPublicTokenHash(ctx, hashOpaqueToken(rawToken))
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicOrderStatusView{}, ErrNotFound
	}
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	return s.buildPublicOrderStatusView(ctx, o)
}

func (s *Service) VerifyPublicOrderPayment(ctx context.Context, rawToken string) (PublicOrderStatusView, error) {
	o, err := s.queries.GetStorefrontOrderByPublicTokenHash(ctx, hashOpaqueToken(rawToken))
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicOrderStatusView{}, ErrNotFound
	}
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	if o.PaymentStatus == "paid" {
		return s.buildPublicOrderStatusView(ctx, o)
	}
	att, err := s.queries.GetPublicPaymentAttemptByOrder(ctx, o.ID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return s.buildPublicOrderStatusView(ctx, o)
		}
		return PublicOrderStatusView{}, err
	}
	if att.Status == "paid" {
		return s.buildPublicOrderStatusView(ctx, o)
	}
	prov, pErr := s.getPaymentProvider(att.Provider)
	if pErr != nil {
		return PublicOrderStatusView{}, pErr
	}
	res, vErr := prov.VerifyTransaction(ctx, att.Reference)
	if vErr != nil {
		return s.buildPublicOrderStatusView(ctx, o)
	}
	if res.Status == "paid" {
		if res.AmountMinor != att.AmountMinor {
			return PublicOrderStatusView{}, ErrPaymentAmountMismatch
		}
		att.FeeMinor = res.FeeMinor
		if err := s.MarkStorefrontOrderPaid(ctx, att); err != nil {
			return PublicOrderStatusView{}, err
		}
		o, err = s.queries.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: o.WorkspaceID, ID: o.ID})
		if err != nil {
			return PublicOrderStatusView{}, err
		}
	}
	return s.buildPublicOrderStatusView(ctx, o)
}

func (s *Service) AcknowledgePublicOrderChanges(ctx context.Context, rawToken string, expectedVersion int32) (PublicOrderStatusView, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	o, err := q.GetStorefrontOrderForUpdateByPublicHash(ctx, hashOpaqueToken(rawToken))
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicOrderStatusView{}, ErrNotFound
	}
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	if o.Version != expectedVersion {
		return PublicOrderStatusView{}, ErrOrderVersionConflict
	}
	if _, err := q.AcknowledgeStorefrontOrderVersion(ctx, db.AcknowledgeStorefrontOrderVersionParams{
		OrderID: o.ID,
		Version: expectedVersion,
	}); err != nil {
		return PublicOrderStatusView{}, errors.New("no unacknowledged order changes at this version")
	}
	var updated db.StorefrontOrder
	if _, err := tx.Exec(ctx, `UPDATE storefront_orders SET commercial_status='needs_review', version=version+1, updated_at=now() WHERE id=$1`, o.ID); err != nil {
		return PublicOrderStatusView{}, err
	}
	updated, err = q.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: o.WorkspaceID, ID: o.ID})
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     o.WorkspaceID,
		OrderID:         o.ID,
		EventType:       "customer_acknowledged",
		ActorType:       "customer",
		CustomerVisible: true,
		Message:         optionalPgText(fmt.Sprintf("Customer acknowledged order changes from v%d", expectedVersion)),
	}); err != nil {
		return PublicOrderStatusView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PublicOrderStatusView{}, err
	}
	s.notifyStorefrontWorkspace(ctx, o.WorkspaceID, fmt.Sprintf("Order %s acknowledged", o.OrderReference), fmt.Sprintf("Customer acknowledged order changes for v%d", expectedVersion))
	return s.buildPublicOrderStatusView(ctx, updated)
}

func (s *Service) CancelPublicOrderBeforeConfirm(ctx context.Context, rawToken, reason string) (PublicOrderStatusView, error) {
	cleanReason := sanitizePublicText(reason, 400)
	if cleanReason == "" {
		cleanReason = "Cancelled by customer before confirmation"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	o, err := q.GetStorefrontOrderForUpdateByPublicHash(ctx, hashOpaqueToken(rawToken))
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicOrderStatusView{}, ErrNotFound
	}
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	switch o.CommercialStatus {
	case "request_received", "needs_review", "quote_changes_requested":
	default:
		return PublicOrderStatusView{}, ErrOrderAlreadyHandled
	}
	if _, err := tx.Exec(ctx, `UPDATE storefront_orders SET commercial_status='cancelled', decline_or_cancel_reason=$2, version=version+1, updated_at=now() WHERE id=$1`, o.ID, cleanReason); err != nil {
		return PublicOrderStatusView{}, err
	}
	updated, err := q.GetStorefrontOrderByID(ctx, db.GetStorefrontOrderByIDParams{WorkspaceID: o.WorkspaceID, ID: o.ID})
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     o.WorkspaceID,
		OrderID:         o.ID,
		EventType:       "customer_cancelled",
		ActorType:       "customer",
		CustomerVisible: true,
		Message:         optionalPgText(cleanReason),
	}); err != nil {
		return PublicOrderStatusView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PublicOrderStatusView{}, err
	}
	s.notifyStorefrontWorkspace(ctx, o.WorkspaceID, fmt.Sprintf("Order %s cancelled by customer", o.OrderReference), cleanReason)
	return s.buildPublicOrderStatusView(ctx, updated)
}

func (s *Service) PostPublicOrderMessage(ctx context.Context, rawToken, rawMessage string) (PublicOrderStatusView, error) {
	msg := sanitizePublicText(rawMessage, 1000)
	if msg == "" {
		return PublicOrderStatusView{}, errors.New("message is required")
	}
	o, err := s.queries.GetStorefrontOrderByPublicTokenHash(ctx, hashOpaqueToken(rawToken))
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicOrderStatusView{}, ErrNotFound
	}
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	if _, err := s.queries.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     o.WorkspaceID,
		OrderID:         o.ID,
		EventType:       "customer_message",
		ActorType:       "customer",
		CustomerVisible: true,
		Message:         pgtype.Text{String: msg, Valid: true},
	}); err != nil {
		return PublicOrderStatusView{}, err
	}
	return s.buildPublicOrderStatusView(ctx, o)
}

func (s *Service) RequestPublicOrderReturn(ctx context.Context, rawToken, reason string) (PublicOrderStatusView, error) {
	cleanReason := sanitizePublicText(reason, 400)
	if cleanReason == "" {
		cleanReason = "Customer requested a return"
	}
	o, err := s.queries.GetStorefrontOrderByPublicTokenHash(ctx, hashOpaqueToken(rawToken))
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicOrderStatusView{}, ErrNotFound
	}
	if err != nil {
		return PublicOrderStatusView{}, err
	}
	if o.FulfilmentStatus != "fulfilled" && o.FulfilmentStatus != "partially_fulfilled" {
		return PublicOrderStatusView{}, errors.New("returns can only be requested for fulfilled orders")
	}
	if _, err := s.queries.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     o.WorkspaceID,
		OrderID:         o.ID,
		EventType:       "return_requested",
		ActorType:       "customer",
		CustomerVisible: true,
		Message:         pgtype.Text{String: cleanReason, Valid: true},
	}); err != nil {
		return PublicOrderStatusView{}, err
	}
	s.notifyStorefrontWorkspace(ctx, o.WorkspaceID, fmt.Sprintf("Return requested for %s", o.OrderReference), cleanReason)
	return s.buildPublicOrderStatusView(ctx, o)
}

type validatedCourierRate struct {
	RequestToken string
	CourierName  string
	ServiceCode  string
	CourierID    string
	TotalMinor   int64
}

func (s *Service) resolveAndValidateCourierRate(ctx context.Context, storefrontID int64, rateToken, serviceCode, courierID string) (validatedCourierRate, error) {
	return validatedCourierRate{}, errors.New("courier delivery rates are not configured")
}

func (s *Service) notifyStorefrontWorkspace(ctx context.Context, ws int64, title, body string) {
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO notifications (workspace_id, user_id, category, title, body, action_url)
		SELECT m.workspace_id, m.user_id, 'orders', $2, $3, '/store'
		FROM workspace_memberships m
		WHERE m.workspace_id = $1 AND m.status = 'active'
		LIMIT 5
	`, ws, title, body)
}
