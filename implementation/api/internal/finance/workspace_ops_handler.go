package finance

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

func (h *Handler) RegisterWorkspaceOpsRoutes(protected *gin.RouterGroup) {
	protected.GET("/settings/workspace", h.getWorkspaceSettings)
	protected.PATCH("/settings/workspace", h.updateWorkspaceSettings)
	protected.GET("/settings/team", h.getWorkspaceTeam)
	protected.PATCH("/settings/team/roles/:roleId/permissions", h.updateRolePermissions)

	protected.GET("/notifications", h.listNotifications)
	protected.POST("/notifications/:id/read", h.markNotificationRead)
	protected.POST("/notifications/read-all", h.markAllNotificationsRead)

	protected.GET("/onboarding/checklist", h.getOnboardingChecklist)
}

func (h *Handler) getWorkspaceSettings(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	profile, err := h.service.queries.GetWorkspaceProfile(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"workspace": profile}})
}

func (h *Handler) updateWorkspaceSettings(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}
	if !wsCtx.HasPermission("settings.manage") {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "You do not have permission to update workspace settings"}})
		return
	}

	var in struct {
		Name         string `json:"name" binding:"required"`
		Timezone     string `json:"timezone" binding:"required"`
		BusinessType string `json:"business_type"`
		Country      string `json:"country"`
		Address      string `json:"address"`
		ContactPhone string `json:"contact_phone"`
		ContactEmail string `json:"contact_email"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	updated, err := h.service.queries.UpdateWorkspaceProfile(c.Request.Context(), db.UpdateWorkspaceProfileParams{
		ID:           wsCtx.WorkspaceID,
		Name:         in.Name,
		Timezone:     in.Timezone,
		BusinessType: optionalPgText(in.BusinessType),
		Country:      optionalPgText(in.Country),
		Address:      optionalPgText(in.Address),
		ContactPhone: optionalPgText(in.ContactPhone),
		ContactEmail: optionalPgText(in.ContactEmail),
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "UPDATE_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"workspace": updated}})
}

func (h *Handler) getWorkspaceTeam(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	members, err := h.service.queries.ListWorkspaceMembers(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	roles, err := h.service.queries.ListWorkspaceRoles(c.Request.Context(), pgtype.Int8{Int64: wsCtx.WorkspaceID, Valid: true})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	type roleWithPerms struct {
		db.ListWorkspaceRolesRow
		Permissions []string `json:"permissions"`
	}
	roleList := make([]roleWithPerms, 0, len(roles))
	for _, r := range roles {
		perms, _ := h.service.queries.ListRolePermissions(c.Request.Context(), r.ID)
		if perms == nil {
			perms = []string{}
		}
		roleList = append(roleList, roleWithPerms{
			ListWorkspaceRolesRow: r,
			Permissions:           perms,
		})
	}

	invitations, _ := h.service.queries.ListWorkspaceInvitations(c.Request.Context(), wsCtx.WorkspaceID)

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"members":     members,
			"roles":       roleList,
			"invitations": invitations,
		},
	})
}

func (h *Handler) updateRolePermissions(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}
	if !wsCtx.IsOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Only workspace owners can edit role permissions"}})
		return
	}

	roleID, err := strconv.ParseInt(c.Param("roleId"), 10, 64)
	if err != nil || roleID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid role ID"}})
		return
	}

	var in struct {
		Permissions []string `json:"permissions" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	// Verify role belongs to this workspace (and cannot edit system/owner wildcard safety)
	var ownerCode string
	var wsID pgtype.Int8
	if err := h.service.pool.QueryRow(c.Request.Context(), `SELECT code, workspace_id FROM roles WHERE id = $1`, roleID).Scan(&ownerCode, &wsID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Role not found"}})
		return
	}
	if !wsID.Valid || wsID.Int64 != wsCtx.WorkspaceID || ownerCode == "owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Cannot modify system or owner role permissions"}})
		return
	}

	if _, err := h.service.pool.Exec(c.Request.Context(), `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "UPDATE_FAILED", "message": err.Error()}})
		return
	}
	for _, code := range in.Permissions {
		if code == "" || code == "*" {
			continue
		}
		_ = h.service.queries.AddRolePermission(c.Request.Context(), db.AddRolePermissionParams{
			RoleID:         roleID,
			PermissionCode: code,
		})
	}

	perms, _ := h.service.queries.ListRolePermissions(c.Request.Context(), roleID)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"permissions": perms}})
}

func (h *Handler) listNotifications(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	items, err := h.service.queries.ListNotificationsForUser(c.Request.Context(), db.ListNotificationsForUserParams{
		UserID:      wsCtx.UserID,
		WorkspaceID: pgtype.Int8{Int64: wsCtx.WorkspaceID, Valid: true},
		Limit:       50,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	unread, _ := h.service.queries.CountUnreadNotifications(c.Request.Context(), db.CountUnreadNotificationsParams{
		UserID:      wsCtx.UserID,
		WorkspaceID: pgtype.Int8{Int64: wsCtx.WorkspaceID, Valid: true},
	})

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"notifications": items,
			"unread_count":  unread,
		},
	})
}

func (h *Handler) markNotificationRead(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid notification ID"}})
		return
	}

	item, err := h.service.queries.MarkNotificationRead(c.Request.Context(), db.MarkNotificationReadParams{
		ID:     id,
		UserID: wsCtx.UserID,
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Notification not found"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"notification": item}})
}

func (h *Handler) markAllNotificationsRead(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	if err := h.service.queries.MarkAllNotificationsRead(c.Request.Context(), db.MarkAllNotificationsReadParams{
		UserID:      wsCtx.UserID,
		WorkspaceID: pgtype.Int8{Int64: wsCtx.WorkspaceID, Valid: true},
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"marked_all": true}})
}

func (h *Handler) getOnboardingChecklist(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var acctCount, incomeCount, expenseCount, customerCount, invoiceCount int64
	_ = h.service.pool.QueryRow(c.Request.Context(), `SELECT COUNT(*) FROM money_accounts WHERE workspace_id = $1`, wsCtx.WorkspaceID).Scan(&acctCount)
	_ = h.service.pool.QueryRow(c.Request.Context(), `SELECT (SELECT COUNT(*) FROM money_transactions WHERE workspace_id = $1 AND direction = 'money_in' AND status = 'posted') + (SELECT COUNT(*) FROM sales WHERE workspace_id = $1 AND status IN ('unpaid', 'partially_paid', 'paid'))`, wsCtx.WorkspaceID).Scan(&incomeCount)
	_ = h.service.pool.QueryRow(c.Request.Context(), `SELECT (SELECT COUNT(*) FROM money_transactions WHERE workspace_id = $1 AND direction = 'money_out' AND status = 'posted') + (SELECT COUNT(*) FROM purchases WHERE workspace_id = $1 AND status IN ('unpaid', 'partially_paid', 'paid'))`, wsCtx.WorkspaceID).Scan(&expenseCount)
	_ = h.service.pool.QueryRow(c.Request.Context(), `SELECT COUNT(*) FROM counterparties WHERE workspace_id = $1 AND merged_into_id IS NULL`, wsCtx.WorkspaceID).Scan(&customerCount)
	_ = h.service.pool.QueryRow(c.Request.Context(), `SELECT COUNT(*) FROM invoices WHERE workspace_id = $1`, wsCtx.WorkspaceID).Scan(&invoiceCount)

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"checklist": gin.H{
				"has_account":  acctCount > 0,
				"has_income":   incomeCount > 0,
				"has_expense":  expenseCount > 0,
				"has_customer": customerCount > 0,
				"has_invoice":  invoiceCount > 0,
				"all_done":     acctCount > 0 && incomeCount > 0 && expenseCount > 0 && (wsCtx.Kind != "business" || (customerCount > 0 && invoiceCount > 0)),
			},
		},
	})
}
