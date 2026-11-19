package finance_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestStorefrontPremiumThemeDraftsRemainIndependentAndPrivate(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	ws, user := createTestWorkspace(t, pool, "premium-theme-drafts")
	svc := finance.NewService(pool)
	store, err := svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{
		Name: "Premium Draft Shop", Slug: "premium-draft-shop", Currency: "NGN",
	})
	require.NoError(t, err)
	design, err := svc.GetStorefrontDesign(ctx, ws)
	require.NoError(t, err)

	save := func(theme, heading, key string, version int32) finance.StorefrontDesignView {
		t.Helper()
		saved, err := svc.SaveStorefrontDesignDraft(ctx, ws, user, finance.StorefrontDesignInput{
			ThemeKey: theme, Name: "Premium Draft Shop",
			Brand: finance.StorefrontBrand{Palette: "green", FontStyle: "modern"},
			Sections: []finance.StorefrontSection{{
				ID: "banner", Type: "hero", Enabled: true, Content: map[string]any{"heading": heading},
			}},
			ExpectedVersion: version, IdempotencyKey: key,
		})
		require.NoError(t, err)
		return saved
	}

	essential := save("simple", "Live shop", "save-essential", design.Version)
	published, err := svc.PublishStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{
		ExpectedVersion: essential.Version, IdempotencyKey: "publish-essential",
	})
	require.NoError(t, err)
	studio := save("studio", "Studio campaign", "save-studio", published.Version)
	market := save("market", "Market promotion", "save-market", studio.Version)
	market = save("market", "Updated Market promotion", "save-market-edit", market.Version)

	var snapshots map[string]struct {
		Sections []finance.StorefrontSection `json:"sections"`
	}
	require.NoError(t, json.Unmarshal(market.ThemeDrafts, &snapshots))
	require.Len(t, snapshots["studio"].Sections, 1)
	require.Len(t, snapshots["market"].Sections, 1)
	require.Equal(t, "Studio campaign", snapshots["studio"].Sections[0].Content["heading"])
	require.Equal(t, "Updated Market promotion", snapshots["market"].Sections[0].Content["heading"])

	public, err := svc.GetPublicStorefrontProjection(ctx, "premium-draft-shop", false, "", "")
	require.NoError(t, err)
	payload, err := json.Marshal(public)
	require.NoError(t, err)
	require.Contains(t, string(payload), "Live shop")
	require.NotContains(t, string(payload), "Studio campaign")
	require.NotContains(t, string(payload), "Market promotion")

	_, err = svc.PublishStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{
		ExpectedVersion: market.Version, IdempotencyKey: "publish-unowned-market",
	})
	require.ErrorIs(t, err, finance.ErrStorefrontThemePurchaseRequired)

	subject, _, err := svc.ResolveSubjectForWorkspace(ctx, ws)
	require.NoError(t, err)
	for _, theme := range []string{"studio", "market"} {
		var planID, transactionID int64
		err = pool.QueryRow(ctx, `INSERT INTO plan_versions
			(plan_code, version, display_name, subject_type, billing_interval, price_minor, is_addon, addon_type)
			VALUES ($1, 1, $1, 'business', 'once', 10000, true, $1) RETURNING id`, "storefront_theme_"+theme).Scan(&planID)
		require.NoError(t, err)
		err = pool.QueryRow(ctx, `INSERT INTO billing_transactions
			(billing_subject_id, tx_type, amount_minor, status, idempotency_key)
			VALUES ($1, 'addon', 10000, 'succeeded', $2) RETURNING id`, subject.ID, "fixture-"+theme).Scan(&transactionID)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `INSERT INTO storefront_theme_purchases
			(workspace_id, storefront_id, theme_key, plan_version_id, billing_transaction_id)
			VALUES ($1, $2, $3, $4, $5)`, ws, store.ID, theme, planID, transactionID)
		require.NoError(t, err)
	}

	marketLive, err := svc.PublishStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{
		ExpectedVersion: market.Version, IdempotencyKey: "publish-owned-market",
	})
	require.NoError(t, err)
	public, err = svc.GetPublicStorefrontProjection(ctx, "premium-draft-shop", false, "", "")
	require.NoError(t, err)
	require.Equal(t, "market", public.ThemeKey)
	require.NotEmpty(t, public.Sections)
	require.Equal(t, "Updated Market promotion", public.Sections[0].Content["heading"])

	studio = save("studio", "Studio campaign", "reopen-studio", marketLive.Version)
	_, err = svc.PublishStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{
		ExpectedVersion: studio.Version, IdempotencyKey: "publish-owned-studio",
	})
	require.NoError(t, err)
	public, err = svc.GetPublicStorefrontProjection(ctx, "premium-draft-shop", false, "", "")
	require.NoError(t, err)
	require.Equal(t, "studio", public.ThemeKey)
	require.NotEmpty(t, public.Sections)
	require.Equal(t, "Studio campaign", public.Sections[0].Content["heading"])
}
