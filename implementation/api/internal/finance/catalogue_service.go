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
	variant, err := qtx.CreateProductVariant(ctx, db.CreateProductVariantParams{
		WorkspaceID:       workspaceID,
		ProductID:         product.ID,
		Name:              "Default",
		Sku:               optionalPgText(strings.ToUpper(strings.TrimSpace(in.SKU))),
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
