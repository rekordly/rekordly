package finance

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
)

var ErrStorefrontDesignVersionConflict = errors.New("store design changed. Reload the page and try again")
var ErrStorefrontThemePurchaseRequired = errors.New("purchase this theme before publishing")

type StorefrontBrand struct {
	Colors          []string           `json:"colors,omitempty"`
	HeadingFont     string             `json:"heading_font,omitempty"`
	BodyFont        string             `json:"body_font,omitempty"`
	LogoURL         string             `json:"logo_url,omitempty"`
	FaviconURL      string             `json:"favicon_url,omitempty"`
	Palette         string             `json:"palette"`
	CustomColor     string             `json:"custom_color,omitempty"`
	FontStyle       string             `json:"font_style"`
	ResolvedPalette *StorefrontPalette `json:"resolved_palette,omitempty"`
}

type StorefrontPalette struct {
	Primary    string `json:"primary"`
	Accent     string `json:"accent"`
	Background string `json:"background"`
	Surface    string `json:"surface"`
	Text       string `json:"text"`
	Muted      string `json:"muted"`
}

type StorefrontSection struct {
	ID      string         `json:"id"`
	Type    string         `json:"type"`
	Enabled bool           `json:"enabled"`
	Content map[string]any `json:"content"`
}

type StorefrontDesignInput struct {
	ThemeKey        string              `json:"theme_key"`
	Name            string              `json:"name"`
	Brand           StorefrontBrand     `json:"brand"`
	Sections        []StorefrontSection `json:"sections"`
	ExpectedVersion int32               `json:"expected_version"`
	IdempotencyKey  string              `json:"idempotency_key"`
}

type StorefrontDesignCommandInput struct {
	ExpectedVersion int32  `json:"expected_version"`
	IdempotencyKey  string `json:"idempotency_key"`
}

type StorefrontDesignThemeOption struct {
	Key           string `json:"key"`
	Name          string `json:"name"`
	Price         string `json:"price"`
	PriceMinor    string `json:"price_minor,omitempty"`
	Currency      string `json:"currency,omitempty"`
	PlanVersionID int64  `json:"plan_version_id,omitempty"`
	Purchasable   bool   `json:"purchasable"`
	Owned         bool   `json:"owned"`
}

type StorefrontDesignView struct {
	Name                  string                        `json:"name"`
	DraftName             string                        `json:"draft_name"`
	Slug                  string                        `json:"slug"`
	Link                  string                        `json:"link"`
	Status                string                        `json:"status"`
	Version               int32                         `json:"version"`
	PublishedThemeKey     string                        `json:"published_theme_key"`
	PublishedBrand        json.RawMessage               `json:"published_brand"`
	PublishedSections     json.RawMessage               `json:"published_sections"`
	DraftThemeKey         string                        `json:"draft_theme_key"`
	DraftBrand            json.RawMessage               `json:"draft_brand"`
	DraftSections         json.RawMessage               `json:"draft_sections"`
	ThemeDrafts           json.RawMessage               `json:"theme_drafts"`
	Contact               map[string]any                `json:"contact"`
	AvailableThemes       []StorefrontDesignThemeOption `json:"available_themes"`
	HasUnpublishedChanges bool                          `json:"has_unpublished_changes"`
}

var storefrontThemeFields = map[string]map[string]bool{
	"simple":   {"announcement": true, "hero": true, "product_grid": true, "collections": true, "about": true, "faq": true, "contact": true},
	"boutique": {"announcement": true, "hero": true, "product_grid": true, "collections": true, "about": true, "faq": true, "contact": true},
	"bold":     {"announcement": true, "hero": true, "product_grid": true, "collections": true, "about": true, "faq": true, "contact": true},
	"market":   {"announcement": true, "hero": true, "product_grid": true, "collections": true, "about": true, "faq": true, "contact": true},
	"studio":   {"announcement": true, "hero": true, "product_grid": true, "collections": true, "about": true, "faq": true, "contact": true},
}

func normalizeStorefrontTheme(theme string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(theme)) {
	case "", "classic", "modern", "minimal", "simple":
		return "simple", nil
	case "editorial", "boutique":
		return "boutique", nil
	case "bold", "market", "studio":
		return strings.ToLower(strings.TrimSpace(theme)), nil
	default:
		return "", errors.New("choose a supported store theme")
	}
}

var storefrontSectionFields = map[string]map[string]bool{
	"announcement": {"text": true, "link": true},
	"hero":         {"image": true, "heading": true, "subheading": true, "button_label": true, "product_id": true},
	"product_grid": {"title": true, "source": true, "collection_id": true, "limit": true},
	"collections":  {"collection_ids": true},
	"about":        {"heading": true, "body": true, "image": true},
	"faq":          {"items": true},
	"contact":      {},
}

var storefrontNamedPalettes = map[string]StorefrontPalette{
	"green":  {Primary: "#166534", Accent: "#047857"},
	"ink":    {Primary: "#1F2937", Accent: "#334155"},
	"ocean":  {Primary: "#075985", Accent: "#0E7490"},
	"sunset": {Primary: "#9A3412", Accent: "#C2410C"},
	"rose":   {Primary: "#9F1239", Accent: "#BE123C"},
	"earth":  {Primary: "#5C4033", Accent: "#6B5B36"},
}

func resolveStorefrontPalette(brand StorefrontBrand) *StorefrontPalette {
	base, ok := storefrontNamedPalettes[brand.Palette]
	if !ok {
		primary := strings.ToUpper(strings.TrimSpace(brand.CustomColor))
		if !hexColorPattern.MatchString(primary) {
			primary = storefrontNamedPalettes["green"].Primary
		}
		for hexContrastRatio(primary, "#FFFFFF") < 4.5 {
			parts := []string{primary[1:3], primary[3:5], primary[5:7]}
			for i := range parts {
				value, _ := strconv.ParseInt(parts[i], 16, 64)
				parts[i] = fmt.Sprintf("%02X", value*9/10)
			}
			primary = "#" + strings.Join(parts, "")
		}
		base = StorefrontPalette{Primary: primary, Accent: primary}
	}
	base.Background = "#FFFFFF"
	base.Surface = "#F8FAFC"
	base.Text = "#111827"
	base.Muted = "#475569"
	return &base
}

func storefrontSectionText(content map[string]any, key string, max int) (string, error) {
	v, ok := content[key]
	if !ok || v == nil {
		return "", nil
	}
	s, ok := v.(string)
	if !ok {
		return "", fmt.Errorf("%s must be text", key)
	}
	s = strings.TrimSpace(s)
	if len([]rune(s)) > max {
		return "", fmt.Errorf("%s is too long", key)
	}
	return s, nil
}

func validateStoreImage(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		return "", nil
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || !strings.EqualFold(u.Hostname(), "res.cloudinary.com") || !strings.Contains(u.Path, "/image/upload/") {
		return "", errors.New("choose an image uploaded to Rekordly")
	}
	return sanitizeURLOrCloudinary(u.String()), nil
}

func validateStorefrontDesign(in StorefrontDesignInput) (StorefrontDesignInput, []byte, []byte, error) {
	in.ThemeKey = strings.ToLower(strings.TrimSpace(in.ThemeKey))
	if _, ok := storefrontThemeFields[in.ThemeKey]; !ok {
		return in, nil, nil, errors.New("choose a supported store theme")
	}
	in.Name = sanitizePublicText(in.Name, 120)
	if len([]rune(in.Name)) < 2 {
		return in, nil, nil, errors.New("store name must be at least 2 characters")
	}
	in.Brand.Palette = strings.ToLower(strings.TrimSpace(in.Brand.Palette))
	in.Brand.FontStyle = strings.ToLower(strings.TrimSpace(in.Brand.FontStyle))
	if in.Brand.Palette != "custom" && in.Brand.Palette != "green" && in.Brand.Palette != "ink" && in.Brand.Palette != "ocean" && in.Brand.Palette != "sunset" && in.Brand.Palette != "rose" && in.Brand.Palette != "earth" {
		return in, nil, nil, errors.New("choose one of the available colour palettes")
	}
	if in.Brand.FontStyle != "modern" && in.Brand.FontStyle != "classic" && in.Brand.FontStyle != "friendly" {
		return in, nil, nil, errors.New("choose an available text style")
	}
	if in.Brand.Palette == "custom" {
		if !hexColorPattern.MatchString(in.Brand.CustomColor) {
			return in, nil, nil, errors.New("choose a valid brand colour")
		}
		in.Brand.CustomColor = strings.ToUpper(in.Brand.CustomColor)
	}
	in.Brand.ResolvedPalette = nil
	if err := validateStoreBrand(&in.Brand); err != nil {
		return in, nil, nil, err
	}
	logo, err := validateStoreImage(in.Brand.LogoURL)
	if err != nil {
		return in, nil, nil, err
	}
	in.Brand.LogoURL = logo
	if len(in.Sections) > 40 {
		return in, nil, nil, errors.New("a store can have at most 40 sections")
	}
	seen := map[string]bool{}
	for i := range in.Sections {
		section := &in.Sections[i]
		if strings.TrimSpace(section.ID) == "" || len(section.ID) > 80 || seen[section.ID] {
			return in, nil, nil, errors.New("each section needs a unique id")
		}
		seen[section.ID] = true
		if !storefrontThemeFields[in.ThemeKey][section.Type] {
			return in, nil, nil, fmt.Errorf("the %s theme does not support the %s section", in.ThemeKey, section.Type)
		}
		if section.Content == nil {
			section.Content = map[string]any{}
		}
		for key := range section.Content {
			if !storefrontSectionFields[section.Type][key] {
				return in, nil, nil, fmt.Errorf("the %s section does not support %s", section.Type, key)
			}
		}
		switch section.Type {
		case "announcement":
			if _, err := storefrontSectionText(section.Content, "text", 120); err != nil {
				return in, nil, nil, err
			}
			if _, err := storefrontSectionText(section.Content, "link", 300); err != nil {
				return in, nil, nil, err
			}
		case "hero":
			if productID, ok := section.Content["product_id"]; ok && productID != nil {
				value, numeric := productID.(float64)
				if !numeric || value < 1 || value != float64(int64(value)) {
					return in, nil, nil, errors.New("choose a valid featured product")
				}
			}
			for key, max := range map[string]int{"heading": 80, "subheading": 180, "button_label": 28} {
				if _, err := storefrontSectionText(section.Content, key, max); err != nil {
					return in, nil, nil, err
				}
			}
			if image, ok := section.Content["image"].(string); ok {
				clean, err := validateStoreImage(image)
				if err != nil {
					return in, nil, nil, err
				}
				section.Content["image"] = clean
			} else if section.Content["image"] != nil {
				return in, nil, nil, errors.New("banner image must be one uploaded image")
			}
		case "product_grid":
			if _, err := storefrontSectionText(section.Content, "title", 48); err != nil {
				return in, nil, nil, err
			}
			if source, ok := section.Content["source"].(string); ok && source != "new" && source != "best_sellers" && source != "featured" && source != "collection" {
				return in, nil, nil, errors.New("choose a valid product list")
			}
		case "about":
			if _, err := storefrontSectionText(section.Content, "heading", 80); err != nil {
				return in, nil, nil, err
			}
			body, err := storefrontSectionText(section.Content, "body", 3000)
			if err != nil {
				return in, nil, nil, err
			}
			section.Content["body"] = SanitizeRichText(body)
			if image, ok := section.Content["image"].(string); ok {
				clean, err := validateStoreImage(image)
				if err != nil {
					return in, nil, nil, err
				}
				section.Content["image"] = clean
			}
		case "faq":
			items, ok := section.Content["items"].([]any)
			if !ok && section.Content["items"] != nil {
				return in, nil, nil, errors.New("questions must be a list")
			}
			if len(items) > 10 {
				return in, nil, nil, errors.New("add no more than 10 questions")
			}
			for j, raw := range items {
				item, ok := raw.(map[string]any)
				if !ok {
					return in, nil, nil, errors.New("each question needs a question and answer")
				}
				for key, max := range map[string]int{"question": 240, "answer": 1500} {
					value, ok := item[key].(string)
					if !ok || len([]rune(value)) > max {
						return in, nil, nil, fmt.Errorf("question %d has invalid %s text", j+1, key)
					}
					if key == "answer" {
						item[key] = SanitizeRichText(value)
					}
				}
			}
		}
	}
	brandJSON, err := json.Marshal(in.Brand)
	if err != nil {
		return in, nil, nil, err
	}
	sectionsJSON, err := json.Marshal(in.Sections)
	return in, brandJSON, sectionsJSON, err
}

func (s *Service) storefrontDesignView(ctx context.Context, ws int64) (StorefrontDesignView, error) {
	row, err := s.queries.GetStorefrontDesignState(ctx, ws)
	if errors.Is(err, pgx.ErrNoRows) {
		return StorefrontDesignView{}, ErrNotFound
	}
	if err != nil {
		return StorefrontDesignView{}, err
	}
	contact := map[string]any{
		"phone": nullableText(row.ContactPhone), "email": nullableText(row.ContactEmail),
		"whatsapp_number": nullableText(row.WhatsappNumber), "address": nullableText(row.Address),
		"business_hours": json.RawMessage(row.BusinessHours),
	}
	var publishedBrand, publishedSections, draftBrand, draftSections any
	_ = json.Unmarshal(row.Brand, &publishedBrand)
	_ = json.Unmarshal(row.Sections, &publishedSections)
	_ = json.Unmarshal(row.DraftBrand, &draftBrand)
	_ = json.Unmarshal(row.DraftSections, &draftSections)
	hasChanges := row.Name != row.DraftName.String || row.PublishedThemeKey != row.DraftThemeKey || !jsonValueEqual(publishedBrand, draftBrand) || !jsonValueEqual(publishedSections, draftSections)
	themes, err := s.storefrontThemeOptions(ctx, ws)
	if err != nil {
		return StorefrontDesignView{}, err
	}
	return StorefrontDesignView{
		Name: row.Name, DraftName: row.DraftName.String, Slug: row.Slug, Link: "https://" + row.Slug + ".rekordly.com",
		Status: row.Status, Version: row.DesignVersion, PublishedThemeKey: row.PublishedThemeKey,
		PublishedBrand: json.RawMessage(row.Brand), PublishedSections: json.RawMessage(row.Sections),
		DraftThemeKey: row.DraftThemeKey, DraftBrand: json.RawMessage(row.DraftBrand), DraftSections: json.RawMessage(row.DraftSections),
		ThemeDrafts:           json.RawMessage(row.ThemeDrafts),
		Contact:               contact,
		AvailableThemes:       themes,
		HasUnpublishedChanges: hasChanges,
	}, nil
}

func (s *Service) storefrontThemeOptions(ctx context.Context, workspaceID int64) ([]StorefrontDesignThemeOption, error) {
	themes := []StorefrontDesignThemeOption{
		{Key: "simple", Name: "Simple", Price: "Free", Purchasable: true, Owned: true},
		{Key: "boutique", Name: "Boutique", Price: "Free", Purchasable: true, Owned: true},
		{Key: "bold", Name: "Bold", Price: "Billing price not configured", Owned: false},
		{Key: "market", Name: "Market", Price: "Billing price not configured", Owned: false},
		{Key: "studio", Name: "Studio", Price: "Billing price not configured", Owned: false},
	}
	for i := range themes {
		if themes[i].Owned {
			continue
		}
		var owned bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM storefront_theme_purchases WHERE workspace_id=$1 AND theme_key=$2)`, workspaceID, themes[i].Key).Scan(&owned); err != nil {
			return nil, err
		}
		themes[i].Owned = owned
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, addon_type, currency, price_minor
		FROM plan_versions
		WHERE is_addon AND addon_type IN ('storefront_theme_bold', 'storefront_theme_market', 'storefront_theme_studio')
		  AND billing_interval='once' AND is_available AND price_minor > 0
		  AND (effective_to IS NULL OR effective_to > now())
		ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	planByTheme := map[string]StorefrontDesignThemeOption{}
	for rows.Next() {
		var id, minor int64
		var addonType, currency string
		if err := rows.Scan(&id, &addonType, &currency, &minor); err != nil {
			return nil, err
		}
		key := strings.TrimPrefix(addonType, "storefront_theme_")
		if _, exists := planByTheme[key]; exists {
			continue
		}
		planByTheme[key] = StorefrontDesignThemeOption{PlanVersionID: id, PriceMinor: fmt.Sprint(minor), Currency: currency, Price: "one-off", Purchasable: true}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range themes {
		if plan, ok := planByTheme[themes[i].Key]; ok {
			themes[i].PlanVersionID = plan.PlanVersionID
			themes[i].PriceMinor = plan.PriceMinor
			themes[i].Currency = plan.Currency
			themes[i].Purchasable = true
			themes[i].Price = plan.Price
		}
	}
	return themes, nil
}

func jsonValueEqual(a, b any) bool {
	left, _ := json.Marshal(a)
	right, _ := json.Marshal(b)
	return bytes.Equal(left, right)
}

func storefrontTextOr(value pgtype.Text, fallback string) string {
	if value.Valid {
		return value.String
	}
	return fallback
}

func storefrontInt4Or(value pgtype.Int4, fallback int32) int32 {
	if value.Valid {
		return value.Int32
	}
	return fallback
}

func storefrontBoolOr(value pgtype.Bool, fallback bool) bool {
	if value.Valid {
		return value.Bool
	}
	return fallback
}

func storefrontMinorOr(value pgtype.Int8) string {
	if value.Valid {
		return fmt.Sprint(value.Int64)
	}
	return "0"
}

func storefrontDesignHash(value any) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

func (s *Service) GetStorefrontDesign(ctx context.Context, ws int64) (StorefrontDesignView, error) {
	return s.storefrontDesignView(ctx, ws)
}

// GetStorefrontDesignPreview builds the public payload shape from the private draft.
func (s *Service) GetStorefrontDesignPreview(ctx context.Context, ws int64) (PublicStorefrontProjection, error) {
	state, err := s.queries.GetStorefrontDesignState(ctx, ws)
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicStorefrontProjection{}, ErrNotFound
	}
	if err != nil {
		return PublicStorefrontProjection{}, err
	}
	sf, err := s.queries.GetStorefrontByID(ctx, db.GetStorefrontByIDParams{WorkspaceID: ws, ID: state.StorefrontID})
	if err != nil {
		return PublicStorefrontProjection{}, err
	}
	st, err := s.queries.GetStorefrontSettings(ctx, db.GetStorefrontSettingsParams{WorkspaceID: ws, StorefrontID: sf.ID})
	if err != nil {
		return PublicStorefrontProjection{}, err
	}
	cols, err := s.queries.ListPublicStorefrontCollections(ctx, sf.ID)
	if err != nil {
		return PublicStorefrontProjection{}, err
	}
	collections := make([]StorefrontCollectionView, 0, len(cols))
	for _, col := range cols {
		collections = append(collections, StorefrontCollectionView{ID: col.ID, Name: col.Name, Slug: string(col.Slug), Description: nullableText(col.Description), ImageURL: nullableText(col.ImageUrl), Position: col.Position, IsVisible: true})
	}
	rows, err := s.queries.ListPublicStorefrontProducts(ctx, db.ListPublicStorefrontProductsParams{StorefrontID: sf.ID, OutletID: sf.DefaultOutletID})
	if err != nil {
		return PublicStorefrontProjection{}, err
	}
	products := make([]PublicProductView, 0, len(rows))
	for _, row := range rows {
		state, visible, _ := computePublicAvailability(row.ProductKind, row.AvailabilityPolicy, row.LowStockThreshold, row.AvailableQuantity)
		if row.ProductKind == "stock_tracked" && row.AvailableQuantity.LessThanOrEqual(decimal.Zero) {
			visible = st.ShowSoldOut
			state = "out_of_stock"
		}
		if !visible {
			continue
		}
		var exact *string
		if row.ProductKind == "stock_tracked" && row.AvailableQuantity.GreaterThan(decimal.Zero) && (st.ShowStockCount || row.AvailableQuantity.LessThanOrEqual(decimal.NewFromInt(int64(st.LowStockThreshold)))) {
			quantity := row.AvailableQuantity.Truncate(2).String()
			exact = &quantity
		}
		if row.ProductKind == "stock_tracked" && row.AvailableQuantity.GreaterThan(decimal.Zero) && row.AvailableQuantity.LessThanOrEqual(decimal.NewFromInt(int64(st.LowStockThreshold))) {
			state = "low_stock"
		}
		var images []string
		_ = json.Unmarshal(row.ImageUrls, &images)
		if images == nil {
			images = []string{}
		}
		title := strings.TrimSpace(row.PublicTitle)
		if title == "" {
			title = "Product"
		}
		price := fmt.Sprint(row.PublicPriceMinor)
		products = append(products, PublicProductView{ID: row.ID, ProductID: row.ProductID, VariantID: row.VariantID, CollectionID: nullableInt8(row.CollectionID), IsFeatured: row.IsFeatured, Title: title, Description: nullableText(row.PublicDescription), SKU: nullableText(row.PublicSku), ImageURLs: images, PriceMinor: price, Currency: row.Currency, CurrencyExponent: row.CurrencyExponent, ProductKind: row.ProductKind, VariantName: row.VariantName, UnitName: row.UnitName, AvailabilityPolicy: row.AvailabilityPolicy, AvailabilityState: state, AvailableQuantity: exact, MaxQtyPerOrder: row.MaxQtyPerOrder, ContactOnly: row.ContactOnly, SeoSlug: nullableText(row.SeoSlug), SeoTitle: nullableText(row.SeoTitle), SeoDescription: nullableText(row.SeoDescription)})
	}
	view := settingsToView(st)
	var brand StorefrontBrand
	if err := json.Unmarshal(state.DraftBrand, &brand); err != nil {
		return PublicStorefrontProjection{}, err
	}
	brand.ResolvedPalette = resolveStorefrontPalette(brand)
	brandJSON, _ := json.Marshal(brand)
	var sections []StorefrontSection
	if err := json.Unmarshal(state.DraftSections, &sections); err != nil {
		return PublicStorefrontProjection{}, err
	}
	if sections == nil {
		sections = []StorefrontSection{}
	}
	return PublicStorefrontProjection{
		Name: state.DraftName.String, Slug: sf.Slug, ThemeKey: state.DraftThemeKey,
		Currency: sf.Currency, CurrencyExponent: sf.CurrencyExponent,
		Tagline: view.Tagline, Description: view.Description, LogoURL: view.LogoURL, BannerURL: view.BannerURL,
		PrimaryColor: view.PrimaryColor, AccentColor: view.AccentColor, BackgroundColor: view.BackgroundColor, TextColor: view.TextColor, FontFamily: view.FontFamily,
		Brand: brandJSON, Sections: sections,
		SectionOrder: view.SectionOrder, ContactPhone: view.ContactPhone, ContactEmail: view.ContactEmail,
		WhatsappNumber: view.WhatsappNumber, Address: view.Address, BusinessHours: view.BusinessHours,
		SocialLinks: view.SocialLinks, DeliveryMethods: view.DeliveryMethods, DeliveryGuidance: view.DeliveryGuidance,
		DefaultDeliveryFeeMinor: view.DefaultDeliveryFeeMinor, CheckoutRequireEmail: view.CheckoutRequireEmail, CheckoutRequirePhone: view.CheckoutRequirePhone,
		ReturnPolicy: view.ReturnPolicy, PrivacyPolicy: view.PrivacyPolicy, TermsPolicy: view.TermsPolicy, CustomPolicy: view.CustomPolicy,
		SeoTitle: view.SeoTitle, SeoDescription: view.SeoDescription, SeoImageURL: view.SeoImageURL, SeoIndexable: view.SeoIndexable,
		AvailabilityAsOf: time.Now().UTC().Format(time.RFC3339), Collections: collections, Products: products,
		internalID: sf.ID, internalWS: ws, internalOutletID: sf.DefaultOutletID, internalSettingsV: st.Version,
	}, nil
}

func (s *Service) checkStorefrontDesignIdempotency(ctx context.Context, ws int64, key, requestHash string) (bool, error) {
	if strings.TrimSpace(key) == "" {
		return false, errors.New("an idempotency key is required")
	}
	old, err := s.queries.GetStorefrontDesignEventByKey(ctx, db.GetStorefrontDesignEventByKeyParams{WorkspaceID: ws, IdempotencyKey: key})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if old.RequestHash != requestHash {
		return false, ErrDuplicateIdempotent
	}
	return true, nil
}

func (s *Service) SaveStorefrontDesignDraft(ctx context.Context, ws, user int64, input StorefrontDesignInput) (StorefrontDesignView, error) {
	input, brandJSON, sectionsJSON, err := validateStorefrontDesign(input)
	if err != nil {
		return StorefrontDesignView{}, err
	}
	requestHash, err := storefrontDesignHash(input)
	if err != nil {
		return StorefrontDesignView{}, err
	}
	if replay, err := s.checkStorefrontDesignIdempotency(ctx, ws, input.IdempotencyKey, requestHash); err != nil {
		return StorefrontDesignView{}, err
	} else if replay {
		return s.storefrontDesignView(ctx, ws)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StorefrontDesignView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	state, err := q.GetStorefrontDesignState(ctx, ws)
	if err != nil {
		return StorefrontDesignView{}, err
	}
	if _, err = q.SaveStorefrontDesignDraft(ctx, db.SaveStorefrontDesignDraftParams{
		WorkspaceID: ws, StorefrontID: state.StorefrontID, DraftThemeKey: input.ThemeKey, DraftName: input.Name,
		DraftBrand: brandJSON, DraftSections: sectionsJSON, ExpectedVersion: input.ExpectedVersion,
	}); errors.Is(err, pgx.ErrNoRows) {
		return StorefrontDesignView{}, ErrStorefrontDesignVersionConflict
	} else if err != nil {
		return StorefrontDesignView{}, err
	}
	version := state.DesignVersion + 1
	if err := q.CreateStorefrontDesignEvent(ctx, db.CreateStorefrontDesignEventParams{WorkspaceID: ws, StorefrontID: state.StorefrontID, ActorUserID: pgtype.Int8{Int64: user, Valid: user > 0}, EventType: "draft_saved", IdempotencyKey: input.IdempotencyKey, RequestHash: requestHash, Version: version}); err != nil {
		return StorefrontDesignView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return StorefrontDesignView{}, err
	}
	return s.storefrontDesignView(ctx, ws)
}

func (s *Service) PublishStorefrontDesign(ctx context.Context, ws, user int64, input StorefrontDesignCommandInput) (StorefrontDesignView, error) {
	requestHash, err := storefrontDesignHash(struct {
		Op      string `json:"op"`
		Version int32  `json:"version"`
	}{"publish", input.ExpectedVersion})
	if err != nil {
		return StorefrontDesignView{}, err
	}
	if replay, err := s.checkStorefrontDesignIdempotency(ctx, ws, input.IdempotencyKey, requestHash); err != nil {
		return StorefrontDesignView{}, err
	} else if replay {
		return s.storefrontDesignView(ctx, ws)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StorefrontDesignView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	state, err := q.GetStorefrontDesignState(ctx, ws)
	if err != nil {
		return StorefrontDesignView{}, err
	}
	if state.DesignVersion != input.ExpectedVersion {
		return StorefrontDesignView{}, ErrStorefrontDesignVersionConflict
	}
	if state.Status == "disabled" || state.Status == "grace" {
		return StorefrontDesignView{}, ErrStorefrontEntitlementLocked
	}
	if state.DraftThemeKey != "simple" && state.DraftThemeKey != "boutique" {
		var owned bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM storefront_theme_purchases WHERE workspace_id=$1 AND theme_key=$2)`, ws, state.DraftThemeKey).Scan(&owned); err != nil {
			return StorefrontDesignView{}, err
		}
		if !owned {
			return StorefrontDesignView{}, ErrStorefrontThemePurchaseRequired
		}
	}
	if _, err := q.PublishStorefrontDesignDraft(ctx, db.PublishStorefrontDesignDraftParams{WorkspaceID: ws, StorefrontID: state.StorefrontID, ExpectedVersion: input.ExpectedVersion}); errors.Is(err, pgx.ErrNoRows) {
		return StorefrontDesignView{}, ErrStorefrontDesignVersionConflict
	} else if err != nil {
		return StorefrontDesignView{}, err
	}
	if _, err := q.PublishStorefrontDesignSettings(ctx, db.PublishStorefrontDesignSettingsParams{WorkspaceID: ws, StorefrontID: state.StorefrontID}); err != nil {
		return StorefrontDesignView{}, err
	}
	if err := q.CreateStorefrontDesignEvent(ctx, db.CreateStorefrontDesignEventParams{WorkspaceID: ws, StorefrontID: state.StorefrontID, ActorUserID: pgtype.Int8{Int64: user, Valid: user > 0}, EventType: "published", IdempotencyKey: input.IdempotencyKey, RequestHash: requestHash, Version: input.ExpectedVersion + 1}); err != nil {
		return StorefrontDesignView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return StorefrontDesignView{}, err
	}
	invalidateStorefrontCache(state.Slug)
	return s.storefrontDesignView(ctx, ws)
}

func (s *Service) DiscardStorefrontDesign(ctx context.Context, ws, user int64, input StorefrontDesignCommandInput) (StorefrontDesignView, error) {
	requestHash, err := storefrontDesignHash(struct {
		Op      string `json:"op"`
		Version int32  `json:"version"`
	}{"discard", input.ExpectedVersion})
	if err != nil {
		return StorefrontDesignView{}, err
	}
	if replay, err := s.checkStorefrontDesignIdempotency(ctx, ws, input.IdempotencyKey, requestHash); err != nil {
		return StorefrontDesignView{}, err
	} else if replay {
		return s.storefrontDesignView(ctx, ws)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StorefrontDesignView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	state, err := q.GetStorefrontDesignState(ctx, ws)
	if err != nil {
		return StorefrontDesignView{}, err
	}
	if state.DesignVersion != input.ExpectedVersion {
		return StorefrontDesignView{}, ErrStorefrontDesignVersionConflict
	}
	version, err := q.DiscardStorefrontDesignDraft(ctx, db.DiscardStorefrontDesignDraftParams{WorkspaceID: ws, StorefrontID: state.StorefrontID, ExpectedVersion: input.ExpectedVersion})
	if err != nil {
		return StorefrontDesignView{}, err
	}
	if err := q.CreateStorefrontDesignEvent(ctx, db.CreateStorefrontDesignEventParams{WorkspaceID: ws, StorefrontID: state.StorefrontID, ActorUserID: pgtype.Int8{Int64: user, Valid: user > 0}, EventType: "discarded", IdempotencyKey: input.IdempotencyKey, RequestHash: requestHash, Version: version}); err != nil {
		return StorefrontDesignView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return StorefrontDesignView{}, err
	}
	invalidateStorefrontCache(state.Slug)
	return s.storefrontDesignView(ctx, ws)
}
