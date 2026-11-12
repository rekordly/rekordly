package finance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
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
	Name                    string                     `json:"name"`
	Slug                    string                     `json:"slug"`
	ThemeKey                string                     `json:"theme_key"`
	Currency                string                     `json:"currency"`
	CurrencyExponent        int32                      `json:"currency_exponent"`
	Tagline                 *string                    `json:"tagline,omitempty"`
	Description             *string                    `json:"description,omitempty"`
	LogoURL                 *string                    `json:"logo_url,omitempty"`
	BannerURL               *string                    `json:"banner_url,omitempty"`
	PrimaryColor            string                     `json:"primary_color"`
	AccentColor             string                     `json:"accent_color"`
	BackgroundColor         string                     `json:"background_color"`
	TextColor               string                     `json:"text_color"`
	FontFamily              string                     `json:"font_family"`
	SectionOrder            []string                   `json:"section_order"`
	ContactPhone            *string                    `json:"contact_phone,omitempty"`
	ContactEmail            *string                    `json:"contact_email,omitempty"`
	WhatsappNumber          *string                    `json:"whatsapp_number,omitempty"`
	Address                 *string                    `json:"address,omitempty"`
	BusinessHours           map[string]string          `json:"business_hours"`
	SocialLinks             map[string]string          `json:"social_links"`
	DeliveryMethods         []string                   `json:"delivery_methods"`
	DeliveryGuidance        *string                    `json:"delivery_guidance,omitempty"`
	DefaultDeliveryFeeMinor string                     `json:"default_delivery_fee_minor"`
	CheckoutRequireEmail    bool                       `json:"checkout_require_email"`
	CheckoutRequirePhone    bool                       `json:"checkout_require_phone"`
	ReturnPolicy            *string                    `json:"return_policy,omitempty"`
	PrivacyPolicy           *string                    `json:"privacy_policy,omitempty"`
	TermsPolicy             *string                    `json:"terms_policy,omitempty"`
	CustomPolicy            *string                    `json:"custom_policy,omitempty"`
	SeoTitle                *string                    `json:"seo_title,omitempty"`
	SeoDescription          *string                    `json:"seo_description,omitempty"`
	SeoImageURL             *string                    `json:"seo_image_url,omitempty"`
	SeoIndexable            bool                       `json:"seo_indexable"`
	AvailabilityAsOf        string                     `json:"availability_as_of"`
	Collections             []StorefrontCollectionView `json:"collections"`
	Products                []PublicProductView        `json:"products"`
	// Server-internal resolved fields hidden from public JSON
	internalID        int64
	internalWS        int64
	internalOutletID  pgtype.Int8
	internalSettingsV int32
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
				Slug:        c.Slug,
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
			state, visible, exact := computePublicAvailability(p.ProductKind, p.AvailabilityPolicy, p.LowStockThreshold, p.AvailableQuantity)
			if !visible {
				continue
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
		proj = PublicStorefrontProjection{
			Name:                    sf.Name,
			Slug:                    sf.Slug,
			ThemeKey:                sf.ThemeKey,
			Currency:                sf.Currency,
			CurrencyExponent:        sf.CurrencyExponent,
			Tagline:                 stView.Tagline,
			Description:             stView.Description,
			LogoURL:                 stView.LogoURL,
			BannerURL:               stView.BannerURL,
			PrimaryColor:            stView.PrimaryColor,
			AccentColor:             stView.AccentColor,
			BackgroundColor:         stView.BackgroundColor,
			TextColor:               stView.TextColor,
			FontFamily:              stView.FontFamily,
			SectionOrder:            stView.SectionOrder,
			ContactPhone:            stView.ContactPhone,
			ContactEmail:            stView.ContactEmail,
			WhatsappNumber:          stView.WhatsappNumber,
			Address:                 stView.Address,
			BusinessHours:           stView.BusinessHours,
			SocialLinks:             stView.SocialLinks,
			DeliveryMethods:         stView.DeliveryMethods,
			DeliveryGuidance:        stView.DeliveryGuidance,
			DefaultDeliveryFeeMinor: stView.DefaultDeliveryFeeMinor,
			CheckoutRequireEmail:    stView.CheckoutRequireEmail,
			CheckoutRequirePhone:    stView.CheckoutRequirePhone,
			ReturnPolicy:            stView.ReturnPolicy,
			PrivacyPolicy:           stView.PrivacyPolicy,
			TermsPolicy:             stView.TermsPolicy,
			CustomPolicy:            stView.CustomPolicy,
			SeoTitle:                stView.SeoTitle,
			SeoDescription:          stView.SeoDescription,
			SeoImageURL:             stView.SeoImageURL,
			SeoIndexable:            stView.SeoIndexable,
			AvailabilityAsOf:        time.Now().UTC().Format(time.RFC3339),
			Collections:             colViews,
			Products:                prodViews,
			internalID:              sf.ID,
			internalWS:              sf.WorkspaceID,
			internalOutletID:        sf.DefaultOutletID,
			internalSettingsV:       stView.Version,
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
	evType := "page_view"
	var searchHash pgtype.Text
	if qClean != "" {
		evType = "search"
		sum := sha256.Sum256([]byte(qClean))
		searchHash = pgtype.Text{String: hex.EncodeToString(sum[:8]), Valid: true}
	}
	_ = s.queries.InsertStorefrontAnalyticsEvent(ctx, db.InsertStorefrontAnalyticsEventParams{
		WorkspaceID:     proj.internalWS,
		StorefrontID:    proj.internalID,
		EventType:       evType,
		ReferrerClass:   pgtype.Text{String: "direct", Valid: true},
		SearchQueryHash: searchHash,
	})

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
	EstimatedTotal    string                  `json:"estimated_total_minor"`
	HasChanges        bool                    `json:"has_changes"`
	Lines             []ValidatedCartLineView `json:"lines"`
}

func (s *Service) ValidateAndRecalculateCart(ctx context.Context, slugOrHost string, isHost bool, rawLines []CartLineInput, deliveryMethod string) (ValidatedCartView, PublicStorefrontProjection, error) {
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
	if deliveryMethod == "merchant_delivery" {
		d, _ := decimal.NewFromString(proj.DefaultDeliveryFeeMinor)
		delivFee = d.IntPart()
	}
	return ValidatedCartView{
		Currency:          proj.Currency,
		CurrencyExponent:  proj.CurrencyExponent,
		SubtotalMinor:     fmt.Sprint(subtotal),
		EstimatedTaxMinor: "0",
		DeliveryFeeMinor:  fmt.Sprint(delivFee),
		EstimatedTotal:    fmt.Sprint(subtotal + delivFee),
		HasChanges:        hasChanges,
		Lines:             outLines,
	}, proj, nil
}

func (s *Service) UpsertVisitorCart(ctx context.Context, slug string, existingToken string, rawLines []CartLineInput, deliveryMethod string) (ValidatedCartView, error) {
	if len(rawLines) == 0 {
		return ValidatedCartView{}, errors.New("at least one item is required")
	}
	calc, proj, err := s.ValidateAndRecalculateCart(ctx, slug, false, rawLines, deliveryMethod)
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
	calc, _, err := s.ValidateAndRecalculateCart(ctx, slug, false, rawLines, deliveryMethod)
	if err != nil {
		return ValidatedCartView{}, err
	}
	calc.CartToken = token
	return calc, nil
}

// Guest Checkout Request (Never reserves stock or posts accounting/invoice/payment)

type GuestCheckoutInput struct {
	ClientKey             string          `json:"-"`
	CartToken             string          `json:"cart_token"`
	Lines                 []CartLineInput `json:"lines"`
	CustomerName          string          `json:"customer_name"`
	CustomerPhone         string          `json:"customer_phone"`
	CustomerEmail         string          `json:"customer_email"`
	OrganizationName      string          `json:"organization_name"`
	PreferredContact      string          `json:"preferred_contact_method"`
	DeliveryMethod        string          `json:"delivery_method"`
	DeliveryAddress       string          `json:"delivery_address"`
	DeliveryLandmark      string          `json:"delivery_landmark"`
	PreferredDeliveryTime string          `json:"preferred_delivery_time"`
	CustomerNote          string          `json:"customer_note"`
	PolicyAcknowledged    bool            `json:"policy_acknowledged"`
	IdempotencyKey        string          `json:"idempotency_key"`
}

type GuestCheckoutConfirmation struct {
	OrderReference   string `json:"order_reference"`
	StatusToken      string `json:"status_token,omitempty"`
	CommercialStatus string `json:"commercial_status"`
	FulfilmentStatus string `json:"fulfilment_status"`
	PaymentStatus    string `json:"payment_status"`
	Currency         string `json:"currency"`
	TotalMinor       string `json:"total_minor"`
	Message          string `json:"message"`
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
	if delivMethod != "pickup" && delivMethod != "merchant_delivery" && delivMethod != "customer_arranged" {
		return GuestCheckoutConfirmation{}, errors.New("delivery method must be pickup, merchant_delivery, or customer_arranged")
	}
	custName := sanitizePublicText(in.CustomerName, 160)
	custPhone := sanitizePublicText(in.CustomerPhone, 50)
	custEmail := sanitizePublicText(in.CustomerEmail, 160)
	delivAddr := sanitizePublicText(in.DeliveryAddress, 400)
	if custName == "" {
		return GuestCheckoutConfirmation{}, errors.New("customer name is required")
	}
	if delivMethod == "merchant_delivery" && delivAddr == "" {
		return GuestCheckoutConfirmation{}, errors.New("delivery address is required for merchant delivery")
	}

	// Recompute authoritative server totals & visibility
	calc, proj, err := s.ValidateAndRecalculateCart(ctx, slugOrHost, isHost, in.Lines, delivMethod)
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
		return GuestCheckoutConfirmation{
			OrderReference:   old.OrderReference,
			CommercialStatus: old.CommercialStatus,
			FulfilmentStatus: old.FulfilmentStatus,
			PaymentStatus:    old.PaymentStatus,
			Currency:         old.Currency,
			TotalMinor:       fmt.Sprint(old.TotalMinor),
			Message:          "Order request received; awaiting merchant confirmation.",
		}, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return GuestCheckoutConfirmation{}, err
	}

	publicProdRows, err := s.queries.ListPublicStorefrontProducts(ctx, db.ListPublicStorefrontProductsParams{
		StorefrontID: proj.internalID,
		OutletID:     proj.internalOutletID,
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

	seq, err := q.NextStorefrontOrderSequence(ctx, proj.internalID)
	if err != nil {
		return GuestCheckoutConfirmation{}, err
	}
	orderRef := fmt.Sprintf("ORD-%06d", seq)
	subVal, _ := decimal.NewFromString(calc.SubtotalMinor)
	delivVal, _ := decimal.NewFromString(calc.DeliveryFeeMinor)
	totVal, _ := decimal.NewFromString(calc.EstimatedTotal)

	order, err := q.CreateStorefrontOrder(ctx, db.CreateStorefrontOrderParams{
		WorkspaceID:           proj.internalWS,
		StorefrontID:          proj.internalID,
		OrderReference:        orderRef,
		PublicTokenHash:       hashOpaqueToken(rawStatusToken),
		OutletID:              proj.internalOutletID,
		Currency:              proj.Currency,
		CurrencyExponent:      proj.CurrencyExponent,
		SubtotalMinor:         subVal.IntPart(),
		TaxMinor:              0,
		DeliveryFeeMinor:      delivVal.IntPart(),
		TotalMinor:            totVal.IntPart(),
		DeliveryMethod:        delivMethod,
		CustomerName:          custName,
		CustomerPhone:         optionalPgText(custPhone),
		CustomerEmail:         optionalPgText(custEmail),
		OrganizationName:      optionalPgText(sanitizePublicText(in.OrganizationName, 160)),
		PreferredContactMethod: optionalPgText(sanitizePublicText(in.PreferredContact, 40)),
		DeliveryAddress:       optionalPgText(delivAddr),
		DeliveryLandmark:      optionalPgText(sanitizePublicText(in.DeliveryLandmark, 200)),
		PreferredDeliveryTime: optionalPgText(sanitizePublicText(in.PreferredDeliveryTime, 100)),
		CustomerNote:          optionalPgText(sanitizePublicText(in.CustomerNote, 1000)),
		PolicyAcknowledged:    true,
		PolicyVersion:         proj.internalSettingsV,
		IdempotencyKey:        key,
	})
	if err != nil {
		return GuestCheckoutConfirmation{}, err
	}

	createdLines := make([]db.StorefrontOrderLine, 0, len(calc.Lines))
	for _, cl := range calc.Lines {
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
		ChangeSummary:       optionalPgText("Order request submitted by customer"),
		RequiresCustomerAck: false,
		ActorType:           "customer",
	}); err != nil {
		return GuestCheckoutConfirmation{}, err
	}
	if _, err := q.CreateStorefrontOrderEvent(ctx, db.CreateStorefrontOrderEventParams{
		WorkspaceID:     proj.internalWS,
		OrderID:         order.ID,
		EventType:       "request_submitted",
		ActorType:       "customer",
		CustomerVisible: true,
		Message:         optionalPgText("Order request submitted; awaiting merchant confirmation."),
	}); err != nil {
		return GuestCheckoutConfirmation{}, err
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
	`, proj.internalWS, fmt.Sprintf("New order request %s", orderRef), fmt.Sprintf("%s requested an order totaling %s %s", custName, FormatMinorToMajorMust(fmt.Sprint(order.TotalMinor), int(order.CurrencyExponent)), order.Currency))

	return GuestCheckoutConfirmation{
		OrderReference:   orderRef,
		StatusToken:      rawStatusToken,
		CommercialStatus: order.CommercialStatus,
		FulfilmentStatus: order.FulfilmentStatus,
		PaymentStatus:    order.PaymentStatus,
		Currency:         order.Currency,
		TotalMinor:       fmt.Sprint(order.TotalMinor),
		Message:          "Order request received. Merchant will confirm availability, pricing, delivery and payment arrangement.",
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
	OrderReference           string                 `json:"order_reference"`
	StorefrontName           string                 `json:"storefront_name"`
	StorefrontSlug           string                 `json:"storefront_slug"`
	MerchantPhone            *string                `json:"merchant_phone,omitempty"`
	MerchantEmail            *string                `json:"merchant_email,omitempty"`
	MerchantWhatsapp         *string                `json:"merchant_whatsapp,omitempty"`
	CommercialStatus         string                 `json:"commercial_status"`
	FulfilmentStatus         string                 `json:"fulfilment_status"`
	PaymentStatus            string                 `json:"payment_status"`
	Version                  int32                  `json:"version"`
	Currency                 string                 `json:"currency"`
	CurrencyExponent         int32                  `json:"currency_exponent"`
	SubtotalMinor            string                 `json:"subtotal_minor"`
	DeliveryFeeMinor         string                 `json:"delivery_fee_minor"`
	TotalMinor               string                 `json:"total_minor"`
	DeliveryMethod           string                 `json:"delivery_method"`
	DeliveryAddress          *string                `json:"delivery_address,omitempty"`
	PaymentArrangement       *string                `json:"payment_arrangement,omitempty"`
	RequiresCustomerAck      bool                   `json:"requires_customer_ack"`
	LatestChangeSummary      *string                `json:"latest_change_summary,omitempty"`
	LinkedInvoiceShareToken  *string                `json:"linked_invoice_share_token,omitempty"`
	DeclineOrCancelReason    *string                `json:"decline_or_cancel_reason,omitempty"`
	Lines                    []PublicOrderLineView  `json:"lines"`
	Events                   []PublicOrderEventView `json:"events"`
	CreatedAt                string                 `json:"created_at"`
}

func (s *Service) buildPublicOrderStatusView(ctx context.Context, o db.StorefrontOrder) (PublicOrderStatusView, error) {
	var sfName, sfSlug string
	var phone, email, wa pgtype.Text
	_ = s.pool.QueryRow(ctx, `
		SELECT sf.name, sf.slug, st.contact_phone, st.contact_email, st.whatsapp_number
		FROM storefronts sf
		JOIN storefront_settings st ON st.storefront_id = sf.id
		WHERE sf.id = $1
	`, o.StorefrontID).Scan(&sfName, &sfSlug, &phone, &email, &wa)

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
		DeliveryMethod:          o.DeliveryMethod,
		DeliveryAddress:         nullableText(o.DeliveryAddress),
		PaymentArrangement:      nullableText(o.PaymentArrangement),
		RequiresCustomerAck:     reqAck,
		LatestChangeSummary:     changeSum,
		LinkedInvoiceShareToken: nullableText(o.LinkedInvoiceShareToken),
		DeclineOrCancelReason:   nullableText(o.DeclineOrCancelReason),
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

func (s *Service) notifyStorefrontWorkspace(ctx context.Context, ws int64, title, body string) {
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO notifications (workspace_id, user_id, category, title, body, action_url)
		SELECT m.workspace_id, m.user_id, 'orders', $2, $3, '/store'
		FROM workspace_memberships m
		WHERE m.workspace_id = $1 AND m.status = 'active'
		LIMIT 5
	`, ws, title, body)
}
