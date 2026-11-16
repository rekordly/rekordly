package finance

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

// ---------------- Products v2 ----------------
//
// A product is the catalogue record plus its default variant. v2 adds public
// store copy, images, cost and compare-at prices, outlets, collections,
// price history and an event trail. Money stays in minor units and is returned
// as strings.

var ErrProductNotFound = errors.New("product not found")

type ProductSummary struct {
	ID                  int64      `json:"id"`
	Name                string     `json:"name"`
	Description         *string    `json:"description,omitempty"`
	Kind                string     `json:"kind"`
	Status              string     `json:"status"`
	UnitName            string     `json:"unit_name"`
	ShortDescription    *string    `json:"short_description,omitempty"`
	LongDescription     *string    `json:"long_description,omitempty"`
	ImageURLs           []string   `json:"image_urls"`
	DefaultVariantID    int64      `json:"default_variant_id"`
	SKU                 *string    `json:"sku,omitempty"`
	Barcode             *string    `json:"barcode,omitempty"`
	SellingPriceMinor   int64      `json:"selling_price_minor,string"`
	CostPriceMinor      int64      `json:"cost_price_minor,string"`
	CompareAtPriceMinor *int64     `json:"compare_at_price_minor,string,omitempty"`
	Currency            string     `json:"currency"`
	CurrencyExponent    int32      `json:"currency_exponent"`
	QuantityOnHand      string     `json:"quantity_on_hand"`
	VariantCount        int64      `json:"variant_count"`
	ArchivedAt          *time.Time `json:"archived_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type ProductStockLine struct {
	LocationID       int64  `json:"location_id"`
	LocationName     string `json:"location_name"`
	QuantityOnHand   string `json:"quantity_on_hand"`
	ValueOnHandMinor int64  `json:"value_on_hand_minor,string"`
}

type ProductDetail struct {
	Product       ProductSummary      `json:"product"`
	Options       []ProductOptionView `json:"options"`
	Variants      []VariantView       `json:"variants"`
	VariantStock  []VariantStockLine  `json:"variant_stock"`
	OutletIDs     []int64             `json:"outlet_ids"`
	CollectionIDs []int64             `json:"collection_ids"`
	Stock         []ProductStockLine  `json:"stock"`
}

type VariantStockLine struct {
	VariantID      int64  `json:"variant_id"`
	LocationID     int64  `json:"location_id"`
	LocationName   string `json:"location_name"`
	QuantityOnHand string `json:"quantity_on_hand"`
}

// SaveProductInput is shared by create, edit and import.
type SaveProductInput struct {
	Name             string   `json:"name"`
	Description      string   `json:"description"`
	Kind             string   `json:"kind"`
	Status           string   `json:"status"`
	UnitName         string   `json:"unit_name"`
	ShortDescription string   `json:"short_description"`
	LongDescription  string   `json:"long_description"`
	ImageURLs        []string `json:"image_urls"`
	SKU              string   `json:"sku"`
	Barcode          string   `json:"barcode"`
	SellingPrice     string   `json:"selling_price"`
	CostPrice        string   `json:"cost_price"`
	CompareAtPrice   string   `json:"compare_at_price"`
	Currency         string   `json:"currency"`
	OutletIDs        []int64  `json:"outlet_ids"`
	CollectionIDs    []int64  `json:"collection_ids"`
	// OpeningStock is only used when creating a stock-tracked product.
	OpeningStock   string `json:"opening_stock"`
	IdempotencyKey string `json:"idempotency_key"`
}

type ListProductsFilter struct {
	Search       string `form:"search"`
	Status       string `form:"status"`
	Kind         string `form:"kind"`
	CollectionID int64  `form:"collection_id"`
	BeforeID     int64  `form:"before_id"`
	Limit        int32  `form:"limit"`
}

type ProductCollection struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	Description  *string `json:"description,omitempty"`
	ProductCount int64   `json:"product_count"`
}

type ProductPriceChange struct {
	ID                   int64     `json:"id"`
	VariantID            int64     `json:"variant_id"`
	OldSellingPriceMinor *int64    `json:"old_selling_price_minor,string,omitempty"`
	NewSellingPriceMinor int64     `json:"new_selling_price_minor,string"`
	OldCostPriceMinor    *int64    `json:"old_cost_price_minor,string,omitempty"`
	NewCostPriceMinor    int64     `json:"new_cost_price_minor,string"`
	Currency             string    `json:"currency"`
	CurrencyExponent     int32     `json:"currency_exponent"`
	ChangedAt            time.Time `json:"changed_at"`
}

type ProductEvent struct {
	ID        int64     `json:"id"`
	EventType string    `json:"event_type"`
	Summary   string    `json:"summary"`
	CreatedAt time.Time `json:"created_at"`
}

type ProductImportError struct {
	Row     int    `json:"row"`
	Name    string `json:"name"`
	Message string `json:"message"`
}

type ProductImportBatch struct {
	ID           int64                `json:"id"`
	FileName     string               `json:"file_name"`
	TotalRows    int32                `json:"total_rows"`
	CreatedCount int32                `json:"created_count"`
	FailedCount  int32                `json:"failed_count"`
	Errors       []ProductImportError `json:"errors"`
	CreatedAt    time.Time            `json:"created_at"`
}

type ImportProductsInput struct {
	FileName string             `json:"file_name"`
	Currency string             `json:"currency"`
	Rows     []SaveProductInput `json:"rows"`
}

// ---------------- helpers ----------------

type validProduct struct {
	name, kind, status, unit, currency           string
	exponent                                     int
	price, cost                                  int64
	compareAt                                    pgtype.Int8
	description, shortDesc, longDesc, sku, barcd pgtype.Text
	images                                       []byte
	imageList                                    []string
}

func validateProduct(in SaveProductInput, defaultCurrency string) (validProduct, error) {
	var out validProduct
	out.name = strings.TrimSpace(in.Name)
	if out.name == "" || len([]rune(out.name)) > 200 {
		return out, errors.New("product name must be between 1 and 200 characters")
	}
	out.kind = strings.ToLower(strings.TrimSpace(in.Kind))
	switch out.kind {
	case "service", "non_stock", "stock_tracked":
	default:
		return out, errors.New("choose what you are selling: a service, a product, or a product with stock tracking")
	}
	out.status = strings.ToLower(strings.TrimSpace(in.Status))
	if out.status == "" {
		out.status = "active"
	}
	if out.status != "active" && out.status != "draft" {
		return out, errors.New("status must be active or draft")
	}
	out.unit = strings.TrimSpace(in.UnitName)
	if out.unit == "" {
		out.unit = "each"
	}
	if len(out.unit) > 40 {
		return out, errors.New("unit must be at most 40 characters")
	}
	out.currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	if out.currency == "" {
		out.currency = defaultCurrency
	}
	if len(out.currency) != 3 {
		return out, ErrInvalidCurrency
	}
	out.exponent = CurrencyExponent(out.currency)
	var err error
	if out.price, err = ParseMajorToMinor(in.SellingPrice, out.exponent); err != nil {
		return out, errors.New("selling price must be a number, like 15000")
	}
	if strings.TrimSpace(in.CostPrice) != "" {
		if out.cost, err = ParseMajorToMinor(in.CostPrice, out.exponent); err != nil {
			return out, errors.New("cost price must be a number, like 9000")
		}
	}
	if strings.TrimSpace(in.CompareAtPrice) != "" {
		compare, err := ParseMajorToMinor(in.CompareAtPrice, out.exponent)
		if err != nil {
			return out, errors.New("compare-at price must be a number, like 18000")
		}
		if compare > 0 && compare <= out.price {
			return out, errors.New("compare-at price should be higher than the selling price")
		}
		if compare > 0 {
			out.compareAt = pgtype.Int8{Int64: compare, Valid: true}
		}
	}
	short := strings.TrimSpace(in.ShortDescription)
	if len([]rune(short)) > 300 {
		return out, errors.New("short description must be at most 300 characters")
	}
	long := strings.TrimSpace(in.LongDescription)
	// Formatted text comes from the editor as HTML; keep only its safe tags.
	// Plain text (e.g. from an import) stays as it is and is shown as text.
	if strings.Contains(long, "<") {
		long = SanitizeRichText(long)
	}
	if len(long) > maxRichTextBytes {
		return out, errors.New("long description is too long")
	}
	out.description = optionalPgText(in.Description)
	out.shortDesc = optionalPgText(short)
	out.longDesc = optionalPgText(long)
	sku := strings.ToUpper(strings.TrimSpace(in.SKU))
	if len(sku) > 60 {
		return out, errors.New("SKU must be at most 60 characters")
	}
	out.sku = optionalPgText(sku)
	out.barcd = optionalPgText(in.Barcode)
	out.imageList = make([]string, 0, len(in.ImageURLs))
	for _, url := range in.ImageURLs {
		url = strings.TrimSpace(url)
		if url == "" {
			continue
		}
		if !strings.HasPrefix(url, "https://") || len(url) > 1000 {
			return out, errors.New("product images must be secure https links")
		}
		out.imageList = append(out.imageList, url)
	}
	if len(out.imageList) > 8 {
		return out, errors.New("a product can have up to 8 images")
	}
	out.images, _ = json.Marshal(out.imageList)
	return out, nil
}

// skuPrefix turns "Logo design pack" into "LOGDES".
func skuPrefix(name string) string {
	var parts []string
	for _, word := range strings.Fields(name) {
		var letters []rune
		for _, r := range strings.ToUpper(word) {
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				letters = append(letters, r)
			}
			if len(letters) == 3 {
				break
			}
		}
		if len(letters) > 0 {
			parts = append(parts, string(letters))
		}
		if len(parts) == 2 {
			break
		}
	}
	if len(parts) == 0 {
		return "ITEM"
	}
	return strings.Join(parts, "")
}

// generateSKU makes a unique, readable SKU such as LOGDES-0042.
func generateSKU(ctx context.Context, q *db.Queries, workspaceID, productID int64, name string, exceptVariant pgtype.Int8) (string, error) {
	base := fmt.Sprintf("%s-%04d", skuPrefix(name), productID)
	candidate := base
	for i := 2; i < 50; i++ {
		used, err := q.SkuInUse(ctx, db.SkuInUseParams{WorkspaceID: workspaceID, Sku: candidate, ExceptVariantID: exceptVariant})
		if err != nil {
			return "", err
		}
		if !used {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
	return "", errors.New("could not generate a unique SKU")
}

func int64Ptr(v pgtype.Int8) *int64 {
	if !v.Valid {
		return nil
	}
	return &v.Int64
}

func timePtr(v pgtype.Timestamptz) *time.Time {
	if !v.Valid {
		return nil
	}
	return &v.Time
}

func decodeImages(raw []byte) []string {
	images := []string{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &images)
	}
	return images
}

func productSummaryFromRow(row db.ListProductsV2Row) ProductSummary {
	return ProductSummary{
		ID: row.ID, Name: row.Name, Description: nullableText(row.Description), Kind: row.Kind, Status: row.Status,
		UnitName: row.UnitName, ShortDescription: nullableText(row.ShortDescription), LongDescription: nullableText(row.LongDescription),
		ImageURLs: decodeImages(row.ImageUrls), DefaultVariantID: row.DefaultVariantID, SKU: nullableText(row.Sku),
		Barcode: nullableText(row.Barcode), SellingPriceMinor: row.SellingPriceMinor, CostPriceMinor: row.CostPriceMinor,
		CompareAtPriceMinor: int64Ptr(row.CompareAtPriceMinor), Currency: row.Currency, CurrencyExponent: row.CurrencyExponent,
		QuantityOnHand: row.QuantityOnHand.String(), VariantCount: row.VariantCount, ArchivedAt: timePtr(row.ArchivedAt),
		CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time,
	}
}

func (s *Service) productEvent(ctx context.Context, q *db.Queries, workspaceID, productID, userID int64, eventType, summary string) error {
	if len(summary) > 300 {
		summary = summary[:297] + "..."
	}
	return q.InsertProductEvent(ctx, db.InsertProductEventParams{
		WorkspaceID: workspaceID, ProductID: productID, EventType: eventType, Summary: summary,
		ActorUserID: pgtype.Int8{Int64: userID, Valid: userID > 0},
	})
}

func setProductLinks(ctx context.Context, q *db.Queries, workspaceID, productID int64, outletIDs, collectionIDs []int64) error {
	if err := q.DeleteProductOutlets(ctx, db.DeleteProductOutletsParams{WorkspaceID: workspaceID, ProductID: productID}); err != nil {
		return err
	}
	for _, id := range outletIDs {
		if err := q.AddProductOutlet(ctx, db.AddProductOutletParams{WorkspaceID: workspaceID, ProductID: productID, LocationID: id}); err != nil {
			return err
		}
	}
	if err := q.DeleteProductCollectionItems(ctx, db.DeleteProductCollectionItemsParams{WorkspaceID: workspaceID, ProductID: productID}); err != nil {
		return err
	}
	for _, id := range collectionIDs {
		if err := q.AddProductCollectionItem(ctx, db.AddProductCollectionItemParams{WorkspaceID: workspaceID, CollectionID: id, ProductID: productID}); err != nil {
			return err
		}
	}
	return nil
}

// ---------------- read ----------------

func (s *Service) ListProducts(ctx context.Context, workspaceID int64, filter ListProductsFilter) ([]ProductSummary, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	params := db.ListProductsV2Params{WorkspaceID: workspaceID, RowLimit: limit, Search: searchParam(filter.Search)}
	if status := strings.TrimSpace(filter.Status); status != "" {
		params.Status = pgtype.Text{String: status, Valid: true}
	}
	if kind := strings.TrimSpace(filter.Kind); kind != "" {
		params.Kind = pgtype.Text{String: kind, Valid: true}
	}
	if filter.CollectionID > 0 {
		params.CollectionID = pgtype.Int8{Int64: filter.CollectionID, Valid: true}
	}
	if filter.BeforeID > 0 {
		params.BeforeID = pgtype.Int8{Int64: filter.BeforeID, Valid: true}
	}
	rows, err := s.queries.ListProductsV2(ctx, params)
	if err != nil {
		return nil, err
	}
	out := make([]ProductSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, productSummaryFromRow(row))
	}
	return out, nil
}

func (s *Service) productSummary(ctx context.Context, q *db.Queries, workspaceID, productID int64) (ProductSummary, error) {
	product, err := q.GetProductByID(ctx, db.GetProductByIDParams{ID: productID, WorkspaceID: workspaceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return ProductSummary{}, ErrProductNotFound
	}
	if err != nil {
		return ProductSummary{}, err
	}
	rows, err := q.ListProductsV2(ctx, db.ListProductsV2Params{
		WorkspaceID: workspaceID, RowLimit: 1, BeforeID: pgtype.Int8{Int64: product.ID + 1, Valid: true},
	})
	if err != nil {
		return ProductSummary{}, err
	}
	for _, row := range rows {
		if row.ID == product.ID {
			return productSummaryFromRow(row), nil
		}
	}
	return ProductSummary{}, ErrProductNotFound
}

func (s *Service) GetProduct(ctx context.Context, workspaceID, productID int64) (ProductDetail, error) {
	summary, err := s.productSummary(ctx, s.queries, workspaceID, productID)
	if err != nil {
		return ProductDetail{}, err
	}
	outlets, err := s.queries.ListProductOutletIDs(ctx, db.ListProductOutletIDsParams{WorkspaceID: workspaceID, ProductID: productID})
	if err != nil {
		return ProductDetail{}, err
	}
	collections, err := s.queries.ListProductCollectionIDs(ctx, db.ListProductCollectionIDsParams{WorkspaceID: workspaceID, ProductID: productID})
	if err != nil {
		return ProductDetail{}, err
	}
	stockRows, err := s.queries.ListProductStockByOutlet(ctx, db.ListProductStockByOutletParams{WorkspaceID: workspaceID, ProductID: productID})
	if err != nil {
		return ProductDetail{}, err
	}
	stock := make([]ProductStockLine, 0, len(stockRows))
	for _, row := range stockRows {
		stock = append(stock, ProductStockLine{LocationID: row.LocationID, LocationName: row.LocationName, QuantityOnHand: row.QuantityOnHand.String(), ValueOnHandMinor: row.ValueOnHandMinor})
	}
	if outlets == nil {
		outlets = []int64{}
	}
	if collections == nil {
		collections = []int64{}
	}
	options, err := s.ListProductOptions(ctx, workspaceID, productID)
	if err != nil {
		return ProductDetail{}, err
	}
	variants, err := s.ListProductVariants(ctx, workspaceID, productID)
	if err != nil {
		return ProductDetail{}, err
	}
	variantRows, err := s.queries.ListVariantStockByProduct(ctx, db.ListVariantStockByProductParams{WorkspaceID: workspaceID, ProductID: productID})
	if err != nil {
		return ProductDetail{}, err
	}
	variantStock := make([]VariantStockLine, 0, len(variantRows))
	for _, row := range variantRows {
		variantStock = append(variantStock, VariantStockLine{VariantID: row.VariantID, LocationID: row.LocationID, LocationName: row.LocationName, QuantityOnHand: row.QuantityOnHand.String()})
	}
	if len(options) > 0 {
		filtered := make([]ProductOptionView, 0, len(options))
		for _, option := range options {
			values := make([]string, 0, len(option.Values))
			details := make([]ProductOptionValueView, 0, len(option.ValueDetails))
			for _, value := range option.ValueDetails {
				for _, variant := range variants {
					if !variant.IsDefault && variant.ArchivedAt == nil && variant.OptionValues[option.Name] == value.Value {
						values = append(values, value.Value)
						details = append(details, value)
						break
					}
				}
			}
			if len(details) > 0 {
				option.Values, option.ValueDetails = values, details
				filtered = append(filtered, option)
			}
		}
		options = filtered
	}
	return ProductDetail{Product: summary, Options: options, Variants: variants, VariantStock: variantStock, OutletIDs: outlets, CollectionIDs: collections, Stock: stock}, nil
}

// ---------------- create ----------------

func (s *Service) CreateProductV2(ctx context.Context, workspaceID, userID int64, in SaveProductInput) (ProductDetail, error) {
	v, err := validateProduct(in, in.Currency)
	if err != nil {
		return ProductDetail{}, err
	}
	key := strings.TrimSpace(in.IdempotencyKey)
	if key == "" || len(key) > 200 {
		return ProductDetail{}, errors.New("an idempotency key is required")
	}
	if existing, err := s.queries.GetProductByIdempotency(ctx, db.GetProductByIdempotencyParams{WorkspaceID: workspaceID, IdempotencyKey: key}); err == nil {
		return s.GetProduct(ctx, workspaceID, existing.ID)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return ProductDetail{}, err
	}
	opening := strings.TrimSpace(in.OpeningStock)
	if opening != "" && opening != "0" && v.kind != "stock_tracked" {
		opening = ""
	}
	if opening != "" && opening != "0" && v.cost <= 0 {
		return ProductDetail{}, errors.New("add a cost price so the opening stock can be valued")
	}
	if v.sku.Valid {
		used, err := s.queries.SkuInUse(ctx, db.SkuInUseParams{WorkspaceID: workspaceID, Sku: v.sku.String})
		if err != nil {
			return ProductDetail{}, err
		}
		if used {
			return ProductDetail{}, fmt.Errorf("SKU %s is already used by another product", v.sku.String)
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ProductDetail{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	product, err := qtx.CreateProduct(ctx, db.CreateProductParams{
		WorkspaceID: workspaceID, Name: v.name, Description: v.description, Kind: v.kind, Status: v.status,
		UnitName: v.unit, IdempotencyKey: key, CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return ProductDetail{}, fmt.Errorf("create product: %w", err)
	}
	if _, err := qtx.UpdateProductV2(ctx, db.UpdateProductV2Params{
		Name: v.name, Description: v.description, Kind: v.kind, Status: v.status, UnitName: v.unit,
		ShortDescription: v.shortDesc, LongDescription: v.longDesc, ImageUrls: v.images,
		WorkspaceID: workspaceID, ID: product.ID,
	}); err != nil {
		return ProductDetail{}, fmt.Errorf("save product details: %w", err)
	}
	sku := v.sku
	if !sku.Valid {
		generated, err := generateSKU(ctx, qtx, workspaceID, product.ID, v.name, pgtype.Int8{})
		if err != nil {
			return ProductDetail{}, err
		}
		sku = pgtype.Text{String: generated, Valid: true}
	}
	variant, err := qtx.CreateVariant(ctx, db.CreateVariantParams{
		WorkspaceID: workspaceID, ProductID: product.ID, Name: "Default", Sku: sku, Barcode: v.barcd,
		SellingPriceMinor: v.price, CostPriceMinor: v.cost, Currency: v.currency, CurrencyExponent: int32(v.exponent),
		IsDefault: true, IsActive: true,
	})
	if err != nil {
		return ProductDetail{}, fmt.Errorf("create product variant: %w", err)
	}
	if v.compareAt.Valid {
		if _, err := qtx.UpdateDefaultVariantV2(ctx, db.UpdateDefaultVariantV2Params{
			Sku: variant.Sku, Barcode: variant.Barcode, SellingPriceMinor: v.price, CostPriceMinor: v.cost,
			CompareAtPriceMinor: v.compareAt, WorkspaceID: workspaceID, ID: variant.ID,
		}); err != nil {
			return ProductDetail{}, err
		}
	}
	if err := setProductLinks(ctx, qtx, workspaceID, product.ID, in.OutletIDs, in.CollectionIDs); err != nil {
		return ProductDetail{}, err
	}
	if err := qtx.InsertProductPriceHistory(ctx, db.InsertProductPriceHistoryParams{
		WorkspaceID: workspaceID, ProductID: product.ID, VariantID: variant.ID, NewSellingPriceMinor: v.price,
		NewCostPriceMinor: v.cost, Currency: v.currency, CurrencyExponent: int32(v.exponent),
		ChangedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	}); err != nil {
		return ProductDetail{}, err
	}
	if err := s.productEvent(ctx, qtx, workspaceID, product.ID, userID, "created", fmt.Sprintf("Created %s", v.name)); err != nil {
		return ProductDetail{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ProductDetail{}, fmt.Errorf("commit product: %w", err)
	}

	if opening != "" && opening != "0" {
		var location int64
		if len(in.OutletIDs) > 0 {
			location = in.OutletIDs[0]
		}
		if _, err := s.CreateOpeningStock(ctx, workspaceID, userID, CreateOpeningStockInput{
			ProductID: product.ID, LocationID: location, Quantity: opening,
			UnitCost: minorToMajorString(v.cost, v.exponent), Currency: v.currency,
			EffectiveOn: time.Now().UTC().Format("2006-01-02"), Reason: "Opening stock when the product was added",
			IdempotencyKey: key + ":opening",
		}); err != nil {
			return ProductDetail{}, fmt.Errorf("product saved, but opening stock failed: %w", err)
		}
		_ = s.productEvent(ctx, s.queries, workspaceID, product.ID, userID, "stock_opened", fmt.Sprintf("Opening stock of %s %s", opening, v.unit))
	}
	return s.GetProduct(ctx, workspaceID, product.ID)
}

// minorToMajorString formats 250050 (exponent 2) as "2500.50".
func minorToMajorString(minor int64, exponent int) string {
	if exponent <= 0 {
		return fmt.Sprintf("%d", minor)
	}
	base := int64(1)
	for i := 0; i < exponent; i++ {
		base *= 10
	}
	return fmt.Sprintf("%d.%0*d", minor/base, exponent, minor%base)
}

// moneyLabel formats 1500000 (NGN, exponent 2) as "NGN 15,000.00" for history lines.
func moneyLabel(currency string, minor int64, exponent int) string {
	plain := minorToMajorString(minor, exponent)
	whole, frac, _ := strings.Cut(plain, ".")
	var grouped strings.Builder
	for i, r := range whole {
		if i > 0 && (len(whole)-i)%3 == 0 {
			grouped.WriteByte(',')
		}
		grouped.WriteRune(r)
	}
	out := grouped.String()
	if frac != "" {
		out += "." + frac
	}
	return strings.TrimSpace(currency + " " + out)
}

// ---------------- update / archive ----------------

func (s *Service) UpdateProductV2(ctx context.Context, workspaceID, userID, productID int64, in SaveProductInput) (ProductDetail, error) {
	current, err := s.productSummary(ctx, s.queries, workspaceID, productID)
	if err != nil {
		return ProductDetail{}, err
	}
	if in.Currency == "" {
		in.Currency = current.Currency
	}
	// Archive and restore have their own commands; editing never changes that.
	if in.Status == "" || current.Status == "archived" {
		in.Status = "active"
		if current.Status == "draft" {
			in.Status = "draft"
		}
	}
	v, err := validateProduct(in, current.Currency)
	if err != nil {
		return ProductDetail{}, err
	}
	if current.Status == "archived" {
		v.status = "archived"
	}
	if v.currency != current.Currency {
		return ProductDetail{}, errors.New("a product's currency cannot be changed")
	}
	sku := v.sku
	if !sku.Valid {
		sku = optionalPgText(derefString(current.SKU))
	}
	if sku.Valid {
		used, err := s.queries.SkuInUse(ctx, db.SkuInUseParams{WorkspaceID: workspaceID, Sku: sku.String, ExceptVariantID: pgtype.Int8{Int64: current.DefaultVariantID, Valid: true}})
		if err != nil {
			return ProductDetail{}, err
		}
		if used {
			return ProductDetail{}, fmt.Errorf("SKU %s is already used by another product", sku.String)
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ProductDetail{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	archivedAt := pgtype.Timestamptz{}
	if current.ArchivedAt != nil {
		archivedAt = pgtype.Timestamptz{Time: *current.ArchivedAt, Valid: true}
	}
	if _, err := qtx.UpdateProductV2(ctx, db.UpdateProductV2Params{
		Name: v.name, Description: v.description, Kind: v.kind, Status: v.status, UnitName: v.unit,
		ShortDescription: v.shortDesc, LongDescription: v.longDesc, ImageUrls: v.images, ArchivedAt: archivedAt,
		WorkspaceID: workspaceID, ID: productID,
	}); err != nil {
		return ProductDetail{}, fmt.Errorf("update product: %w", err)
	}
	if _, err := qtx.UpdateDefaultVariantV2(ctx, db.UpdateDefaultVariantV2Params{
		Sku: sku, Barcode: v.barcd, SellingPriceMinor: v.price, CostPriceMinor: v.cost, CompareAtPriceMinor: v.compareAt,
		WorkspaceID: workspaceID, ID: current.DefaultVariantID,
	}); err != nil {
		return ProductDetail{}, fmt.Errorf("update product pricing: %w", err)
	}
	if in.OutletIDs != nil || in.CollectionIDs != nil {
		if err := setProductLinks(ctx, qtx, workspaceID, productID, in.OutletIDs, in.CollectionIDs); err != nil {
			return ProductDetail{}, err
		}
	}

	if v.price != current.SellingPriceMinor || v.cost != current.CostPriceMinor {
		oldPrice, oldCost := current.SellingPriceMinor, current.CostPriceMinor
		if err := qtx.InsertProductPriceHistory(ctx, db.InsertProductPriceHistoryParams{
			WorkspaceID: workspaceID, ProductID: productID, VariantID: current.DefaultVariantID,
			OldSellingPriceMinor: pgtype.Int8{Int64: oldPrice, Valid: true}, NewSellingPriceMinor: v.price,
			OldCostPriceMinor: pgtype.Int8{Int64: oldCost, Valid: true}, NewCostPriceMinor: v.cost,
			Currency: current.Currency, CurrencyExponent: current.CurrencyExponent,
			ChangedByUserID: pgtype.Int8{Int64: userID, Valid: true},
		}); err != nil {
			return ProductDetail{}, err
		}
		if v.price != oldPrice {
			summary := fmt.Sprintf("Price changed from %s to %s", moneyLabel(v.currency, oldPrice, v.exponent), moneyLabel(v.currency, v.price, v.exponent))
			if err := s.productEvent(ctx, qtx, workspaceID, productID, userID, "price_changed", summary); err != nil {
				return ProductDetail{}, err
			}
		}
	}
	if changes := describeProductChanges(current, v); changes != "" {
		if err := s.productEvent(ctx, qtx, workspaceID, productID, userID, "updated", changes); err != nil {
			return ProductDetail{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return ProductDetail{}, fmt.Errorf("commit product: %w", err)
	}
	return s.GetProduct(ctx, workspaceID, productID)
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// describeProductChanges lists what changed, in plain words, for the history.
func describeProductChanges(current ProductSummary, next validProduct) string {
	var changed []string
	if current.Name != next.name {
		changed = append(changed, "name")
	}
	if current.Kind != next.kind {
		changed = append(changed, "type")
	}
	if current.Status != next.status {
		changed = append(changed, "status")
	}
	if current.UnitName != next.unit {
		changed = append(changed, "unit")
	}
	if current.CostPriceMinor != next.cost {
		changed = append(changed, "cost price")
	}
	if derefString(current.ShortDescription) != next.shortDesc.String || derefString(current.LongDescription) != next.longDesc.String {
		changed = append(changed, "description")
	}
	if strings.Join(current.ImageURLs, "|") != strings.Join(next.imageList, "|") {
		changed = append(changed, "images")
	}
	if derefString(current.Barcode) != next.barcd.String {
		changed = append(changed, "barcode")
	}
	if len(changed) == 0 {
		return ""
	}
	return "Updated " + strings.Join(changed, ", ")
}

func (s *Service) SetProductArchived(ctx context.Context, workspaceID, userID, productID int64, archived bool) (ProductDetail, error) {
	current, err := s.productSummary(ctx, s.queries, workspaceID, productID)
	if err != nil {
		return ProductDetail{}, err
	}
	product, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{ID: productID, WorkspaceID: workspaceID})
	if err != nil {
		return ProductDetail{}, err
	}
	status, archivedAt, event, summary := "active", pgtype.Timestamptz{}, "restored", "Restored from the archive"
	if archived {
		status, archivedAt, event, summary = "archived", pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}, "archived", "Archived"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ProductDetail{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)
	if _, err := qtx.UpdateProductV2(ctx, db.UpdateProductV2Params{
		Name: product.Name, Description: product.Description, Kind: product.Kind, Status: status, UnitName: product.UnitName,
		ShortDescription: optionalPgText(derefString(current.ShortDescription)), LongDescription: optionalPgText(derefString(current.LongDescription)),
		ImageUrls: mustJSON(current.ImageURLs), ArchivedAt: archivedAt, WorkspaceID: workspaceID, ID: productID,
	}); err != nil {
		return ProductDetail{}, err
	}
	if err := s.productEvent(ctx, qtx, workspaceID, productID, userID, event, summary); err != nil {
		return ProductDetail{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ProductDetail{}, err
	}
	return s.GetProduct(ctx, workspaceID, productID)
}

func mustJSON(value any) []byte {
	raw, err := json.Marshal(value)
	if err != nil {
		return []byte("[]")
	}
	return raw
}

// ---------------- history ----------------

func (s *Service) ListProductPriceHistory(ctx context.Context, workspaceID, productID int64) ([]ProductPriceChange, error) {
	if _, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{ID: productID, WorkspaceID: workspaceID}); err != nil {
		return nil, ErrProductNotFound
	}
	rows, err := s.queries.ListProductPriceHistory(ctx, db.ListProductPriceHistoryParams{WorkspaceID: workspaceID, ProductID: productID})
	if err != nil {
		return nil, err
	}
	out := make([]ProductPriceChange, 0, len(rows))
	for _, row := range rows {
		out = append(out, ProductPriceChange{
			ID: row.ID, VariantID: row.VariantID, OldSellingPriceMinor: int64Ptr(row.OldSellingPriceMinor),
			NewSellingPriceMinor: row.NewSellingPriceMinor, OldCostPriceMinor: int64Ptr(row.OldCostPriceMinor),
			NewCostPriceMinor: row.NewCostPriceMinor, Currency: row.Currency, CurrencyExponent: row.CurrencyExponent,
			ChangedAt: row.ChangedAt.Time,
		})
	}
	return out, nil
}

func (s *Service) ListProductEvents(ctx context.Context, workspaceID, productID int64) ([]ProductEvent, error) {
	if _, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{ID: productID, WorkspaceID: workspaceID}); err != nil {
		return nil, ErrProductNotFound
	}
	rows, err := s.queries.ListProductEvents(ctx, db.ListProductEventsParams{WorkspaceID: workspaceID, ProductID: productID})
	if err != nil {
		return nil, err
	}
	out := make([]ProductEvent, 0, len(rows))
	for _, row := range rows {
		out = append(out, ProductEvent{ID: row.ID, EventType: row.EventType, Summary: row.Summary, CreatedAt: row.CreatedAt.Time})
	}
	return out, nil
}

// ---------------- collections ----------------

func (s *Service) ListProductCollections(ctx context.Context, workspaceID int64) ([]ProductCollection, error) {
	rows, err := s.queries.ListProductCollectionsV2(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	out := make([]ProductCollection, 0, len(rows))
	for _, row := range rows {
		out = append(out, ProductCollection{ID: row.ID, Name: row.Name, Description: nullableText(row.Description), ProductCount: row.ProductCount})
	}
	return out, nil
}

type SaveCollectionInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func validCollection(in SaveCollectionInput) (string, pgtype.Text, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" || len([]rune(name)) > 80 {
		return "", pgtype.Text{}, errors.New("collection name must be between 1 and 80 characters")
	}
	desc := strings.TrimSpace(in.Description)
	if len([]rune(desc)) > 500 {
		return "", pgtype.Text{}, errors.New("collection description must be at most 500 characters")
	}
	return name, optionalPgText(desc), nil
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE 23505")
}

func (s *Service) CreateProductCollection(ctx context.Context, workspaceID int64, in SaveCollectionInput) (ProductCollection, error) {
	name, desc, err := validCollection(in)
	if err != nil {
		return ProductCollection{}, err
	}
	row, err := s.queries.CreateProductCollection(ctx, db.CreateProductCollectionParams{WorkspaceID: workspaceID, Name: name, Description: desc})
	if isUniqueViolation(err) {
		return ProductCollection{}, fmt.Errorf("you already have a collection called %s", name)
	}
	if err != nil {
		return ProductCollection{}, err
	}
	return ProductCollection{ID: row.ID, Name: row.Name, Description: nullableText(row.Description)}, nil
}

func (s *Service) UpdateProductCollection(ctx context.Context, workspaceID, id int64, in SaveCollectionInput) (ProductCollection, error) {
	name, desc, err := validCollection(in)
	if err != nil {
		return ProductCollection{}, err
	}
	row, err := s.queries.UpdateProductCollection(ctx, db.UpdateProductCollectionParams{Name: name, Description: desc, WorkspaceID: workspaceID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return ProductCollection{}, errors.New("collection not found")
	}
	if isUniqueViolation(err) {
		return ProductCollection{}, fmt.Errorf("you already have a collection called %s", name)
	}
	if err != nil {
		return ProductCollection{}, err
	}
	return ProductCollection{ID: row.ID, Name: row.Name, Description: nullableText(row.Description)}, nil
}

func (s *Service) DeleteProductCollection(ctx context.Context, workspaceID, id int64) error {
	affected, err := s.queries.DeleteProductCollection(ctx, db.DeleteProductCollectionParams{WorkspaceID: workspaceID, ID: id})
	if err != nil {
		return err
	}
	if affected == 0 {
		return errors.New("collection not found")
	}
	return nil
}

// ---------------- import ----------------

const maxProductImportRows = 500

func (s *Service) ImportProducts(ctx context.Context, workspaceID, userID int64, in ImportProductsInput) (ProductImportBatch, error) {
	fileName := strings.TrimSpace(in.FileName)
	if fileName == "" {
		fileName = "products.csv"
	}
	if len(fileName) > 200 {
		fileName = fileName[:200]
	}
	if len(in.Rows) == 0 {
		return ProductImportBatch{}, errors.New("the file has no products")
	}
	if len(in.Rows) > maxProductImportRows {
		return ProductImportBatch{}, fmt.Errorf("import up to %d products at a time", maxProductImportRows)
	}
	// A stable key per file and row, so retrying the same import does not duplicate products.
	digest := sha256.New()
	_, _ = digest.Write([]byte(fileName))
	for _, row := range in.Rows {
		_, _ = digest.Write([]byte(row.Name + "|" + row.SKU + "|" + row.SellingPrice + "\n"))
	}
	fileKey := hex.EncodeToString(digest.Sum(nil))[:24]

	var created int32
	failures := []ProductImportError{}
	for index, row := range in.Rows {
		if row.Currency == "" {
			row.Currency = in.Currency
		}
		if row.Kind == "" {
			row.Kind = "non_stock"
		}
		row.IdempotencyKey = fmt.Sprintf("import:%s:%d", fileKey, index)
		detail, err := s.CreateProductV2(ctx, workspaceID, userID, row)
		if err != nil {
			failures = append(failures, ProductImportError{Row: index + 2, Name: strings.TrimSpace(row.Name), Message: err.Error()})
			continue
		}
		created++
		_ = s.productEvent(ctx, s.queries, workspaceID, detail.Product.ID, userID, "imported", "Added from "+fileName)
	}
	errorsJSON, _ := json.Marshal(failures)
	batch, err := s.queries.InsertProductImportBatch(ctx, db.InsertProductImportBatchParams{
		WorkspaceID: workspaceID, FileName: fileName, TotalRows: int32(len(in.Rows)), CreatedCount: created,
		FailedCount: int32(len(failures)), Errors: errorsJSON, CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return ProductImportBatch{}, err
	}
	return ProductImportBatch{ID: batch.ID, FileName: batch.FileName, TotalRows: batch.TotalRows, CreatedCount: batch.CreatedCount, FailedCount: batch.FailedCount, Errors: failures, CreatedAt: batch.CreatedAt.Time}, nil
}

func (s *Service) ListProductImportBatches(ctx context.Context, workspaceID int64) ([]ProductImportBatch, error) {
	rows, err := s.queries.ListProductImportBatches(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	out := make([]ProductImportBatch, 0, len(rows))
	for _, row := range rows {
		failures := []ProductImportError{}
		_ = json.Unmarshal(row.Errors, &failures)
		out = append(out, ProductImportBatch{ID: row.ID, FileName: row.FileName, TotalRows: row.TotalRows, CreatedCount: row.CreatedCount, FailedCount: row.FailedCount, Errors: failures, CreatedAt: row.CreatedAt.Time})
	}
	return out, nil
}

// ---------------- product images ----------------

var ErrImageUploadUnavailable = errors.New("image uploads are not set up yet; add Cloudinary keys to enable them")

const maxProductImageBytes int64 = 5 * 1024 * 1024

type ProductImageUploadInput struct {
	MimeType string `json:"mime_type"`
	ByteSize int64  `json:"byte_size"`
}

// AuthorizeProductImage signs a direct upload of one public product image.
// Product images are meant to be seen by shoppers, so unlike financial
// evidence they use public ("upload") delivery in a per-workspace folder.
func (s *Service) AuthorizeProductImage(workspaceID int64, in ProductImageUploadInput) (EvidenceUploadAuthorization, error) {
	uploader, ok := s.evidenceUploader.(*cloudinaryEvidenceAuthorizer)
	if !ok || uploader == nil {
		return EvidenceUploadAuthorization{}, ErrImageUploadUnavailable
	}
	return uploader.AuthorizePublicImage(workspaceID, in.MimeType, in.ByteSize)
}

func (a *cloudinaryEvidenceAuthorizer) AuthorizePublicImage(workspaceID int64, mimeType string, sizeBytes int64) (EvidenceUploadAuthorization, error) {
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "image/jpeg", "image/png", "image/webp":
	default:
		return EvidenceUploadAuthorization{}, errors.New("use a JPG, PNG or WebP image")
	}
	if sizeBytes <= 0 || sizeBytes > maxProductImageBytes {
		return EvidenceUploadAuthorization{}, errors.New("images must be 5 MB or smaller")
	}
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return EvidenceUploadAuthorization{}, err
	}
	folder := fmt.Sprintf("rekordly/products/w%d", workspaceID)
	publicID := hex.EncodeToString(nonce)
	timestamp := fmt.Sprintf("%d", time.Now().UTC().Unix())
	params := map[string]string{"folder": folder, "public_id": publicID, "timestamp": timestamp, "type": "upload"}
	return EvidenceUploadAuthorization{
		Provider: "cloudinary", UploadURL: fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/image/upload", a.config.CloudName),
		APIKey: a.config.APIKey, Timestamp: timestamp, Signature: cloudinarySignature(params, a.config.APISecret),
		Folder: folder, PublicID: publicID, DeliveryType: "upload", ResourceType: "image",
		MaxBytes: fmt.Sprintf("%d", maxProductImageBytes), ExpiresAt: time.Now().UTC().Add(10 * time.Minute).Format(time.RFC3339),
	}, nil
}
