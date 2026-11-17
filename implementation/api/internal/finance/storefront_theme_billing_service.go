package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/rekordly/rekordly-api/internal/db"
)

func (s *Service) CreateStorefrontThemeCheckout(ctx context.Context, workspaceID, actorUserID int64, themeKey, idempotencyKey string) (db.CheckoutIntent, error) {
	themeKey = strings.ToLower(strings.TrimSpace(themeKey))
	if themeKey != "bold" && themeKey != "market" && themeKey != "studio" {
		return db.CheckoutIntent{}, errors.New("choose a paid storefront theme")
	}
	subject, _, err := s.ResolveSubjectForWorkspace(ctx, workspaceID)
	if err != nil {
		return db.CheckoutIntent{}, err
	}
	var planVersionID int64
	err = s.pool.QueryRow(ctx, `
		SELECT id FROM plan_versions
		WHERE is_addon AND addon_type=$1 AND billing_interval='once' AND is_available AND price_minor > 0
		  AND (effective_to IS NULL OR effective_to > now())
		ORDER BY version DESC, id DESC LIMIT 1`, "storefront_theme_"+themeKey).Scan(&planVersionID)
	if err != nil {
		return db.CheckoutIntent{}, fmt.Errorf("theme billing price is not configured: %w", err)
	}
	return s.CreateCheckoutIntent(ctx, subject.ID, actorUserID, idempotencyKey, CreateCheckoutInput{PlanVersionID: planVersionID})
}
