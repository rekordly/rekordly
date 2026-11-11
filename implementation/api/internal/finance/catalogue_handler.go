package finance

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterCatalogueRoutes(protected *gin.RouterGroup) {
	protected.POST("/catalogue/items", h.createCatalogueItem)
	protected.GET("/catalogue/items", h.listCatalogueItems)
}

func (h *Handler) createCatalogueItem(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateCatalogueItemInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	item, err := h.service.CreateCatalogueItem(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		code := "CREATE_CATALOGUE_ITEM_FAILED"
		if errors.Is(err, ErrDuplicateIdempotent) {
			code = "IDEMPOTENCY_CONFLICT"
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"item": item}})
}

func (h *Handler) listCatalogueItems(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var filter ListCatalogueItemsFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}
	items, err := h.service.ListCatalogueItems(c.Request.Context(), wsCtx.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list catalogue items"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"items": items}})
}

func businessWorkspace(c *gin.Context) (WorkspaceContext, bool) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return WorkspaceContext{}, false
	}
	if wsCtx.Kind != "business" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "BUSINESS_WORKSPACE_REQUIRED", "message": "This feature is only available in a Business workspace"}})
		return WorkspaceContext{}, false
	}
	return wsCtx, true
}
