package finance

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"math"
	"net"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrStorefrontNotPublished      = errors.New("storefront is not published")
	ErrSlugUnavailable             = errors.New("storefront slug is unavailable or reserved")
	ErrProductNotPublished         = errors.New("product is not published on this storefront")
	ErrCartItemChanged             = errors.New("one or more cart items changed or became unavailable")
	ErrCheckoutRateLimited         = errors.New("too many checkout attempts; please try again shortly")
	ErrOrderVersionConflict        = errors.New("order version conflict; refresh to see latest terms")
	ErrOrderAlreadyHandled         = errors.New("order has already been confirmed, declined, or completed")
	ErrDomainInvalid               = errors.New("domain hostname is invalid or disallowed")
	ErrDomainAlreadyClaimed        = errors.New("domain hostname is unavailable")
	ErrStorefrontEntitlementLocked = errors.New("storefront entitlement is required")
)

var reservedStorefrontSlugs = map[string]bool{
	"admin": true, "api": true, "app": true, "auth": true, "billing": true,
	"cart": true, "cdn": true, "checkout": true, "dashboard": true, "help": true,
	"login": true, "mail": true, "orders": true, "public": true, "rekordly": true,
	"root": true, "s": true, "settings": true, "shop": true, "static": true,
	"store": true, "storefront": true, "support": true, "www": true,
}

var (
	storefrontSlugPattern   = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	hexColorPattern         = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)
	validHostLabelPattern   = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
	storefrontCacheMu       sync.RWMutex
	storefrontProjectionMap = map[string]cachedStorefrontEntry{}
)

type cachedStorefrontEntry struct {
	expiresAt time.Time
	data      PublicStorefrontProjection
}

func invalidateStorefrontCache(slug string) {
	storefrontCacheMu.Lock()
	defer storefrontCacheMu.Unlock()
	if slug == "" {
		storefrontProjectionMap = map[string]cachedStorefrontEntry{}
		return
	}
	delete(storefrontProjectionMap, strings.ToLower(strings.TrimSpace(slug)))
}

func randomHexToken(bytesLen int) (string, error) {
	buf := make([]byte, bytesLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func hashOpaqueToken(raw string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(raw)))
	return hex.EncodeToString(sum[:])
}

func sanitizePublicText(raw string, maxLen int) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	// Strip HTML angle brackets & escape safely before storage
	s = strings.ReplaceAll(s, "<", "")
	s = strings.ReplaceAll(s, ">", "")
	s = strings.ReplaceAll(s, "\x00", "")
	if len(s) > maxLen {
		s = s[:maxLen]
	}
	return s
}

func sanitizeURLOrCloudinary(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	u, err := url.Parse(trimmed)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return ""
	}
	// Inject safe Cloudinary delivery transformations when host is res.cloudinary.com
	if strings.EqualFold(u.Host, "res.cloudinary.com") && strings.Contains(u.Path, "/image/upload/") && !strings.Contains(u.Path, "f_auto") {
		u.Path = strings.Replace(u.Path, "/image/upload/", "/image/upload/f_auto,q_auto/", 1)
	}
	return html.UnescapeString(u.String())
}

func hexContrastRatio(fgHex, bgHex string) float64 {
	lum := func(hexColor string) float64 {
		r, _ := strconv.ParseInt(hexColor[1:3], 16, 64)
		g, _ := strconv.ParseInt(hexColor[3:5], 16, 64)
		b, _ := strconv.ParseInt(hexColor[5:7], 16, 64)
		channel := func(v int64) float64 {
			c := float64(v) / 255.0
			if c <= 0.03928 {
				return c / 12.92
			}
			return math.Pow((c+0.055)/1.055, 2.4)
		}
		return 0.2126*channel(r) + 0.7152*channel(g) + 0.0722*channel(b)
	}
	l1 := lum(fgHex)
	l2 := lum(bgHex)
	if l1 < l2 {
		l1, l2 = l2, l1
	}
	return (l1 + 0.05) / (l2 + 0.05)
}

func validateAccessibleColors(primary, accent, bg, text string) (string, string, string, string, error) {
	check := func(v, def string) string {
		v = strings.TrimSpace(v)
		if v == "" {
			return def
		}
		return strings.ToUpper(v)
	}
	p := check(primary, "#111827")
	a := check(accent, "#0F766E")
	b := check(bg, "#FFFFFF")
	t := check(text, "#111827")
	for _, c := range []string{p, a, b, t} {
		if !hexColorPattern.MatchString(c) {
			return "", "", "", "", errors.New("colors must use #RRGGBB hex format")
		}
	}
	if hexContrastRatio(t, b) < 4.5 {
		// Provide accessible fallback if text vs background fails WCAG AA contrast
		if hexContrastRatio("#111827", b) >= 4.5 {
			t = "#111827"
		} else {
			t = "#FFFFFF"
		}
	}
	return p, a, b, t, nil
}

func validateStorefrontSlug(raw string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if len(s) < 3 || len(s) > 40 || !storefrontSlugPattern.MatchString(s) {
		return "", errors.New("slug must be 3-63 lowercase letters, numbers, or hyphens")
	}
	if reservedStorefrontSlugs[s] {
		return "", ErrSlugUnavailable
	}
	return s, nil
}

func normalizeCustomHostname(raw string) (string, error) {
	h := strings.ToLower(strings.TrimSpace(raw))
	h = strings.TrimPrefix(h, "https://")
	h = strings.TrimPrefix(h, "http://")
	h = strings.TrimSuffix(h, ".")
	if h == "" || strings.ContainsAny(h, "/:?#@ \t\r\n") || len(h) > 253 {
		return "", ErrDomainInvalid
	}
	if strings.HasSuffix(h, ".rekordly.com") || h == "rekordly.com" || strings.HasSuffix(h, ".localhost") || h == "localhost" {
		return "", ErrDomainInvalid
	}
	parts := strings.Split(h, ".")
	if len(parts) < 2 {
		return "", ErrDomainInvalid
	}
	for _, p := range parts {
		if !validHostLabelPattern.MatchString(p) {
			return "", ErrDomainInvalid
		}
	}
	return h, nil
}

type StorefrontSettingsView struct {
	Tagline                 *string           `json:"tagline,omitempty"`
	Description             *string           `json:"description,omitempty"`
	LogoURL                 *string           `json:"logo_url,omitempty"`
	BannerURL               *string           `json:"banner_url,omitempty"`
	PrimaryColor            string            `json:"primary_color"`
	AccentColor             string            `json:"accent_color"`
	BackgroundColor         string            `json:"background_color"`
	TextColor               string            `json:"text_color"`
	FontFamily              string            `json:"font_family"`
	SectionOrder            []string          `json:"section_order"`
	ContactPhone            *string           `json:"contact_phone,omitempty"`
	ContactEmail            *string           `json:"contact_email,omitempty"`
	WhatsappNumber          *string           `json:"whatsapp_number,omitempty"`
	Address                 *string           `json:"address,omitempty"`
	BusinessHours           map[string]string `json:"business_hours"`
	SocialLinks             map[string]string `json:"social_links"`
	DeliveryMethods         []string          `json:"delivery_methods"`
	DeliveryGuidance        *string           `json:"delivery_guidance,omitempty"`
	DefaultDeliveryFeeMinor string            `json:"default_delivery_fee_minor"`
	CheckoutRequireEmail    bool              `json:"checkout_require_email"`
	CheckoutRequirePhone    bool              `json:"checkout_require_phone"`
	AutoShowNewProducts     bool              `json:"auto_show_new_products"`
	ShowSoldOut             bool              `json:"show_sold_out"`
	ShowStockCount          bool              `json:"show_stock_count"`
	LowStockThreshold       int32             `json:"low_stock_threshold"`
	ReturnPolicy            *string           `json:"return_policy,omitempty"`
	PrivacyPolicy           *string           `json:"privacy_policy,omitempty"`
	TermsPolicy             *string           `json:"terms_policy,omitempty"`
	CustomPolicy            *string           `json:"custom_policy,omitempty"`
	SeoTitle                *string           `json:"seo_title,omitempty"`
	SeoDescription          *string           `json:"seo_description,omitempty"`
	SeoImageURL             *string           `json:"seo_image_url,omitempty"`
	SeoIndexable            bool              `json:"seo_indexable"`
	Version                 int32             `json:"version"`
}

type StorefrontView struct {
	ID                  int64                  `json:"id"`
	WorkspaceID         int64                  `json:"workspace_id"`
	Name                string                 `json:"name"`
	Slug                string                 `json:"slug"`
	Status              string                 `json:"status"`
	ThemeKey            string                 `json:"theme_key"`
	Version             int32                  `json:"version"`
	DefaultOutletID     *int64                 `json:"default_outlet_id,omitempty"`
	Currency            string                 `json:"currency"`
	CurrencyExponent    int32                  `json:"currency_exponent"`
	ReservationTTLHours int32                  `json:"reservation_ttl_hours"`
	EntitlementStatus   string                 `json:"entitlement_status"`
	SubdomainHost       string                 `json:"subdomain_host"`
	PublishedCount      int64                  `json:"published_product_count"`
	Settings            StorefrontSettingsView `json:"settings"`
}

type CreateStorefrontInput struct {
	Name            string `json:"name"`
	Slug            string `json:"slug"`
	ThemeKey        string `json:"theme_key"`
	DefaultOutletID *int64 `json:"default_outlet_id"`
	Currency        string `json:"currency"`
}

type UpdateStorefrontSettingsInput struct {
	IdempotencyKey       string            `json:"idempotency_key,omitempty"`
	Name                 string            `json:"name"`
	Slug                 string            `json:"slug"`
	ThemeKey             string            `json:"theme_key"`
	DefaultOutletID      *int64            `json:"default_outlet_id"`
	ReservationTTLHours  *int32            `json:"reservation_ttl_hours"`
	Tagline              string            `json:"tagline"`
	Description          string            `json:"description"`
	LogoURL              string            `json:"logo_url"`
	BannerURL            string            `json:"banner_url"`
	PrimaryColor         string            `json:"primary_color"`
	AccentColor          string            `json:"accent_color"`
	BackgroundColor      string            `json:"background_color"`
	TextColor            string            `json:"text_color"`
	FontFamily           string            `json:"font_family"`
	SectionOrder         []string          `json:"section_order"`
	ContactPhone         string            `json:"contact_phone"`
	ContactEmail         string            `json:"contact_email"`
	WhatsappNumber       string            `json:"whatsapp_number"`
	Address              string            `json:"address"`
	BusinessHours        map[string]string `json:"business_hours"`
	SocialLinks          map[string]string `json:"social_links"`
	DeliveryMethods      []string          `json:"delivery_methods"`
	DeliveryGuidance     string            `json:"delivery_guidance"`
	DefaultDeliveryFee   string            `json:"default_delivery_fee"`
	CheckoutRequireEmail *bool             `json:"checkout_require_email"`
	CheckoutRequirePhone *bool             `json:"checkout_require_phone"`
	ReturnPolicy         string            `json:"return_policy"`
	PrivacyPolicy        string            `json:"privacy_policy"`
	TermsPolicy          string            `json:"terms_policy"`
	CustomPolicy         string            `json:"custom_policy"`
	SeoTitle             string            `json:"seo_title"`
	SeoDescription       string            `json:"seo_description"`
	SeoImageURL          string            `json:"seo_image_url"`
	SeoIndexable         *bool             `json:"seo_indexable"`
	AutoShowNewProducts  *bool             `json:"auto_show_new_products"`
	ShowSoldOut          *bool             `json:"show_sold_out"`
	ShowStockCount       *bool             `json:"show_stock_count"`
	LowStockThreshold    *int32            `json:"low_stock_threshold"`
}

func settingsToView(st db.StorefrontSetting) StorefrontSettingsView {
	var sections []string
	_ = json.Unmarshal(st.SectionOrder, &sections)
	var hours map[string]string
	_ = json.Unmarshal(st.BusinessHours, &hours)
	if hours == nil {
		hours = map[string]string{}
	}
	var socials map[string]string
	_ = json.Unmarshal(st.SocialLinks, &socials)
	if socials == nil {
		socials = map[string]string{}
	}
	var delivery []string
	_ = json.Unmarshal(st.DeliveryMethods, &delivery)
	return StorefrontSettingsView{
		Tagline:                 nullableText(st.Tagline),
		Description:             nullableText(st.Description),
		LogoURL:                 nullableText(st.LogoUrl),
		BannerURL:               nullableText(st.BannerUrl),
		PrimaryColor:            st.PrimaryColor,
		AccentColor:             st.AccentColor,
		BackgroundColor:         st.BackgroundColor,
		TextColor:               st.TextColor,
		FontFamily:              st.FontFamily,
		SectionOrder:            sections,
		ContactPhone:            nullableText(st.ContactPhone),
		ContactEmail:            nullableText(st.ContactEmail),
		WhatsappNumber:          nullableText(st.WhatsappNumber),
		Address:                 nullableText(st.Address),
		BusinessHours:           hours,
		SocialLinks:             socials,
		DeliveryMethods:         delivery,
		DeliveryGuidance:        nullableText(st.DeliveryGuidance),
		DefaultDeliveryFeeMinor: fmt.Sprint(st.DefaultDeliveryFeeMinor),
		CheckoutRequireEmail:    st.CheckoutRequireEmail,
		CheckoutRequirePhone:    st.CheckoutRequirePhone,
		AutoShowNewProducts:     st.AutoShowNewProducts,
		ShowSoldOut:             st.ShowSoldOut,
		ShowStockCount:          st.ShowStockCount,
		LowStockThreshold:       st.LowStockThreshold,
		ReturnPolicy:            nullableText(st.ReturnPolicy),
		PrivacyPolicy:           nullableText(st.PrivacyPolicy),
		TermsPolicy:             nullableText(st.TermsPolicy),
		CustomPolicy:            nullableText(st.CustomPolicy),
		SeoTitle:                nullableText(st.SeoTitle),
		SeoDescription:          nullableText(st.SeoDescription),
		SeoImageURL:             nullableText(st.SeoImageUrl),
		SeoIndexable:            st.SeoIndexable,
		Version:                 st.Version,
	}
}

func (s *Service) buildStorefrontView(ctx context.Context, sf db.Storefront) (StorefrontView, error) {
	st, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{StorefrontID: sf.ID, WorkspaceID: sf.WorkspaceID})
	if err != nil {
		return StorefrontView{}, err
	}
	pubCount, err := s.queries.CountPublishedStorefrontProducts(ctx, sf.ID)
	if err != nil {
		pubCount = 0
	}
	return StorefrontView{
		ID:                  sf.ID,
		WorkspaceID:         sf.WorkspaceID,
		Name:                sf.Name,
		Slug:                sf.Slug,
		Status:              sf.Status,
		ThemeKey:            sf.ThemeKey,
		Version:             sf.Version,
		DefaultOutletID:     nullableInt8(sf.DefaultOutletID),
		Currency:            sf.Currency,
		CurrencyExponent:    sf.CurrencyExponent,
		ReservationTTLHours: sf.ReservationTtlHours,
		EntitlementStatus:   sf.EntitlementStatus,
		SubdomainHost:       fmt.Sprintf("%s.rekordly.com", sf.Slug),
		PublishedCount:      pubCount,
		Settings:            settingsToView(st),
	}, nil
}

func (s *Service) CreateStorefront(ctx context.Context, ws, user int64, in CreateStorefrontInput) (StorefrontView, error) {
	name := sanitizePublicText(in.Name, 120)
	if len(name) < 2 {
		return StorefrontView{}, errors.New("storefront name must be at least 2 characters")
	}
	slug, err := validateStorefrontSlug(in.Slug)
	if err != nil {
		return StorefrontView{}, err
	}
	theme, err := normalizeStorefrontTheme(in.ThemeKey)
	if err != nil {
		return StorefrontView{}, err
	}
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = "NGN"
	}
	if len(currency) != 3 {
		return StorefrontView{}, ErrInvalidCurrency
	}
	var outletID pgtype.Int8
	if in.DefaultOutletID != nil && *in.DefaultOutletID > 0 {
		if _, err := inventoryLocationFor(ctx, s.queries, ws, *in.DefaultOutletID); err != nil {
			return StorefrontView{}, err
		}
		outletID = pgtype.Int8{Int64: *in.DefaultOutletID, Valid: true}
	}

	if existing, err := s.queries.GetStorefrontByWorkspace(ctx, ws); err == nil {
		return s.buildStorefrontView(ctx, existing)
	}
	if _, err := s.queries.GetStorefrontBySlug(ctx, slug); err == nil {
		return StorefrontView{}, ErrSlugUnavailable
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StorefrontView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	sf, err := q.CreateStorefront(ctx, db.CreateStorefrontParams{
		WorkspaceID:      ws,
		Name:             name,
		Slug:             slug,
		ThemeKey:         theme,
		DefaultOutletID:  outletID,
		Currency:         currency,
		CurrencyExponent: int32(CurrencyExponent(currency)),
		CreatedByUserID:  pgtype.Int8{Int64: user, Valid: user > 0},
	})
	if err != nil {
		return StorefrontView{}, ErrSlugUnavailable
	}
	if _, err := q.CreateDefaultStorefrontSettings(ctx, db.CreateDefaultStorefrontSettingsParams{
		StorefrontID: sf.ID,
		WorkspaceID:  ws,
	}); err != nil {
		return StorefrontView{}, err
	}
	subHost := fmt.Sprintf("%s.rekordly.com", slug)
	if _, err := q.CreateStorefrontDomain(ctx, db.CreateStorefrontDomainParams{
		WorkspaceID:       ws,
		StorefrontID:      sf.ID,
		Hostname:          subHost,
		DomainType:        "subdomain",
		Status:            "active",
		VerificationToken: pgtype.Text{},
		TlsStatus:         "active",
		IsPrimary:         true,
	}); err != nil {
		return StorefrontView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return StorefrontView{}, err
	}
	return s.buildStorefrontView(ctx, sf)
}

func (s *Service) GetMerchantStorefront(ctx context.Context, ws int64) (StorefrontView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if errors.Is(err, pgx.ErrNoRows) {
		return StorefrontView{}, ErrNotFound
	}
	if err != nil {
		return StorefrontView{}, err
	}
	return s.buildStorefrontView(ctx, sf)
}

func (s *Service) UpdateStorefrontSettings(ctx context.Context, ws int64, in UpdateStorefrontSettingsInput) (StorefrontView, error) {
	requestHash, err := storefrontDesignHash(in)
	if err != nil {
		return StorefrontView{}, err
	}
	if strings.TrimSpace(in.IdempotencyKey) != "" {
		if replay, checkErr := s.checkStorefrontDesignIdempotency(ctx, ws, in.IdempotencyKey, requestHash); checkErr != nil {
			return StorefrontView{}, checkErr
		} else if replay {
			return s.GetMerchantStorefront(ctx, ws)
		}
	}
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if errors.Is(err, pgx.ErrNoRows) {
		return StorefrontView{}, ErrNotFound
	}
	if err != nil {
		return StorefrontView{}, err
	}
	curSettings, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{StorefrontID: sf.ID, WorkspaceID: ws})
	if err != nil {
		return StorefrontView{}, err
	}

	var nextName pgtype.Text
	if trimmed := sanitizePublicText(in.Name, 120); len(trimmed) >= 2 {
		nextName = pgtype.Text{String: trimmed, Valid: true}
	}
	var nextSlug pgtype.Text
	if strings.TrimSpace(in.Slug) != "" && !strings.EqualFold(strings.TrimSpace(in.Slug), sf.Slug) {
		sl, err := validateStorefrontSlug(in.Slug)
		if err != nil {
			return StorefrontView{}, err
		}
		if other, err := s.queries.GetStorefrontBySlug(ctx, sl); err == nil && other.ID != sf.ID {
			return StorefrontView{}, ErrSlugUnavailable
		}
		nextSlug = pgtype.Text{String: sl, Valid: true}
	}
	var nextTheme pgtype.Text
	if strings.TrimSpace(in.ThemeKey) != "" {
		t, err := normalizeStorefrontTheme(in.ThemeKey)
		if err != nil {
			return StorefrontView{}, err
		}
		nextTheme = pgtype.Text{String: t, Valid: true}
	}
	var nextOutlet pgtype.Int8
	if in.DefaultOutletID != nil && *in.DefaultOutletID > 0 {
		if _, err := inventoryLocationFor(ctx, s.queries, ws, *in.DefaultOutletID); err != nil {
			return StorefrontView{}, err
		}
		nextOutlet = pgtype.Int8{Int64: *in.DefaultOutletID, Valid: true}
	}
	var nextTTL pgtype.Int4
	if in.ReservationTTLHours != nil {
		if *in.ReservationTTLHours < 0 || *in.ReservationTTLHours > 720 {
			return StorefrontView{}, errors.New("reservation TTL must be 0-720 hours")
		}
		nextTTL = pgtype.Int4{Int32: *in.ReservationTTLHours, Valid: true}
	}

	pColor, aColor, bColor, tColor, err := validateAccessibleColors(
		fallbackStr(in.PrimaryColor, curSettings.PrimaryColor),
		fallbackStr(in.AccentColor, curSettings.AccentColor),
		fallbackStr(in.BackgroundColor, curSettings.BackgroundColor),
		fallbackStr(in.TextColor, curSettings.TextColor),
	)
	if err != nil {
		return StorefrontView{}, err
	}
	font := fallbackStr(strings.TrimSpace(in.FontFamily), curSettings.FontFamily)
	if font != "inter" && font != "plus_jakarta" && font != "dm_sans" && font != "merriweather" && font != "system" {
		return StorefrontView{}, errors.New("unsupported font family")
	}

	secBytes := curSettings.SectionOrder
	if len(in.SectionOrder) > 0 {
		secBytes, _ = json.Marshal(in.SectionOrder)
	}
	hoursBytes := curSettings.BusinessHours
	if in.BusinessHours != nil {
		sanitized := map[string]string{}
		for k, v := range in.BusinessHours {
			sanitized[sanitizePublicText(k, 40)] = sanitizePublicText(v, 80)
		}
		hoursBytes, _ = json.Marshal(sanitized)
	}
	socialBytes := curSettings.SocialLinks
	if in.SocialLinks != nil {
		sanitized := map[string]string{}
		for k, v := range in.SocialLinks {
			if clean := sanitizeURLOrCloudinary(v); clean != "" {
				sanitized[sanitizePublicText(k, 40)] = clean
			}
		}
		socialBytes, _ = json.Marshal(sanitized)
	}
	delivBytes := curSettings.DeliveryMethods
	if len(in.DeliveryMethods) > 0 {
		validDel := make([]string, 0, len(in.DeliveryMethods))
		for _, m := range in.DeliveryMethods {
			if m == "pickup" || m == "merchant_delivery" || m == "customer_arranged" {
				validDel = append(validDel, m)
			}
		}
		if len(validDel) > 0 {
			delivBytes, _ = json.Marshal(validDel)
		}
	}
	feeMinor := curSettings.DefaultDeliveryFeeMinor
	if strings.TrimSpace(in.DefaultDeliveryFee) != "" {
		feeMinor, err = parseOptionalNonNegativeMajor(in.DefaultDeliveryFee, int(sf.CurrencyExponent))
		if err != nil || feeMinor < 0 {
			return StorefrontView{}, errors.New("delivery fee must be non-negative")
		}
	}
	reqEmail := curSettings.CheckoutRequireEmail
	if in.CheckoutRequireEmail != nil {
		reqEmail = *in.CheckoutRequireEmail
	}
	reqPhone := curSettings.CheckoutRequirePhone
	if in.CheckoutRequirePhone != nil {
		reqPhone = *in.CheckoutRequirePhone
	}
	idxable := curSettings.SeoIndexable
	if in.SeoIndexable != nil {
		idxable = *in.SeoIndexable
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StorefrontView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	updatedSF, err := q.UpdateStorefrontHeader(ctx, db.UpdateStorefrontHeaderParams{
		WorkspaceID:         ws,
		ID:                  sf.ID,
		Version:             sf.Version,
		Name:                nextName,
		Slug:                nextSlug,
		ThemeKey:            nextTheme,
		DefaultOutletID:     nextOutlet,
		ReservationTtlHours: nextTTL,
	})
	if err != nil {
		return StorefrontView{}, err
	}
	if _, err := q.UpdateStorefrontSettings(ctx, db.UpdateStorefrontSettingsParams{
		StorefrontID:            sf.ID,
		WorkspaceID:             ws,
		Tagline:                 optionalPgText(sanitizePublicText(in.Tagline, 200)),
		Description:             optionalPgText(sanitizePublicText(in.Description, 2000)),
		LogoUrl:                 optionalPgText(sanitizeURLOrCloudinary(in.LogoURL)),
		BannerUrl:               optionalPgText(sanitizeURLOrCloudinary(in.BannerURL)),
		PrimaryColor:            pColor,
		AccentColor:             aColor,
		BackgroundColor:         bColor,
		TextColor:               tColor,
		FontFamily:              font,
		SectionOrder:            secBytes,
		ContactPhone:            optionalPgText(sanitizePublicText(in.ContactPhone, 50)),
		ContactEmail:            optionalPgText(sanitizePublicText(in.ContactEmail, 160)),
		WhatsappNumber:          optionalPgText(sanitizePublicText(in.WhatsappNumber, 50)),
		Address:                 optionalPgText(sanitizePublicText(in.Address, 400)),
		BusinessHours:           hoursBytes,
		SocialLinks:             socialBytes,
		DeliveryMethods:         delivBytes,
		DeliveryGuidance:        optionalPgText(sanitizePublicText(in.DeliveryGuidance, 1000)),
		DefaultDeliveryFeeMinor: feeMinor,
		CheckoutRequireEmail:    reqEmail,
		CheckoutRequirePhone:    reqPhone,
		ReturnPolicy:            optionalPgText(SanitizeRichText(in.ReturnPolicy)),
		PrivacyPolicy:           optionalPgText(SanitizeRichText(in.PrivacyPolicy)),
		TermsPolicy:             optionalPgText(SanitizeRichText(in.TermsPolicy)),
		CustomPolicy:            optionalPgText(SanitizeRichText(in.CustomPolicy)),
		SeoTitle:                optionalPgText(sanitizePublicText(in.SeoTitle, 160)),
		SeoDescription:          optionalPgText(sanitizePublicText(in.SeoDescription, 400)),
		SeoImageUrl:             optionalPgText(sanitizeURLOrCloudinary(in.SeoImageURL)),
		SeoIndexable:            idxable,
		AutoShowNewProducts:     nullablePgBool(in.AutoShowNewProducts),
		ShowSoldOut:             nullablePgBool(in.ShowSoldOut),
		ShowStockCount:          nullablePgBool(in.ShowStockCount),
		LowStockThreshold:       nullablePgInt4(in.LowStockThreshold),
	}); err != nil {
		return StorefrontView{}, err
	}
	if nextSlug.Valid {
		// Keep default subdomain mapping synchronized
		_, _ = tx.Exec(ctx, `UPDATE storefront_domains SET hostname=$2, updated_at=now() WHERE storefront_id=$1 AND domain_type='subdomain'`, sf.ID, fmt.Sprintf("%s.rekordly.com", nextSlug.String))
	}
	if strings.TrimSpace(in.IdempotencyKey) != "" {
		if err := q.CreateStorefrontSettingsEvent(ctx, db.CreateStorefrontSettingsEventParams{
			WorkspaceID: ws, StorefrontID: sf.ID, IdempotencyKey: in.IdempotencyKey,
			RequestHash: requestHash, Version: updatedSF.Version,
		}); err != nil {
			return StorefrontView{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return StorefrontView{}, err
	}
	invalidateStorefrontCache(sf.Slug)
	if nextSlug.Valid {
		invalidateStorefrontCache(nextSlug.String)
	}
	return s.buildStorefrontView(ctx, updatedSF)
}

func fallbackStr(v, cur string) string {
	if strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return cur
}

func nullablePgBool(value *bool) pgtype.Bool {
	if value == nil {
		return pgtype.Bool{}
	}
	return pgtype.Bool{Bool: *value, Valid: true}
}

func nullablePgInt4(value *int32) pgtype.Int4 {
	if value == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *value, Valid: true}
}

func (s *Service) PublishStorefront(ctx context.Context, ws int64, publish bool) (StorefrontView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if errors.Is(err, pgx.ErrNoRows) {
		return StorefrontView{}, ErrNotFound
	}
	if err != nil {
		return StorefrontView{}, err
	}
	if sf.EntitlementStatus != "active" && publish {
		return StorefrontView{}, ErrStorefrontEntitlementLocked
	}
	nextStatus := "unpublished"
	if publish {
		cnt, _ := s.queries.CountPublishedStorefrontProducts(ctx, sf.ID)
		if cnt == 0 {
			return StorefrontView{}, errors.New("publish at least one active catalogue product before opening the storefront")
		}
		st, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{StorefrontID: sf.ID, WorkspaceID: ws})
		if err != nil {
			return StorefrontView{}, err
		}
		if (!st.ContactPhone.Valid || st.ContactPhone.String == "") && (!st.ContactEmail.Valid || st.ContactEmail.String == "") && (!st.WhatsappNumber.Valid || st.WhatsappNumber.String == "") {
			return StorefrontView{}, errors.New("add a public phone number, email, or WhatsApp contact before publishing")
		}
		nextStatus = "published"
	}
	updated, err := s.queries.UpdateStorefrontLifecycle(ctx, db.UpdateStorefrontLifecycleParams{
		WorkspaceID:       ws,
		ID:                sf.ID,
		Status:            nextStatus,
		EntitlementStatus: sf.EntitlementStatus,
		GraceUntil:        sf.GraceUntil,
	})
	if err != nil {
		return StorefrontView{}, err
	}
	invalidateStorefrontCache(sf.Slug)
	return s.buildStorefrontView(ctx, updated)
}

func (s *Service) SetStorefrontEntitlementState(ctx context.Context, ws int64, entState string, graceDays int) (StorefrontView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if errors.Is(err, pgx.ErrNoRows) {
		return StorefrontView{}, ErrNotFound
	}
	if err != nil {
		return StorefrontView{}, err
	}
	var grace pgtype.Timestamptz
	nextStatus := sf.Status
	switch entState {
	case "active":
		if sf.Status == "grace" || sf.Status == "disabled" {
			nextStatus = "unpublished"
		}
	case "grace":
		if graceDays <= 0 {
			graceDays = 7
		}
		grace = pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Duration(graceDays) * 24 * time.Hour), Valid: true}
		if sf.Status == "published" {
			nextStatus = "grace"
		}
	case "expired":
		nextStatus = "disabled"
	default:
		return StorefrontView{}, errors.New("entitlement_status must be active, grace, or expired")
	}
	updated, err := s.queries.UpdateStorefrontLifecycle(ctx, db.UpdateStorefrontLifecycleParams{
		WorkspaceID:       ws,
		ID:                sf.ID,
		Status:            nextStatus,
		EntitlementStatus: entState,
		GraceUntil:        grace,
	})
	if err != nil {
		return StorefrontView{}, err
	}
	_ = s.queries.UpdateStorefrontDomainsEntitlement(ctx, db.UpdateStorefrontDomainsEntitlementParams{
		StorefrontID: sf.ID,
		Column2:      entState,
	})
	invalidateStorefrontCache(sf.Slug)
	return s.buildStorefrontView(ctx, updated)
}

// Collections & Public Catalogue Publication

type StorefrontCollectionView struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	Slug        string  `json:"slug"`
	Description *string `json:"description,omitempty"`
	ImageURL    *string `json:"image_url,omitempty"`
	Position    int32   `json:"position"`
	IsVisible   bool    `json:"is_visible"`
}

type UpsertCollectionInput struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	ImageURL    string `json:"image_url"`
	Position    int32  `json:"position"`
	IsVisible   *bool  `json:"is_visible"`
}

func collectionToView(c db.StorefrontCollection) StorefrontCollectionView {
	return StorefrontCollectionView{
		ID:          c.ID,
		Name:        c.Name,
		Slug:        c.Slug,
		Description: nullableText(c.Description),
		ImageURL:    nullableText(c.ImageUrl),
		Position:    c.Position,
		IsVisible:   c.IsVisible,
	}
}

func (s *Service) ListStorefrontCollections(ctx context.Context, ws int64) ([]StorefrontCollectionView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	rows, err := s.queries.ListStorefrontCollections(ctx, db.ListStorefrontCollectionsParams{ID: sf.ID, WorkspaceID: ws})
	if err != nil {
		return nil, err
	}
	out := make([]StorefrontCollectionView, 0, len(rows))
	for _, r := range rows {
		out = append(out, StorefrontCollectionView{ID: r.ID, Name: r.Name, Slug: r.Slug, Description: nullableText(r.Description), ImageURL: nullableText(r.ImageUrl), Position: r.Position, IsVisible: r.IsVisible})
	}
	return out, nil
}

func (s *Service) CreateStorefrontCollection(ctx context.Context, ws int64, in UpsertCollectionInput) (StorefrontCollectionView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if err != nil {
		return StorefrontCollectionView{}, ErrNotFound
	}
	name := sanitizePublicText(in.Name, 80)
	slug := strings.ToLower(strings.TrimSpace(in.Slug))
	if slug == "" {
		slug = strings.ToLower(regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(name, "-"))
		slug = strings.Trim(slug, "-")
	}
	if name == "" || !storefrontSlugPattern.MatchString(slug) {
		return StorefrontCollectionView{}, errors.New("collection name and valid slug are required")
	}
	visible := true
	if in.IsVisible != nil {
		visible = *in.IsVisible
	}
	row, err := s.queries.CreateStorefrontCollection(ctx, db.CreateStorefrontCollectionParams{
		WorkspaceID:  ws,
		StorefrontID: sf.ID,
		Name:         name,
		Slug:         slug,
		Description:  optionalPgText(sanitizePublicText(in.Description, 500)),
		ImageUrl:     optionalPgText(sanitizeURLOrCloudinary(in.ImageURL)),
		Position:     in.Position,
		IsVisible:    visible,
	})
	if err != nil {
		return StorefrontCollectionView{}, err
	}
	invalidateStorefrontCache(sf.Slug)
	return collectionToView(row), nil
}

type MerchantStorefrontProductView struct {
	ID                 int64    `json:"id"`
	ProductID          int64    `json:"product_id"`
	VariantID          int64    `json:"variant_id"`
	CollectionID       *int64   `json:"collection_id,omitempty"`
	IsPublished        bool     `json:"is_published"`
	IsFeatured         bool     `json:"is_featured"`
	PublicTitle        string   `json:"public_title"`
	PublicDescription  *string  `json:"public_description,omitempty"`
	PublicSKU          *string  `json:"public_sku,omitempty"`
	ImageURLs          []string `json:"image_urls"`
	PublicPriceMinor   string   `json:"public_price_minor"`
	Currency           string   `json:"currency"`
	AvailabilityPolicy string   `json:"availability_policy"`
	LowStockThreshold  int32    `json:"low_stock_threshold"`
	MaxQtyPerOrder     int32    `json:"max_qty_per_order"`
	ContactOnly        bool     `json:"contact_only"`
	Position           int32    `json:"position"`
	ProductKind        string   `json:"product_kind"`
	VariantName        string   `json:"variant_name"`
}

type PublishCatalogueVariantInput struct {
	CollectionID       *int64   `json:"collection_id"`
	IsPublished        bool     `json:"is_published"`
	IsFeatured         bool     `json:"is_featured"`
	PublicTitle        string   `json:"public_title"`
	PublicDescription  string   `json:"public_description"`
	PublicSKU          string   `json:"public_sku"`
	ImageURLs          []string `json:"image_urls"`
	PublicPrice        string   `json:"public_price"`
	AvailabilityPolicy string   `json:"availability_policy"`
	LowStockThreshold  *int32   `json:"low_stock_threshold"`
	MaxQtyPerOrder     *int32   `json:"max_qty_per_order"`
	ContactOnly        bool     `json:"contact_only"`
	Position           int32    `json:"position"`
	SeoSlug            string   `json:"seo_slug"`
	SeoTitle           string   `json:"seo_title"`
	SeoDescription     string   `json:"seo_description"`
}

func (s *Service) UpsertStorefrontProduct(ctx context.Context, ws, variantID int64, in PublishCatalogueVariantInput) (MerchantStorefrontProductView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantStorefrontProductView{}, ErrNotFound
	}
	if err != nil {
		return MerchantStorefrontProductView{}, err
	}
	variant, err := s.queries.GetVariantByID(ctx, db.GetVariantByIDParams{WorkspaceID: ws, ID: variantID})
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantStorefrontProductView{}, ErrNotFound
	}
	if err != nil {
		return MerchantStorefrontProductView{}, err
	}
	product, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: ws, ID: variant.ProductID})
	if err != nil {
		return MerchantStorefrontProductView{}, err
	}
	if in.IsPublished && (product.Status != "active" || !variant.IsActive) {
		return MerchantStorefrontProductView{}, errors.New("only active products and active variants can be published")
	}
	if in.IsPublished && variant.Currency != sf.Currency {
		return StorefrontErrCurrency(sf.Currency)
	}
	title := sanitizePublicText(in.PublicTitle, 160)
	if title == "" {
		if variant.Name == "" || strings.EqualFold(variant.Name, "Default") {
			title = product.Name
		} else {
			title = fmt.Sprintf("%s — %s", product.Name, variant.Name)
		}
	}
	desc := sanitizePublicText(in.PublicDescription, 4000)
	if desc == "" && product.Description.Valid {
		desc = sanitizePublicText(product.Description.String, 4000)
	}
	priceMinor := variant.SellingPriceMinor
	if strings.TrimSpace(in.PublicPrice) != "" {
		priceMinor, err = parseOptionalNonNegativeMajor(in.PublicPrice, int(variant.CurrencyExponent))
		if err != nil || priceMinor < 0 {
			return MerchantStorefrontProductView{}, errors.New("public price is invalid")
		}
	}
	availPolicy := strings.TrimSpace(in.AvailabilityPolicy)
	if availPolicy == "" {
		availPolicy = "in_out_stock"
	}
	switch availPolicy {
	case "in_out_stock", "exact_quantity", "low_stock", "hide_unavailable", "allow_request":
	default:
		return MerchantStorefrontProductView{}, errors.New("invalid availability policy")
	}
	lowThreshold := int32(5)
	if in.LowStockThreshold != nil && *in.LowStockThreshold >= 0 {
		lowThreshold = *in.LowStockThreshold
	}
	maxQty := int32(50)
	if in.MaxQtyPerOrder != nil && *in.MaxQtyPerOrder > 0 {
		maxQty = *in.MaxQtyPerOrder
	}
	cleanImages := make([]string, 0, len(in.ImageURLs))
	for _, rawImg := range in.ImageURLs {
		if c := sanitizeURLOrCloudinary(rawImg); c != "" {
			cleanImages = append(cleanImages, c)
		}
	}
	imgBytes, _ := json.Marshal(cleanImages)
	var colID pgtype.Int8
	if in.CollectionID != nil && *in.CollectionID > 0 {
		colID = pgtype.Int8{Int64: *in.CollectionID, Valid: true}
	}

	row, err := s.queries.UpsertStorefrontProduct(ctx, db.UpsertStorefrontProductParams{
		WorkspaceID:        ws,
		StorefrontID:       sf.ID,
		ProductID:          product.ID,
		VariantID:          variant.ID,
		CollectionID:       colID,
		IsPublished:        in.IsPublished,
		IsFeatured:         in.IsFeatured,
		PublicTitle:        optionalPgText(title),
		PublicDescription:  optionalPgText(desc),
		PublicSku:          optionalPgText(sanitizePublicText(in.PublicSKU, 80)),
		ImageUrls:          imgBytes,
		PublicPriceMinor:   pgtype.Int8{Int64: priceMinor, Valid: true},
		AvailabilityPolicy: optionalPgText(availPolicy),
		LowStockThreshold:  pgtype.Int4{Int32: lowThreshold, Valid: true},
		MaxQtyPerOrder:     pgtype.Int4{Int32: maxQty, Valid: true},
		ContactOnly:        pgtype.Bool{Bool: in.ContactOnly, Valid: true},
		Position:           in.Position,
		SeoSlug:            optionalPgText(sanitizePublicText(in.SeoSlug, 120)),
		SeoTitle:           optionalPgText(sanitizePublicText(in.SeoTitle, 160)),
		SeoDescription:     optionalPgText(sanitizePublicText(in.SeoDescription, 400)),
	})
	if err != nil {
		return MerchantStorefrontProductView{}, err
	}
	invalidateStorefrontCache(sf.Slug)
	return MerchantStorefrontProductView{
		ID:                 row.ID,
		ProductID:          row.ProductID,
		VariantID:          row.VariantID,
		CollectionID:       nullableInt8(row.CollectionID),
		IsPublished:        row.IsPublished,
		IsFeatured:         row.IsFeatured,
		PublicTitle:        storefrontTextOr(row.PublicTitle, "Product"),
		PublicDescription:  nullableText(row.PublicDescription),
		PublicSKU:          nullableText(row.PublicSku),
		ImageURLs:          cleanImages,
		PublicPriceMinor:   storefrontMinorOr(row.PublicPriceMinor),
		Currency:           variant.Currency,
		AvailabilityPolicy: storefrontTextOr(row.AvailabilityPolicy, "in_out_stock"),
		LowStockThreshold:  storefrontInt4Or(row.LowStockThreshold, 3),
		MaxQtyPerOrder:     storefrontInt4Or(row.MaxQtyPerOrder, 50),
		ContactOnly:        storefrontBoolOr(row.ContactOnly, false),
		Position:           row.Position,
		ProductKind:        product.Kind,
		VariantName:        variant.Name,
	}, nil
}

func StorefrontErrCurrency(curr string) (MerchantStorefrontProductView, error) {
	return MerchantStorefrontProductView{}, fmt.Errorf("product currency must match storefront currency %s", curr)
}

func (s *Service) ListMerchantStorefrontProducts(ctx context.Context, ws int64) ([]MerchantStorefrontProductView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	rows, err := s.queries.ListMerchantStorefrontProducts(ctx, db.ListMerchantStorefrontProductsParams{
		StorefrontID: sf.ID,
		WorkspaceID:  ws,
	})
	if err != nil {
		return nil, err
	}
	out := make([]MerchantStorefrontProductView, 0, len(rows))
	for _, r := range rows {
		var imgs []string
		_ = json.Unmarshal(r.ImageUrls, &imgs)
		if imgs == nil {
			imgs = []string{}
		}
		out = append(out, MerchantStorefrontProductView{
			ID:                 r.ID,
			ProductID:          r.ProductID,
			VariantID:          r.VariantID,
			CollectionID:       nullableInt8(r.CollectionID),
			IsPublished:        r.IsPublished,
			IsFeatured:         r.IsFeatured,
			PublicTitle:        storefrontTextOr(r.PublicTitle, "Product"),
			PublicDescription:  nullableText(r.PublicDescription),
			PublicSKU:          nullableText(r.PublicSku),
			ImageURLs:          imgs,
			PublicPriceMinor:   storefrontMinorOr(r.PublicPriceMinor),
			Currency:           r.Currency,
			AvailabilityPolicy: storefrontTextOr(r.AvailabilityPolicy, "in_out_stock"),
			LowStockThreshold:  storefrontInt4Or(r.LowStockThreshold, 3),
			MaxQtyPerOrder:     storefrontInt4Or(r.MaxQtyPerOrder, 50),
			ContactOnly:        storefrontBoolOr(r.ContactOnly, false),
			Position:           r.Position,
			ProductKind:        r.ProductKind,
			VariantName:        r.VariantName,
		})
	}
	return out, nil
}

// Custom Domains & Verification

type StorefrontDomainView struct {
	ID                int64   `json:"id"`
	Hostname          string  `json:"hostname"`
	DomainType        string  `json:"domain_type"`
	Status            string  `json:"status"`
	VerificationTXT   *string `json:"verification_txt_host,omitempty"`
	VerificationToken *string `json:"verification_token,omitempty"`
	TlsStatus         string  `json:"tls_status"`
	CheckAttempts     int32   `json:"check_attempts"`
	LastError         *string `json:"last_error,omitempty"`
	IsPrimary         bool    `json:"is_primary"`
}

func domainToView(d db.StorefrontDomain) StorefrontDomainView {
	var txtHost *string
	if d.DomainType == "custom" && d.VerificationToken.Valid {
		h := "_rekordly-verify." + d.Hostname
		txtHost = &h
	}
	return StorefrontDomainView{
		ID:                d.ID,
		Hostname:          d.Hostname,
		DomainType:        d.DomainType,
		Status:            d.Status,
		VerificationTXT:   txtHost,
		VerificationToken: nullableText(d.VerificationToken),
		TlsStatus:         d.TlsStatus,
		CheckAttempts:     d.CheckAttempts,
		LastError:         nullableText(d.LastError),
		IsPrimary:         d.IsPrimary,
	}
}

func (s *Service) ListStorefrontDomains(ctx context.Context, ws int64) ([]StorefrontDomainView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := s.queries.ListStorefrontDomains(ctx, db.ListStorefrontDomainsParams{StorefrontID: sf.ID, WorkspaceID: ws})
	if err != nil {
		return nil, err
	}
	out := make([]StorefrontDomainView, 0, len(rows))
	for _, r := range rows {
		out = append(out, domainToView(r))
	}
	return out, nil
}

func (s *Service) AddCustomDomain(ctx context.Context, ws int64, rawHostname string) (StorefrontDomainView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if err != nil {
		return StorefrontDomainView{}, ErrNotFound
	}
	if sf.EntitlementStatus != "active" {
		return StorefrontDomainView{}, ErrStorefrontEntitlementLocked
	}
	host, err := normalizeCustomHostname(rawHostname)
	if err != nil {
		return StorefrontDomainView{}, err
	}
	if _, err := s.queries.GetStorefrontDomainByHost(ctx, host); err == nil {
		// Never leak which workspace claims the domain
		return StorefrontDomainView{}, ErrDomainAlreadyClaimed
	}
	token, err := randomHexToken(16)
	if err != nil {
		return StorefrontDomainView{}, err
	}
	d, err := s.queries.CreateStorefrontDomain(ctx, db.CreateStorefrontDomainParams{
		WorkspaceID:       ws,
		StorefrontID:      sf.ID,
		Hostname:          host,
		DomainType:        "custom",
		Status:            "pending_dns",
		VerificationToken: pgtype.Text{String: "rekordly-verify=" + token, Valid: true},
		TlsStatus:         "pending",
		IsPrimary:         false,
	})
	if err != nil {
		return StorefrontDomainView{}, ErrDomainAlreadyClaimed
	}
	return domainToView(d), nil
}

func (s *Service) RecheckCustomDomain(ctx context.Context, ws, domainID int64) (StorefrontDomainView, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StorefrontDomainView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	dom, err := q.GetStorefrontDomainForUpdate(ctx, db.GetStorefrontDomainForUpdateParams{ID: domainID, WorkspaceID: ws})
	if errors.Is(err, pgx.ErrNoRows) {
		return StorefrontDomainView{}, ErrNotFound
	}
	if err != nil {
		return StorefrontDomainView{}, err
	}
	if dom.DomainType != "custom" || dom.Status == "disconnected" {
		return StorefrontDomainView{}, errors.New("only connected custom domains can be rechecked")
	}
	if dom.LastCheckedAt.Valid && time.Since(dom.LastCheckedAt.Time) < 2*time.Second && s.dnsLookupTXT == nil {
		return StorefrontDomainView{}, errors.New("please wait a moment before rechecking DNS")
	}

	lookupFn := net.LookupTXT
	if s.dnsLookupTXT != nil {
		lookupFn = s.dnsLookupTXT
	}
	txtHost := "_rekordly-verify." + dom.Hostname
	records, lookupErr := lookupFn(txtHost)
	verified := false
	expected := dom.VerificationToken.String
	for _, r := range records {
		if strings.TrimSpace(r) == expected {
			verified = true
			break
		}
	}
	var updated db.StorefrontDomain
	if !verified {
		msg := fmt.Sprintf("TXT record at %s did not match %s", txtHost, expected)
		if lookupErr != nil {
			msg = "DNS TXT record not found yet; propagation may take a few minutes"
		}
		updated, err = q.UpdateStorefrontDomainState(ctx, db.UpdateStorefrontDomainStateParams{
			ID:          dom.ID,
			WorkspaceID: ws,
			Status:      "error",
			TlsStatus:   "pending",
			LastError:   pgtype.Text{String: msg, Valid: true},
		})
	} else {
		updated, err = q.UpdateStorefrontDomainState(ctx, db.UpdateStorefrontDomainStateParams{
			ID:          dom.ID,
			WorkspaceID: ws,
			Status:      "active",
			TlsStatus:   "active",
			LastError:   pgtype.Text{},
			IsPrimary:   pgtype.Bool{Bool: true, Valid: true},
		})
	}
	if err != nil {
		return StorefrontDomainView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return StorefrontDomainView{}, err
	}
	invalidateStorefrontCache("")
	return domainToView(updated), nil
}

func (s *Service) DisconnectCustomDomain(ctx context.Context, ws, domainID int64) (StorefrontDomainView, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StorefrontDomainView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	dom, err := q.GetStorefrontDomainForUpdate(ctx, db.GetStorefrontDomainForUpdateParams{ID: domainID, WorkspaceID: ws})
	if errors.Is(err, pgx.ErrNoRows) {
		return StorefrontDomainView{}, ErrNotFound
	}
	if err != nil {
		return StorefrontDomainView{}, err
	}
	if dom.DomainType == "subdomain" {
		return StorefrontDomainView{}, errors.New("default Rekordly subdomain cannot be disconnected")
	}
	updated, err := q.UpdateStorefrontDomainState(ctx, db.UpdateStorefrontDomainStateParams{
		ID:          dom.ID,
		WorkspaceID: ws,
		Status:      "disconnected",
		TlsStatus:   "pending",
		LastError:   pgtype.Text{},
		IsPrimary:   pgtype.Bool{Bool: false, Valid: true},
	})
	if err != nil {
		return StorefrontDomainView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return StorefrontDomainView{}, err
	}
	invalidateStorefrontCache("")
	return domainToView(updated), nil
}

type StorefrontAnalyticsView struct {
	SinceDate          string `json:"since_date"`
	PageViews          int64  `json:"page_views"`
	ProductViews       int64  `json:"product_views"`
	CollectionViews    int64  `json:"collection_views"`
	Searches           int64  `json:"searches"`
	AddToCarts         int64  `json:"add_to_carts"`
	CheckoutsStarted   int64  `json:"checkouts_started"`
	CheckoutsSubmitted int64  `json:"checkouts_submitted"`
	OrdersConfirmed    int64  `json:"orders_confirmed"`
	OrdersDeclined     int64  `json:"orders_declined"`
	OrdersCancelled    int64  `json:"orders_cancelled"`
	OrdersFulfilled    int64  `json:"orders_fulfilled"`
}

func (s *Service) GetStorefrontAnalytics(ctx context.Context, ws int64, days int) (StorefrontAnalyticsView, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if err != nil {
		return StorefrontAnalyticsView{}, ErrNotFound
	}
	if days <= 0 || days > 365 {
		days = 30
	}
	since := time.Now().UTC().AddDate(0, 0, -days)
	row, err := s.queries.GetStorefrontAnalyticsSummary(ctx, db.GetStorefrontAnalyticsSummaryParams{
		StorefrontID: sf.ID,
		WorkspaceID:  ws,
		OccurredOn:   pgtype.Date{Time: since, Valid: true},
	})
	if err != nil {
		return StorefrontAnalyticsView{}, err
	}
	return StorefrontAnalyticsView{
		SinceDate:          since.Format("2006-01-02"),
		PageViews:          row.PageViews,
		ProductViews:       row.ProductViews,
		CollectionViews:    row.CollectionViews,
		Searches:           row.Searches,
		AddToCarts:         row.AddToCarts,
		CheckoutsStarted:   row.CheckoutsStarted,
		CheckoutsSubmitted: row.CheckoutsSubmitted,
		OrdersConfirmed:    row.OrdersConfirmed,
		OrdersDeclined:     row.OrdersDeclined,
		OrdersCancelled:    row.OrdersCancelled,
		OrdersFulfilled:    row.OrdersFulfilled,
	}, nil
}
