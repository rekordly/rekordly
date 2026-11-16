package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

// CreateCatalogueItemInput starts every item with one default sellable variant.
// Variant matrices and stock movements intentionally arrive in later Blueprint 07 slices.
type CreateCatalogueItemInput struct {
	Name           string `json:"name" binding:"required"`
	Description    string `json:"description"`
	Kind           string `json:"kind" binding:"required"` // service, non_stock, stock_tracked
	Status         string `json:"status"`                  // draft, active
	UnitName       string `json:"unit_name"`
	SKU            string `json:"sku"`
	Barcode        string `json:"barcode"`
	SellingPrice   string `json:"selling_price" binding:"required"`
	Currency       string `json:"currency"`
	IdempotencyKey string `json:"idempotency_key"`
}

// CatalogueItem is deliberately a compact product plus its default variant.
// A stock-tracked item still has zero quantity until a later opening-stock command.
type CatalogueItem struct {
	ID                int64     `json:"id"`
	WorkspaceID       int64     `json:"workspace_id"`
	Name              string    `json:"name"`
	Description       *string   `json:"description,omitempty"`
	Kind              string    `json:"kind"`
	Status            string    `json:"status"`
	UnitName          string    `json:"unit_name"`
	DefaultVariantID  int64     `json:"default_variant_id"`
	SKU               *string   `json:"sku,omitempty"`
	Barcode           *string   `json:"barcode,omitempty"`
	SellingPriceMinor int64     `json:"selling_price_minor"`
	Currency          string    `json:"currency"`
	CurrencyExponent  int32     `json:"currency_exponent"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type ListCatalogueItemsFilter struct {
	Search   string `form:"search"`
	BeforeID int64  `form:"before_id"`
	Limit    int32  `form:"limit"`
}

func (s *Service) CreateCatalogueItem(ctx context.Context, workspaceID, userID int64, in CreateCatalogueItemInput) (CatalogueItem, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" || len(name) > 200 {
		return CatalogueItem{}, errors.New("product name must be between 1 and 200 characters")
	}
	kind := strings.ToLower(strings.TrimSpace(in.Kind))
	switch kind {
	case "service", "non_stock", "stock_tracked":
	default:
		return CatalogueItem{}, errors.New("invalid catalogue item kind")
	}
	status := strings.ToLower(strings.TrimSpace(in.Status))
	if status == "" {
		status = "active"
	}
	if status != "active" && status != "draft" {
		return CatalogueItem{}, errors.New("catalogue items can only be created as active or draft")
	}
	unitName := strings.TrimSpace(in.UnitName)
	if unitName == "" {
		unitName = "each"
	}
	if len(unitName) > 40 {
		return CatalogueItem{}, errors.New("unit name must be at most 40 characters")
	}
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if len(currency) != 3 {
		return CatalogueItem{}, ErrInvalidCurrency
	}
	exponent := CurrencyExponent(currency)
	price, err := ParseMajorToMinor(in.SellingPrice, exponent)
	if err != nil {
		return CatalogueItem{}, fmt.Errorf("invalid selling price: %w", err)
	}
	idempotencyKey := strings.TrimSpace(in.IdempotencyKey)
	if idempotencyKey == "" || len(idempotencyKey) > 200 {
		return CatalogueItem{}, errors.New("an idempotency key is required")
	}

	if existing, err := s.queries.GetProductByIdempotency(ctx, db.GetProductByIdempotencyParams{WorkspaceID: workspaceID, IdempotencyKey: idempotencyKey}); err == nil {
		return s.catalogueItemForProduct(ctx, s.queries, existing)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return CatalogueItem{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return CatalogueItem{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	product, err := qtx.CreateProduct(ctx, db.CreateProductParams{
		WorkspaceID:     workspaceID,
		Name:            name,
		Description:     optionalPgText(in.Description),
		Kind:            kind,
		Status:          status,
		UnitName:        unitName,
		IdempotencyKey:  idempotencyKey,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return CatalogueItem{}, fmt.Errorf("create product: %w", err)
	}
	// Quick adds (from a sale or invoice) get a readable SKU too.
	sku := optionalPgText(strings.ToUpper(strings.TrimSpace(in.SKU)))
	if !sku.Valid {
		generated, err := generateSKU(ctx, qtx, workspaceID, product.ID, name, pgtype.Int8{})
		if err != nil {
			return CatalogueItem{}, err
		}
		sku = pgtype.Text{String: generated, Valid: true}
	}
	variant, err := qtx.CreateProductVariant(ctx, db.CreateProductVariantParams{
		WorkspaceID:       workspaceID,
		ProductID:         product.ID,
		Name:              "Default",
		Sku:               sku,
		Barcode:           optionalPgText(in.Barcode),
		SellingPriceMinor: price,
		Currency:          currency,
		CurrencyExponent:  int32(exponent),
		IsDefault:         true,
		IsActive:          true,
	})
	if err != nil {
		return CatalogueItem{}, fmt.Errorf("create product variant: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return CatalogueItem{}, fmt.Errorf("commit catalogue item: %w", err)
	}
	return catalogueItemFromProduct(product, variant), nil
}

func (s *Service) ListCatalogueItems(ctx context.Context, workspaceID int64, filter ListCatalogueItemsFilter) ([]CatalogueItem, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var beforeID pgtype.Int8
	if filter.BeforeID > 0 {
		beforeID = pgtype.Int8{Int64: filter.BeforeID, Valid: true}
	}
	rows, err := s.queries.ListCatalogueItems(ctx, db.ListCatalogueItemsParams{
		WorkspaceID: workspaceID,
		Limit:       limit,
		Search:      searchParam(filter.Search),
		BeforeID:    beforeID,
	})
	if err != nil {
		return nil, err
	}
	items := make([]CatalogueItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, CatalogueItem{
			ID: row.ID, WorkspaceID: row.WorkspaceID, Name: row.Name,
			Description: nullableText(row.Description), Kind: row.Kind, Status: row.Status, UnitName: row.UnitName,
			DefaultVariantID: row.DefaultVariantID, SKU: nullableText(row.Sku), Barcode: nullableText(row.Barcode),
			SellingPriceMinor: row.SellingPriceMinor, Currency: row.Currency, CurrencyExponent: row.CurrencyExponent,
			CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time,
		})
	}
	return items, nil
}

func (s *Service) catalogueItemForProduct(ctx context.Context, queries *db.Queries, product db.Product) (CatalogueItem, error) {
	variant, err := queries.GetDefaultProductVariant(ctx, db.GetDefaultProductVariantParams{WorkspaceID: product.WorkspaceID, ProductID: product.ID})
	if err != nil {
		return CatalogueItem{}, err
	}
	return catalogueItemFromProduct(product, variant), nil
}

func catalogueItemFromProduct(product db.Product, variant db.ProductVariant) CatalogueItem {
	return CatalogueItem{
		ID: product.ID, WorkspaceID: product.WorkspaceID, Name: product.Name,
		Description: nullableText(product.Description), Kind: product.Kind, Status: product.Status, UnitName: product.UnitName,
		DefaultVariantID: variant.ID, SKU: nullableText(variant.Sku), Barcode: nullableText(variant.Barcode),
		SellingPriceMinor: variant.SellingPriceMinor, Currency: variant.Currency, CurrencyExponent: variant.CurrencyExponent,
		CreatedAt: product.CreatedAt.Time, UpdatedAt: product.UpdatedAt.Time,
	}
}

func nullableText(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

// ---------------- Product Options & Variants ----------------

type CreateProductOptionInput struct {
	Name   string   `json:"name" binding:"required"`
	Values []string `json:"values" binding:"required"`
}

type ProductOptionView struct {
	ID           int64                    `json:"id"`
	ProductID    int64                    `json:"product_id"`
	Name         string                   `json:"name"`
	Position     int32                    `json:"position"`
	Values       []string                 `json:"values"`
	ValueDetails []ProductOptionValueView `json:"value_details,omitempty"`
}

type ProductOptionValueView struct {
	ID    int64  `json:"id"`
	Value string `json:"value"`
}

type CreateVariantInput struct {
	Name           string  `json:"name"`
	SKU            string  `json:"sku"`
	Barcode        string  `json:"barcode"`
	SellingPrice   string  `json:"selling_price" binding:"required"`
	CostPrice      string  `json:"cost_price"`
	OptionValueIDs []int64 `json:"option_value_ids"`
}

type UpdateVariantInput struct {
	Name         *string `json:"name"`
	SKU          *string `json:"sku"`
	Barcode      *string `json:"barcode"`
	SellingPrice *string `json:"selling_price"`
	CostPrice    *string `json:"cost_price"`
	IsActive     *bool   `json:"is_active"`
}

type VariantView struct {
	ID                  int64             `json:"id"`
	ProductID           int64             `json:"product_id"`
	Name                string            `json:"name"`
	SKU                 *string           `json:"sku,omitempty"`
	Barcode             *string           `json:"barcode,omitempty"`
	SellingPriceMinor   int64             `json:"selling_price_minor"`
	CostPriceMinor      int64             `json:"cost_price_minor"`
	CompareAtPriceMinor *int64            `json:"compare_at_price_minor,omitempty"`
	Currency            string            `json:"currency"`
	CurrencyExponent    int32             `json:"currency_exponent"`
	IsDefault           bool              `json:"is_default"`
	IsActive            bool              `json:"is_active"`
	ArchivedAt          *time.Time        `json:"archived_at,omitempty"`
	QuantityOnHand      string            `json:"quantity_on_hand"`
	OptionValues        map[string]string `json:"option_values,omitempty"`
}

func (s *Service) CreateProductOption(ctx context.Context, workspaceID, productID int64, in CreateProductOptionInput) (ProductOptionView, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" || len(name) > 100 {
		return ProductOptionView{}, errors.New("option name must be between 1 and 100 characters")
	}
	if len(in.Values) == 0 {
		return ProductOptionView{}, errors.New("at least one option value is required")
	}

	product, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: productID})
	if errors.Is(err, pgx.ErrNoRows) {
		return ProductOptionView{}, ErrNotFound
	}
	if err != nil {
		return ProductOptionView{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ProductOptionView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	existingOpts, err := qtx.ListProductOptions(ctx, db.ListProductOptionsParams{
		WorkspaceID: workspaceID,
		ProductID:   product.ID,
	})
	if err != nil {
		return ProductOptionView{}, err
	}

	opt, err := qtx.CreateProductOption(ctx, db.CreateProductOptionParams{
		WorkspaceID: workspaceID,
		ProductID:   product.ID,
		Name:        name,
		Position:    int32(len(existingOpts)),
	})
	if err != nil {
		if strings.Contains(err.Error(), "product_options_product_name_uidx") {
			return ProductOptionView{}, errors.New("an option with this name already exists for this product")
		}
		return ProductOptionView{}, err
	}

	valuesList := make([]string, 0, len(in.Values))
	for idx, val := range in.Values {
		v := strings.TrimSpace(val)
		if v == "" {
			continue
		}
		_, err := qtx.CreateProductOptionValue(ctx, db.CreateProductOptionValueParams{
			WorkspaceID: workspaceID,
			OptionID:    opt.ID,
			ProductID:   product.ID,
			Value:       v,
			Position:    int32(idx),
		})
		if err != nil {
			return ProductOptionView{}, fmt.Errorf("create option value %q: %w", v, err)
		}
		valuesList = append(valuesList, v)
	}

	if err := tx.Commit(ctx); err != nil {
		return ProductOptionView{}, err
	}

	return ProductOptionView{
		ID:        opt.ID,
		ProductID: opt.ProductID,
		Name:      opt.Name,
		Position:  opt.Position,
		Values:    valuesList,
	}, nil
}

func (s *Service) ListProductOptions(ctx context.Context, workspaceID, productID int64) ([]ProductOptionView, error) {
	_, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: productID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	opts, err := s.queries.ListProductOptions(ctx, db.ListProductOptionsParams{
		WorkspaceID: workspaceID,
		ProductID:   productID,
	})
	if err != nil {
		return nil, err
	}

	allVals, err := s.queries.ListProductOptionValues(ctx, db.ListProductOptionValuesParams{
		WorkspaceID: workspaceID,
		ProductID:   productID,
	})
	if err != nil {
		return nil, err
	}

	valsByOpt := make(map[int64][]string)
	detailsByOpt := make(map[int64][]ProductOptionValueView)
	for _, v := range allVals {
		valsByOpt[v.OptionID] = append(valsByOpt[v.OptionID], v.Value)
		detailsByOpt[v.OptionID] = append(detailsByOpt[v.OptionID], ProductOptionValueView{ID: v.ID, Value: v.Value})
	}

	out := make([]ProductOptionView, 0, len(opts))
	for _, o := range opts {
		out = append(out, ProductOptionView{
			ID:           o.ID,
			ProductID:    o.ProductID,
			Name:         o.Name,
			Position:     o.Position,
			Values:       valsByOpt[o.ID],
			ValueDetails: detailsByOpt[o.ID],
		})
	}
	return out, nil
}

func (s *Service) CreateProductVariant(ctx context.Context, workspaceID, productID int64, in CreateVariantInput) (VariantView, error) {
	_, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: productID})
	if errors.Is(err, pgx.ErrNoRows) {
		return VariantView{}, ErrNotFound
	}
	if err != nil {
		return VariantView{}, err
	}

	defVariant, err := s.queries.GetDefaultProductVariant(ctx, db.GetDefaultProductVariantParams{
		WorkspaceID: workspaceID,
		ProductID:   productID,
	})
	if err != nil {
		return VariantView{}, err
	}

	currency := defVariant.Currency
	exponent := defVariant.CurrencyExponent

	sellingPriceMinor, err := ParseMajorToMinor(in.SellingPrice, int(exponent))
	if err != nil {
		return VariantView{}, err
	}
	if sellingPriceMinor < 0 {
		return VariantView{}, errors.New("selling price cannot be negative")
	}

	var costPriceMinor int64
	if strings.TrimSpace(in.CostPrice) != "" {
		cMinor, err := ParseMajorToMinor(in.CostPrice, int(exponent))
		if err != nil {
			return VariantView{}, err
		}
		if cMinor < 0 {
			return VariantView{}, errors.New("cost price cannot be negative")
		}
		costPriceMinor = cMinor
	}

	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = "Variant"
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return VariantView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	vRec, err := qtx.CreateVariant(ctx, db.CreateVariantParams{
		WorkspaceID:       workspaceID,
		ProductID:         productID,
		Name:              name,
		Sku:               optionalPgText(in.SKU),
		Barcode:           optionalPgText(in.Barcode),
		SellingPriceMinor: sellingPriceMinor,
		CostPriceMinor:    costPriceMinor,
		Currency:          currency,
		CurrencyExponent:  exponent,
		IsDefault:         false,
		IsActive:          true,
	})
	if err != nil {
		if strings.Contains(err.Error(), "product_variants_workspace_sku_uidx") {
			return VariantView{}, errors.New("a variant with this SKU already exists in this workspace")
		}
		if strings.Contains(err.Error(), "product_variants_workspace_barcode_uidx") {
			return VariantView{}, errors.New("a variant with this barcode already exists in this workspace")
		}
		return VariantView{}, err
	}

	for _, optValID := range in.OptionValueIDs {
		if err := qtx.BindVariantOptionValue(ctx, db.BindVariantOptionValueParams{
			WorkspaceID:   workspaceID,
			VariantID:     vRec.ID,
			OptionValueID: optValID,
		}); err != nil {
			return VariantView{}, fmt.Errorf("bind option value: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return VariantView{}, err
	}

	return VariantView{
		ID:                vRec.ID,
		ProductID:         vRec.ProductID,
		Name:              vRec.Name,
		SKU:               nullableText(vRec.Sku),
		Barcode:           nullableText(vRec.Barcode),
		SellingPriceMinor: vRec.SellingPriceMinor,
		CostPriceMinor:    vRec.CostPriceMinor,
		Currency:          vRec.Currency,
		CurrencyExponent:  vRec.CurrencyExponent,
		IsDefault:         vRec.IsDefault,
		IsActive:          vRec.IsActive,
	}, nil
}

func (s *Service) ListProductVariants(ctx context.Context, workspaceID, productID int64) ([]VariantView, error) {
	_, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: productID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	variants, err := s.queries.ListVariantsByProductID(ctx, db.ListVariantsByProductIDParams{
		WorkspaceID: workspaceID,
		ProductID:   productID,
	})
	if err != nil {
		return nil, err
	}

	bindings, err := s.queries.ListVariantOptionValuesForProduct(ctx, db.ListVariantOptionValuesForProductParams{
		WorkspaceID: workspaceID,
		ProductID:   productID,
	})
	if err != nil {
		return nil, err
	}

	optValsByVariant := make(map[int64]map[string]string)
	for _, b := range bindings {
		if optValsByVariant[b.VariantID] == nil {
			optValsByVariant[b.VariantID] = make(map[string]string)
		}
		optValsByVariant[b.VariantID][b.OptionName] = b.OptionValue
	}

	out := make([]VariantView, 0, len(variants))
	for _, v := range variants {
		stock, err := s.queries.CountVariantStock(ctx, db.CountVariantStockParams{WorkspaceID: workspaceID, VariantID: v.ID})
		if err != nil {
			return nil, err
		}
		out = append(out, VariantView{
			ID:                  v.ID,
			ProductID:           v.ProductID,
			Name:                v.Name,
			SKU:                 nullableText(v.Sku),
			Barcode:             nullableText(v.Barcode),
			SellingPriceMinor:   v.SellingPriceMinor,
			CostPriceMinor:      v.CostPriceMinor,
			CompareAtPriceMinor: int64Ptr(v.CompareAtPriceMinor),
			Currency:            v.Currency,
			CurrencyExponent:    v.CurrencyExponent,
			IsDefault:           v.IsDefault,
			IsActive:            v.IsActive,
			ArchivedAt:          timePtr(v.ArchivedAt),
			QuantityOnHand:      stock.String(),
			OptionValues:        optValsByVariant[v.ID],
		})
	}
	return out, nil
}

func (s *Service) UpdateProductVariant(ctx context.Context, workspaceID, productID, variantID int64, in UpdateVariantInput) (VariantView, error) {
	orig, err := s.queries.GetVariantByID(ctx, db.GetVariantByIDParams{
		WorkspaceID: workspaceID,
		ID:          variantID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return VariantView{}, ErrNotFound
	}
	if err != nil {
		return VariantView{}, err
	}
	if orig.ProductID != productID {
		return VariantView{}, ErrNotFound
	}

	name := orig.Name
	if in.Name != nil && strings.TrimSpace(*in.Name) != "" {
		name = strings.TrimSpace(*in.Name)
	}

	skuParam := orig.Sku
	if in.SKU != nil {
		s := strings.TrimSpace(*in.SKU)
		if s != "" {
			skuParam = pgtype.Text{String: s, Valid: true}
		} else {
			skuParam = pgtype.Text{Valid: false}
		}
	}

	barcodeParam := orig.Barcode
	if in.Barcode != nil {
		b := strings.TrimSpace(*in.Barcode)
		if b != "" {
			barcodeParam = pgtype.Text{String: b, Valid: true}
		} else {
			barcodeParam = pgtype.Text{Valid: false}
		}
	}

	sellingPriceMinor := orig.SellingPriceMinor
	if in.SellingPrice != nil {
		sp, err := ParseMajorToMinor(*in.SellingPrice, int(orig.CurrencyExponent))
		if err != nil {
			return VariantView{}, err
		}
		if sp < 0 {
			return VariantView{}, errors.New("selling price cannot be negative")
		}
		sellingPriceMinor = sp
	}

	costPriceMinor := orig.CostPriceMinor
	if in.CostPrice != nil {
		cp, err := ParseMajorToMinor(*in.CostPrice, int(orig.CurrencyExponent))
		if err != nil {
			return VariantView{}, err
		}
		if cp < 0 {
			return VariantView{}, errors.New("cost price cannot be negative")
		}
		costPriceMinor = cp
	}

	isActive := orig.IsActive
	if in.IsActive != nil {
		isActive = *in.IsActive
	}

	updated, err := s.queries.UpdateVariant(ctx, db.UpdateVariantParams{
		WorkspaceID:       workspaceID,
		ID:                variantID,
		Name:              name,
		Sku:               skuParam,
		Barcode:           barcodeParam,
		SellingPriceMinor: sellingPriceMinor,
		CostPriceMinor:    costPriceMinor,
		IsActive:          isActive,
	})
	if err != nil {
		if strings.Contains(err.Error(), "product_variants_workspace_sku_uidx") {
			return VariantView{}, errors.New("a variant with this SKU already exists in this workspace")
		}
		if strings.Contains(err.Error(), "product_variants_workspace_barcode_uidx") {
			return VariantView{}, errors.New("a variant with this barcode already exists in this workspace")
		}
		return VariantView{}, err
	}

	return VariantView{
		ID:                updated.ID,
		ProductID:         updated.ProductID,
		Name:              updated.Name,
		SKU:               nullableText(updated.Sku),
		Barcode:           nullableText(updated.Barcode),
		SellingPriceMinor: updated.SellingPriceMinor,
		CostPriceMinor:    updated.CostPriceMinor,
		Currency:          updated.Currency,
		CurrencyExponent:  updated.CurrencyExponent,
		IsDefault:         updated.IsDefault,
		IsActive:          updated.IsActive,
	}, nil
}
