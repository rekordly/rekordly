package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/catalogue"
	"github.com/rekordly/rekordly-api/internal/db"
)

func (h *Handler) RegisterBlueprint18Routes(publicV1, protected *gin.RouterGroup) {
	publicV1.GET("/catalogue", h.getCatalogueMetadata)

	ws := protected.Group("/workspaces/:id")
	{
		ws.GET("/review-items", h.listReviewItems)
		ws.POST("/review-items/:reviewId/commands/start", h.startReviewItem)
		ws.POST("/review-items/:reviewId/commands/dismiss", h.dismissReviewItem)
	}
}

func (h *Handler) getCatalogueMetadata(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"commands":               catalogue.Commands,
			"events":                 catalogue.Events,
			"jobs":                   catalogue.Jobs,
			"review_item_types":      catalogue.ReviewItemTypes,
			"notification_templates": catalogue.NotificationTemplates,
			"error_codes":            catalogue.ErrorCodes,
			"state_machines":         catalogue.AllStateMachines(),
		},
	})
}

func (h *Handler) listReviewItems(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}
	items, err := h.service.queries.ListReviewItemsByWorkspace(c.Request.Context(), db.ListReviewItemsByWorkspaceParams{
		WorkspaceID: wsCtx.WorkspaceID,
		Limit:       50,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) startReviewItem(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}
	rid, _ := strconv.ParseInt(c.Param("reviewId"), 10, 64)
	item, err := h.service.TransitionReviewItem(c.Request.Context(), wsCtx.WorkspaceID, rid, "in_progress", "")
	if err != nil {
		writeReviewTransitionError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": item})
}

func (h *Handler) dismissReviewItem(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}
	rid, _ := strconv.ParseInt(c.Param("reviewId"), 10, 64)
	item, err := h.service.TransitionReviewItem(c.Request.Context(), wsCtx.WorkspaceID, rid, "dismissed", "user_dismissed")
	if err != nil {
		writeReviewTransitionError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": item})
}

func writeReviewTransitionError(c *gin.Context, err error) {
	var transErr *catalogue.InvalidTransitionError
	if errors.As(err, &transErr) {
		c.JSON(http.StatusConflict, gin.H{"error": transErr})
		return
	}
	if errors.Is(err, ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "review item not found"}})
		return
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "REVIEW_ERROR", "message": err.Error()}})
}
