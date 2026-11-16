package finance_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestStorefrontSettingsCardPatchPreservesOtherCardsAndRejectsTakenLink(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	wsA, userA := createTestWorkspace(t, pool, "store-settings-card-a")
	wsB, userB := createTestWorkspace(t, pool, "store-settings-card-b")
	svc := finance.NewService(pool)
	_, err := svc.CreateStorefront(ctx, wsA, userA, finance.CreateStorefrontInput{Name: "Card Alpha", Slug: "card-alpha", Currency: "NGN"})
	require.NoError(t, err)
	_, err = svc.CreateStorefront(ctx, wsB, userB, finance.CreateStorefrontInput{Name: "Card Beta", Slug: "card-beta", Currency: "NGN"})
	require.NoError(t, err)
	_, err = svc.UpdateStorefrontSettings(ctx, wsA, finance.UpdateStorefrontSettingsInput{ContactEmail: "hello@alpha.example"})
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	h := finance.NewHandler(svc, nil)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(finance.ContextWorkspaceKey, finance.WorkspaceContext{WorkspaceID: wsA, UserID: userA, Kind: "business", Permissions: []string{"storefront.manage_appearance", "storefront.manage_checkout", "storefront.view"}})
		c.Next()
	})
	h.RegisterStorefrontRoutes(r.Group("/api/v1"))

	body, err := json.Marshal(map[string]any{"delivery_guidance": "Pickup is available on weekdays", "card": "delivery", "idempotency_key": "settings-delivery-card-1"})
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/storefront/settings", bytes.NewReader(body))
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)
	require.Equal(t, http.StatusOK, res.Code, res.Body.String())
	updated, err := svc.GetMerchantStorefront(ctx, wsA)
	require.NoError(t, err)
	require.Equal(t, "hello@alpha.example", *updated.Settings.ContactEmail, "editing Delivery must preserve Store details")
	require.Equal(t, "Pickup is available on weekdays", *updated.Settings.DeliveryGuidance)

	body, err = json.Marshal(map[string]any{"slug": "card-beta", "card": "details", "idempotency_key": "settings-details-card-2"})
	require.NoError(t, err)
	req = httptest.NewRequest(http.MethodPatch, "/api/v1/storefront/settings", bytes.NewReader(body))
	res = httptest.NewRecorder()
	r.ServeHTTP(res, req)
	require.Equal(t, http.StatusConflict, res.Code, "a link already claimed by another workspace must be rejected")
	updated, err = svc.GetMerchantStorefront(ctx, wsA)
	require.NoError(t, err)
	require.Equal(t, "card-alpha", updated.Slug)
}

func TestStorefrontDesignDraftPublishConflictValidationSanitizationAndDiscard(t *testing.T) {
	pool := testPool(t)
	ws, user := createTestWorkspace(t, pool, "store-design-draft-phase1")
	svc := finance.NewService(pool)
	ctx := context.Background()
	_, err := svc.CreateStorefront(ctx, ws, user, finance.CreateStorefrontInput{Name: "Design Shop", Slug: "design-shop", Currency: "NGN"})
	require.NoError(t, err)

	initial, err := svc.GetStorefrontDesign(ctx, ws)
	require.NoError(t, err)
	base := finance.StorefrontDesignInput{ThemeKey: "simple", Name: "Design Shop", Brand: finance.StorefrontBrand{Palette: "green", FontStyle: "modern"}, Sections: []finance.StorefrontSection{{ID: "announce", Type: "announcement", Enabled: true, Content: map[string]any{"text": "Live announcement"}}}, ExpectedVersion: initial.Version, IdempotencyKey: "design-phase1-initial"}
	published, err := svc.SaveStorefrontDesignDraft(ctx, ws, user, base)
	require.NoError(t, err)
	published, err = svc.PublishStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{ExpectedVersion: published.Version, IdempotencyKey: "design-phase1-publish"})
	require.NoError(t, err)

	draft := finance.StorefrontDesignInput{ThemeKey: "boutique", Name: "Draft Name", Brand: finance.StorefrontBrand{Palette: "rose", FontStyle: "classic"}, Sections: []finance.StorefrontSection{{ID: "announce", Type: "announcement", Enabled: true, Content: map[string]any{"text": "Unpublished announcement"}}, {ID: "about", Type: "about", Enabled: true, Content: map[string]any{"body": `<p>Welcome</p><script>alert('no')</script>`}}}, ExpectedVersion: published.Version, IdempotencyKey: "design-phase1-draft"}
	draftView, err := svc.SaveStorefrontDesignDraft(ctx, ws, user, draft)
	require.NoError(t, err)
	require.NotContains(t, string(draftView.DraftSections), "<script")
	public, err := svc.GetPublicStorefrontProjection(ctx, "design-shop", false, "", "")
	require.NoError(t, err)
	publicJSON, err := json.Marshal(public)
	require.NoError(t, err)
	require.Contains(t, string(publicJSON), "Live announcement")
	require.NotContains(t, string(publicJSON), "Unpublished announcement")

	_, err = svc.PublishStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{ExpectedVersion: published.Version, IdempotencyKey: "design-phase1-stale"})
	require.ErrorIs(t, err, finance.ErrStorefrontDesignVersionConflict)
	invalid := draft
	invalid.ExpectedVersion = draftView.Version
	invalid.IdempotencyKey = "design-phase1-invalid"
	invalid.Sections = []finance.StorefrontSection{{ID: "bad", Type: "announcement", Enabled: true, Content: map[string]any{"not_allowed": "value"}}}
	_, err = svc.SaveStorefrontDesignDraft(ctx, ws, user, invalid)
	require.Error(t, err)

	discarded, err := svc.DiscardStorefrontDesign(ctx, ws, user, finance.StorefrontDesignCommandInput{ExpectedVersion: draftView.Version, IdempotencyKey: "design-phase1-discard"})
	require.NoError(t, err)
	require.Equal(t, string(discarded.PublishedSections), string(discarded.DraftSections))
}
