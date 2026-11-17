package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type StorefrontProductCard struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	ImageURL      string  `json:"image_url,omitempty"`
	PriceMinor    string  `json:"price_minor"`
	VariantCount  int64   `json:"variant_count"`
	InStock       bool    `json:"in_stock"`
	ShowOnStore   bool    `json:"show_on_store"`
	IsFeatured    bool    `json:"is_featured"`
	CollectionIDs []int64 `json:"collection_ids"`
}

func (s *Service) ListStorefrontProductCards(ctx context.Context, ws int64, filter string, before int64, limit int, collectionID int64) ([]StorefrontProductCard, []StorefrontCollectionView, int64, error) {
	sf, err := s.queries.GetStorefrontByWorkspace(ctx, ws)
	if errors.Is(err, pgx.ErrNoRows) {
		// A workspace can open the catalogue before creating its storefront.
		// Keep this list usable as an empty state instead of querying collections
		// for a storefront that does not exist.
		return []StorefrontProductCard{}, []StorefrontCollectionView{}, 0, nil
	}
	if err != nil {
		return nil, nil, 0, err
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	filter = strings.TrimSpace(filter)
	if filter != "" && filter != "on" && filter != "hidden" && filter != "out_of_stock" {
		return nil, nil, 0, errors.New("choose all, on store, hidden or out of stock")
	}
	var beforeArg pgtype.Int8
	if before > 0 {
		beforeArg = pgtype.Int8{Int64: before, Valid: true}
	}
	var filterArg pgtype.Text
	if filter != "" {
		filterArg = pgtype.Text{String: filter, Valid: true}
	}
	var collectionArg pgtype.Int8
	if collectionID > 0 {
		collectionArg = pgtype.Int8{Int64: collectionID, Valid: true}
	}
	rows, err := s.queries.ListStorefrontProductCards(ctx, db.ListStorefrontProductCardsParams{StorefrontID: sf.ID, WorkspaceID: ws, BeforeID: beforeArg, StoreFilter: filterArg, CollectionID: collectionArg, RowLimit: int32(limit + 1)})
	if err != nil {
		return nil, nil, 0, err
	}
	items := make([]StorefrontProductCard, 0, len(rows))
	for _, row := range rows {
		items = append(items, StorefrontProductCard{ID: row.ID, Name: row.Name, ImageURL: row.ImageUrl, PriceMinor: fmt.Sprint(row.PriceMinor), VariantCount: row.VariantCount, InStock: row.InStock, ShowOnStore: row.ShowOnStore, IsFeatured: row.IsFeatured, CollectionIDs: row.CollectionIds})
	}
	collections, err := s.ListStorefrontCollections(ctx, ws)
	if err != nil {
		return nil, nil, 0, err
	}
	var next int64
	if len(items) > limit {
		items = items[:limit]
		next = items[len(items)-1].ID
	}
	return items, collections, next, nil
}

func (s *Service) ChangeStorefrontProducts(ctx context.Context, ws int64, in storefrontProductChange) error {
	if len(in.ProductIDs) == 0 || len(in.ProductIDs) > 100 {
		return errors.New("select between 1 and 100 products")
	}
	if in.ShowOnStore == nil && in.IsFeatured == nil && in.CollectionIDs == nil {
		return errors.New("choose a product change")
	}
	if len(in.CollectionIDs) > 0 && len(in.ProductIDs) > 1 {
		return errors.New("change collections one product at a time")
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		return errors.New("save key is required")
	}
	seen := map[int64]bool{}
	for _, id := range in.ProductIDs {
		if id <= 0 || seen[id] {
			return errors.New("product list is invalid")
		}
		seen[id] = true
	}
	sortIDs(in.ProductIDs)
	requestHash, err := storefrontDesignHash(in)
	if err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)
	if old, err := q.GetStorefrontCatalogueMutation(ctx, db.GetStorefrontCatalogueMutationParams{WorkspaceID: ws, IdempotencyKey: in.IdempotencyKey}); err == nil {
		if old.RequestHash != requestHash {
			return ErrDuplicateIdempotent
		}
		return tx.Commit(ctx)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	sf, err := q.GetStorefrontByWorkspace(ctx, ws)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	for _, productID := range in.ProductIDs {
		if in.ShowOnStore != nil {
			affected, err := q.UpdateProductStoreVisibility(ctx, db.UpdateProductStoreVisibilityParams{WorkspaceID: ws, ProductID: productID, ShowOnStore: *in.ShowOnStore})
			if err != nil {
				return err
			}
			if affected == 0 {
				return ErrNotFound
			}
		}
		if in.IsFeatured != nil {
			affected, err := q.UpdateStorefrontProductFeatured(ctx, db.UpdateStorefrontProductFeaturedParams{IsFeatured: *in.IsFeatured, WorkspaceID: ws, StorefrontID: sf.ID, ProductID: productID})
			if err != nil {
				return err
			}
			if affected == 0 {
				return ErrNotFound
			}
		}
		if in.CollectionIDs != nil {
			count, err := q.CountWorkspaceProductCollections(ctx, db.CountWorkspaceProductCollectionsParams{WorkspaceID: ws, CollectionIds: in.CollectionIDs})
			if err != nil {
				return err
			}
			if count != int64(len(in.CollectionIDs)) {
				return ErrNotFound
			}
			if err := q.ClearProductCollectionLinks(ctx, db.ClearProductCollectionLinksParams{WorkspaceID: ws, ProductID: productID}); err != nil {
				return err
			}
			for _, collectionID := range in.CollectionIDs {
				if err := q.AddProductCollectionLink(ctx, db.AddProductCollectionLinkParams{WorkspaceID: ws, CollectionID: collectionID, ProductID: productID}); err != nil {
					return err
				}
			}
		}
	}
	if err := q.CreateStorefrontCatalogueMutation(ctx, db.CreateStorefrontCatalogueMutationParams{WorkspaceID: ws, IdempotencyKey: in.IdempotencyKey, RequestHash: requestHash}); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	invalidateStorefrontCache(sf.Slug)
	return nil
}

func sortIDs(ids []int64) {
	for i := 1; i < len(ids); i++ {
		for j := i; j > 0 && ids[j] < ids[j-1]; j-- {
			ids[j], ids[j-1] = ids[j-1], ids[j]
		}
	}
}
