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
}

type WorkspaceContext struct {
	WorkspaceID int64
	UserID      int64
	RoleCode    string
	IsOwner     bool
	Kind        string
}

func AuthAndWorkspaceMiddleware(pool *pgxpool.Pool, authValidator AuthSessionValidator) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionToken := extractSessionToken(c)
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
		})
		c.Next()
	}
}

func extractSessionToken(c *gin.Context) string {
	if cookie, err := c.Cookie("rekordly_session"); err == nil && cookie != "" {
		return cookie
	}
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}
	return ""
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
