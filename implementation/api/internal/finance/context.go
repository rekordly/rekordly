package finance

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rekordly/rekordly-api/internal/auth"
)

const (
	ContextUserIDKey    = "auth_user_id"
	ContextWorkspaceKey = "auth_workspace"
)

type AuthSessionValidator interface {
	CurrentUser(ctx context.Context, rawSession string) (auth.CurrentUser, error)
	VerifySessionCSRF(ctx context.Context, rawSession, csrfToken string) error
}

type WorkspaceContext struct {
	WorkspaceID int64
	UserID      int64
	RoleCode    string
	IsOwner     bool
	Kind        string
	Permissions []string
	OutletScope map[string]any
}

func (w WorkspaceContext) HasPermission(code string) bool {
	if w.IsOwner || w.RoleCode == "owner" {
		return true
	}
	for _, p := range w.Permissions {
		if p == "*" || p == code {
			return true
		}
	}
	return false
}

func parseScopeInt64(raw any) (int64, bool) {
	switch v := raw.(type) {
	case float64:
		if int64(v) > 0 {
			return int64(v), true
		}
	case int64:
		if v > 0 {
			return v, true
		}
	case int:
		if v > 0 {
			return int64(v), true
		}
	case string:
		if id, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64); err == nil && id > 0 {
			return id, true
		}
	}
	return 0, false
}

func (w WorkspaceContext) ScopedOutletIDs() []int64 {
	if w.IsOwner || len(w.OutletScope) == 0 {
		return nil
	}
	var ids []int64
	seen := map[int64]bool{}
	if raw, ok := w.OutletScope["outlet_id"]; ok {
		if id, ok2 := parseScopeInt64(raw); ok2 && !seen[id] {
			ids = append(ids, id)
			seen[id] = true
		}
	}
	if rawList, ok := w.OutletScope["outlet_ids"].([]any); ok {
		for _, item := range rawList {
			if id, ok2 := parseScopeInt64(item); ok2 && !seen[id] {
				ids = append(ids, id)
				seen[id] = true
			}
		}
	}
	return ids
}

func (w WorkspaceContext) ScopedOutletID() *int64 {
	ids := w.ScopedOutletIDs()
	if len(ids) > 0 {
		id := ids[0]
		return &id
	}
	return nil
}

func (w WorkspaceContext) IsOutletAllowed(outletID int64) bool {
	if outletID <= 0 {
		return true
	}
	scoped := w.ScopedOutletIDs()
	if len(scoped) == 0 {
		return true
	}
	for _, id := range scoped {
		if id == outletID {
			return true
		}
	}
	return false
}

func requirePermission(c *gin.Context, codes ...string) (WorkspaceContext, bool) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return WorkspaceContext{}, false
	}
	for _, code := range codes {
		if wsCtx.HasPermission(code) {
			return wsCtx, true
		}
	}
	c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "You do not have permission to perform this action"}})
	return WorkspaceContext{}, false
}

func businessPermission(c *gin.Context, codes ...string) (WorkspaceContext, bool) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return WorkspaceContext{}, false
	}
	if len(codes) == 0 {
		return wsCtx, true
	}
	for _, code := range codes {
		if wsCtx.HasPermission(code) {
			return wsCtx, true
		}
	}
	c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "You do not have permission to perform this action"}})
	return WorkspaceContext{}, false
}

func AuthAndWorkspaceMiddleware(pool *pgxpool.Pool, authValidator AuthSessionValidator) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionToken, viaCookie := extractSessionToken(c)
		if sessionToken == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"code":    "UNAUTHORIZED",
					"message": "Missing or invalid session",
				},
			})
			return
		}

		user, err := authValidator.CurrentUser(c.Request.Context(), sessionToken)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"code":    "UNAUTHORIZED",
					"message": "Session expired or invalid",
				},
			})
			return
		}

		// Browsers attach cookies on their own, so a cookie-authenticated write
		// must also prove it came from our app. Bearer tokens are sent deliberately.
		if viaCookie && isUnsafeMethod(c.Request.Method) {
			if err := authValidator.VerifySessionCSRF(c.Request.Context(), sessionToken, c.GetHeader("X-CSRF-Token")); err != nil {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
					"error": gin.H{
						"code":    "CSRF_INVALID",
						"message": "This request could not be verified. Refresh the page and try again.",
					},
				})
				return
			}
		}

		workspaceIDStr := resolveWorkspaceIDString(c)
		if workspaceIDStr == "" {
			// If exactly one workspace exists, use that workspace by default
			if len(user.Workspaces) == 1 {
				ws := user.Workspaces[0]
				c.Set(ContextUserIDKey, user.ID)
				c.Set(ContextWorkspaceKey, WorkspaceContext{
					WorkspaceID: ws.ID,
					UserID:      user.ID,
					RoleCode:    ws.RoleCode,
					IsOwner:     ws.IsOwner,
					Kind:        ws.Kind,
					Permissions: ws.Permissions,
					OutletScope: ws.OutletScope,
				})
				c.Next()
				return
			}
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error": gin.H{
					"code":    "WORKSPACE_REQUIRED",
					"message": "A workspace ID must be provided via X-Workspace-ID header or workspace_id query parameter",
				},
			})
			return
		}

		workspaceID, err := strconv.ParseInt(workspaceIDStr, 10, 64)
		if err != nil || workspaceID <= 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error": gin.H{
					"code":    "INVALID_WORKSPACE_ID",
					"message": "Invalid workspace ID",
				},
			})
			return
		}

		// Verify membership
		var authorizedWS *auth.AuthorizedWorkspace
		for i := range user.Workspaces {
			if user.Workspaces[i].ID == workspaceID {
				authorizedWS = &user.Workspaces[i]
				break
			}
		}

		if authorizedWS == nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{
					"code":    "FORBIDDEN",
					"message": "Access to requested workspace is forbidden",
				},
			})
			return
		}

		c.Set(ContextUserIDKey, user.ID)
		c.Set(ContextWorkspaceKey, WorkspaceContext{
			WorkspaceID: authorizedWS.ID,
			UserID:      user.ID,
			RoleCode:    authorizedWS.RoleCode,
			IsOwner:     authorizedWS.IsOwner,
			Kind:        authorizedWS.Kind,
			Permissions: authorizedWS.Permissions,
			OutletScope: authorizedWS.OutletScope,
		})
		c.Next()
	}
}

func extractSessionToken(c *gin.Context) (token string, viaCookie bool) {
	if cookie, err := c.Cookie("rekordly_session"); err == nil && cookie != "" {
		return cookie, true
	}
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer "), false
	}
	return "", false
}

func isUnsafeMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	default:
		return true
	}
}

func resolveWorkspaceIDString(c *gin.Context) string {
	if ws := c.GetHeader("X-Workspace-ID"); ws != "" {
		return strings.TrimSpace(ws)
	}
	if ws := c.Query("workspace_id"); ws != "" {
		return strings.TrimSpace(ws)
	}
	if ws := c.Param("workspace_id"); ws != "" {
		return strings.TrimSpace(ws)
	}
	return ""
}

func GetWorkspaceContext(c *gin.Context) (WorkspaceContext, error) {
	val, exists := c.Get(ContextWorkspaceKey)
	if !exists {
		return WorkspaceContext{}, errors.New("workspace context missing")
	}
	wsCtx, ok := val.(WorkspaceContext)
	if !ok {
		return WorkspaceContext{}, errors.New("invalid workspace context")
	}
	return wsCtx, nil
}
