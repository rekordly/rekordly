package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type SaveOptionValueInput struct {
	ID    int64  `json:"id"`
	Value string `json:"value"`
}
type SaveOptionInput struct {
	ID     int64                  `json:"id"`
	Name   string                 `json:"name"`
	Values []SaveOptionValueInput `json:"values"`
}
type SaveOptionVariantInput struct {
	ID             int64    `json:"id"`
	OptionValues   []string `json:"option_values"`
	SellingPrice   string   `json:"selling_price"`
	CostPrice      string   `json:"cost_price"`
	CompareAtPrice string   `json:"compare_at_price"`
	SKU            string   `json:"sku"`
	Barcode        string   `json:"barcode"`
	IsActive       bool     `json:"is_active"`
}
type SaveProductOptionsInput struct {
	Options        []SaveOptionInput        `json:"options"`
	Variants       []SaveOptionVariantInput `json:"variants"`
	IdempotencyKey string                   `json:"idempotency_key"`
}

func optionCode(value string) string {
	var out []rune
	for _, r := range strings.ToUpper(value) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			out = append(out, r)
		}
		if len(out) == 6 {
			break
		}
	}
	if len(out) == 0 {
		return "VALUE"
	}
	return string(out)
}

func optionCombinationKey(ids []int64) string {
	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = fmt.Sprintf("%d", id)
	}
	return strings.Join(parts, "/")
}

// SaveProductOptions replaces the active matrix in one transaction. It keeps
// removed combinations as archived variants so stock and past records survive.
func (s *Service) SaveProductOptions(ctx context.Context, workspaceID, userID, productID int64, in SaveProductOptionsInput) (ProductDetail, error) {
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		return ProductDetail{}, errors.New("an idempotency key is required")
	}
	if len(in.Options) == 0 || len(in.Options) > 3 {
		return ProductDetail{}, errors.New("add between one and three options")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ProductDetail{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	product, err := q.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: productID})
	if errors.Is(err, pgx.ErrNoRows) {
		return ProductDetail{}, ErrProductNotFound
	}
	if err != nil {
		return ProductDetail{}, err
	}
	base, err := q.GetDefaultProductVariant(ctx, db.GetDefaultProductVariantParams{WorkspaceID: workspaceID, ProductID: product.ID})
	if err != nil {
		return ProductDetail{}, err
	}
	oldOptions, err := q.ListProductOptions(ctx, db.ListProductOptionsParams{WorkspaceID: workspaceID, ProductID: productID})
	if err != nil {
		return ProductDetail{}, err
	}
	oldValues, err := q.ListProductOptionValues(ctx, db.ListProductOptionValuesParams{WorkspaceID: workspaceID, ProductID: productID})
	if err != nil {
		return ProductDetail{}, err
	}
	optionByID := make(map[int64]db.ProductOption)
	optionByName := make(map[string]db.ProductOption)
	for _, opt := range oldOptions {
		optionByID[opt.ID] = opt
		optionByName[strings.ToLower(opt.Name)] = opt
	}
	valueByID := make(map[int64]db.ProductOptionValue)
	valueByName := make(map[int64]map[string]db.ProductOptionValue)
	for _, val := range oldValues {
		valueByID[val.ID] = val
		if valueByName[val.OptionID] == nil {
			valueByName[val.OptionID] = make(map[string]db.ProductOptionValue)
		}
		valueByName[val.OptionID][strings.ToLower(val.Value)] = val
	}
	resolved := make([][]db.ProductOptionValue, len(in.Options))
	seenNames := make(map[string]bool)
	combinations := 1
	var structureChanged bool
	var priceChangedCount int
	if len(oldOptions) != len(in.Options) {
		structureChanged = true
	}
	for i, input := range in.Options {
		name := strings.TrimSpace(input.Name)
		if name == "" || len([]rune(name)) > 100 || seenNames[strings.ToLower(name)] {
			return ProductDetail{}, errors.New("give each option a different name")
		}
		seenNames[strings.ToLower(name)] = true
		if len(input.Values) == 0 || len(input.Values) > 30 {
			return ProductDetail{}, errors.New("each option needs 1 to 30 values")
		}
		combinations *= len(input.Values)
		if combinations > 500 {
			return ProductDetail{}, errors.New("too many combinations; use fewer values")
		}
		var opt db.ProductOption
		if input.ID > 0 {
			var ok bool
			opt, ok = optionByID[input.ID]
			if !ok {
				return ProductDetail{}, errors.New("an option does not belong to this product")
			}
			if opt.Name != name {
				structureChanged = true
			}
		} else if existing, ok := optionByName[strings.ToLower(name)]; ok {
			opt = existing
		} else {
			structureChanged = true
			opt, err = q.CreateProductOption(ctx, db.CreateProductOptionParams{WorkspaceID: workspaceID, ProductID: productID, Name: name, Position: int32(i)})
			if err != nil {
				return ProductDetail{}, err
			}
			optionByName[strings.ToLower(name)] = opt
		}
		if err := q.UpdateProductOption(ctx, db.UpdateProductOptionParams{WorkspaceID: workspaceID, ProductID: productID, ID: opt.ID, Name: name, Position: int32(i)}); err != nil {
			return ProductDetail{}, err
		}
		seenValues := make(map[string]bool)
		for j, valueInput := range input.Values {
			value := strings.TrimSpace(valueInput.Value)
			if value == "" || len([]rune(value)) > 100 || seenValues[strings.ToLower(value)] {
				return ProductDetail{}, fmt.Errorf("give %s different values", name)
			}
			seenValues[strings.ToLower(value)] = true
			var val db.ProductOptionValue
			if valueInput.ID > 0 {
				var ok bool
				val, ok = valueByID[valueInput.ID]
				if !ok || val.OptionID != opt.ID {
					return ProductDetail{}, errors.New("an option value does not belong to this option")
				}
			} else if existing, ok := valueByName[opt.ID][strings.ToLower(value)]; ok {
				val = existing
			} else {
				val, err = q.CreateProductOptionValue(ctx, db.CreateProductOptionValueParams{WorkspaceID: workspaceID, ProductID: productID, OptionID: opt.ID, Value: value, Position: int32(j)})
				if err != nil {
					return ProductDetail{}, err
				}
			}
			if err := q.UpdateProductOptionValue(ctx, db.UpdateProductOptionValueParams{WorkspaceID: workspaceID, ProductID: productID, OptionID: opt.ID, ID: val.ID, Value: value, Position: int32(j)}); err != nil {
				return ProductDetail{}, err
			}
			val.Value = value
			resolved[i] = append(resolved[i], val)
		}
	}
	if len(in.Variants) != combinations {
		return ProductDetail{}, fmt.Errorf("fill in all %d variant combinations", combinations)
	}
	oldVariants, err := q.ListVariantsByProductID(ctx, db.ListVariantsByProductIDParams{WorkspaceID: workspaceID, ProductID: productID})
	if err != nil {
		return ProductDetail{}, err
	}
	bindings, err := q.ListVariantOptionValuesForProduct(ctx, db.ListVariantOptionValuesForProductParams{WorkspaceID: workspaceID, ProductID: productID})
	if err != nil {
		return ProductDetail{}, err
	}
	bound := make(map[int64]map[int64]int64)
	for _, binding := range bindings {
		if bound[binding.VariantID] == nil {
			bound[binding.VariantID] = make(map[int64]int64)
		}
		bound[binding.VariantID][binding.OptionID] = binding.OptionValueID
	}
	oldByKey := make(map[string]db.ProductVariant)
	oldByID := make(map[int64]db.ProductVariant)
	for _, variant := range oldVariants {
		if variant.IsDefault {
			continue
		}
		oldByID[variant.ID] = variant
		ids := make([]int64, len(in.Options))
		for i, opt := range in.Options {
			id := opt.ID
			if id == 0 {
				id = optionByName[strings.ToLower(strings.TrimSpace(opt.Name))].ID
			}
			ids[i] = bound[variant.ID][id]
		}
		oldByKey[optionCombinationKey(ids)] = variant
	}
	seenCombos := make(map[string]bool)
	kept := make(map[int64]bool)
	for position, input := range in.Variants {
		if len(input.OptionValues) != len(resolved) {
			return ProductDetail{}, errors.New("each variant needs one value from every option")
		}
		ids := make([]int64, len(resolved))
		labels := make([]string, len(resolved))
		codes := make([]string, len(resolved))
		for i, wanted := range input.OptionValues {
			for _, val := range resolved[i] {
				if strings.EqualFold(val.Value, strings.TrimSpace(wanted)) {
					ids[i], labels[i], codes[i] = val.ID, val.Value, optionCode(val.Value)
					break
				}
			}
			if ids[i] == 0 {
				return ProductDetail{}, errors.New("a variant has a value outside its options")
			}
		}
		key := optionCombinationKey(ids)
		if seenCombos[key] {
			return ProductDetail{}, errors.New("a variant combination appears twice")
		}
		seenCombos[key] = true
		price, err := ParseMajorToMinor(input.SellingPrice, int(base.CurrencyExponent))
		if err != nil || price < 0 {
			return ProductDetail{}, fmt.Errorf("enter a valid price for %s", strings.Join(labels, " / "))
		}
		var cost, compare int64
		if strings.TrimSpace(input.CostPrice) != "" {
			cost, err = ParseMajorToMinor(input.CostPrice, int(base.CurrencyExponent))
			if err != nil || cost < 0 {
				return ProductDetail{}, errors.New("enter a valid cost price")
			}
		}
		var compareParam pgtype.Int8
		if strings.TrimSpace(input.CompareAtPrice) != "" {
			compare, err = ParseMajorToMinor(input.CompareAtPrice, int(base.CurrencyExponent))
			if err != nil || compare <= price {
				return ProductDetail{}, errors.New("compare-at price must be above the selling price")
			}
			compareParam = pgtype.Int8{Int64: compare, Valid: true}
		}
		sku := strings.ToUpper(strings.TrimSpace(input.SKU))
		if sku == "" {
			sku = strings.Join(append([]string{base.Sku.String}, codes...), "-")
		}
		if len(sku) > 60 {
			return ProductDetail{}, errors.New("variant SKU is too long")
		}
		variant, exists := oldByKey[key]
		if input.ID > 0 {
			candidate, ok := oldByID[input.ID]
			if !ok {
				return ProductDetail{}, errors.New("a variant does not belong to this product")
			}
			variant, exists = candidate, true
		}
		if exists {
			kept[variant.ID] = true
			oldPrice, oldCost := variant.SellingPriceMinor, variant.CostPriceMinor
			oldCompare := variant.CompareAtPriceMinor
			priceDifferent := oldPrice != price || oldCost != cost || (oldCompare.Valid != compareParam.Valid) || (oldCompare.Valid && compareParam.Valid && oldCompare.Int64 != compareParam.Int64)
			if priceDifferent {
				priceChangedCount++
			}
			if variant.Sku.String != sku || variant.Barcode.String != input.Barcode || variant.IsActive != input.IsActive {
				structureChanged = true
			}
			variant, err = q.UpdateOptionVariant(ctx, db.UpdateOptionVariantParams{WorkspaceID: workspaceID, ProductID: productID, ID: variant.ID, Name: strings.Join(labels, " / "), Sku: optionalPgText(sku), Barcode: optionalPgText(input.Barcode), SellingPriceMinor: price, CostPriceMinor: cost, CompareAtPriceMinor: compareParam, IsActive: input.IsActive, Position: int32(position)})
			if err != nil {
				return ProductDetail{}, err
			}
			if priceDifferent {
				if err := q.InsertProductPriceHistory(ctx, db.InsertProductPriceHistoryParams{
					WorkspaceID:            workspaceID,
					ProductID:              productID,
					VariantID:              variant.ID,
					OldSellingPriceMinor:   pgtype.Int8{Int64: oldPrice, Valid: true},
					NewSellingPriceMinor:   price,
					OldCostPriceMinor:      pgtype.Int8{Int64: oldCost, Valid: true},
					NewCostPriceMinor:      cost,
					Currency:               base.Currency,
					CurrencyExponent:       base.CurrencyExponent,
					ChangedByUserID:        pgtype.Int8{Int64: userID, Valid: true},
					OldCompareAtPriceMinor: oldCompare,
					NewCompareAtPriceMinor: compareParam,
					Source:                 "options",
				}); err != nil {
					return ProductDetail{}, err
				}
			}
			if err := q.ClearVariantOptionValues(ctx, db.ClearVariantOptionValuesParams{WorkspaceID: workspaceID, VariantID: variant.ID}); err != nil {
				return ProductDetail{}, err
			}
		} else {
			structureChanged = true
			variant, err = q.CreateVariant(ctx, db.CreateVariantParams{WorkspaceID: workspaceID, ProductID: productID, Name: strings.Join(labels, " / "), Sku: optionalPgText(sku), Barcode: optionalPgText(input.Barcode), SellingPriceMinor: price, CostPriceMinor: cost, Currency: base.Currency, CurrencyExponent: base.CurrencyExponent, IsDefault: false, IsActive: input.IsActive})
			if err != nil {
				return ProductDetail{}, err
			}
			variant, err = q.UpdateOptionVariant(ctx, db.UpdateOptionVariantParams{WorkspaceID: workspaceID, ProductID: productID, ID: variant.ID, Name: variant.Name, Sku: variant.Sku, Barcode: variant.Barcode, SellingPriceMinor: price, CostPriceMinor: cost, CompareAtPriceMinor: compareParam, IsActive: input.IsActive, Position: int32(position)})
			if err != nil {
				return ProductDetail{}, err
			}
			kept[variant.ID] = true
		}
		for _, id := range ids {
			if err := q.BindVariantOptionValue(ctx, db.BindVariantOptionValueParams{WorkspaceID: workspaceID, VariantID: variant.ID, OptionValueID: id}); err != nil {
				return ProductDetail{}, err
			}
		}
	}
	for _, variant := range oldVariants {
		if !variant.IsDefault && !kept[variant.ID] {
			structureChanged = true
			if err := q.ArchiveOptionVariant(ctx, db.ArchiveOptionVariantParams{WorkspaceID: workspaceID, ProductID: productID, ID: variant.ID}); err != nil {
				return ProductDetail{}, err
			}
		}
	}
	if !structureChanged && priceChangedCount > 0 {
		if err := s.productEvent(ctx, q, workspaceID, productID, userID, "price_changed", "Price changed"); err != nil {
			return ProductDetail{}, err
		}
	} else {
		if err := s.productEvent(ctx, q, workspaceID, productID, userID, "updated", "Options changed"); err != nil {
			return ProductDetail{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return ProductDetail{}, err
	}
	return s.GetProduct(ctx, workspaceID, productID)
}
