package finance

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) registerStorefrontDesignRoutes(g *gin.RouterGroup) {
	g.GET("/storefront/design", h.getStorefrontDesign)
	g.PUT("/storefront/design/draft", h.saveStorefrontDesignDraft)
	g.POST("/storefront/design/publish", h.publishStorefrontDesign)
	g.POST("/storefront/design/discard", h.discardStorefrontDesign)
	g.GET("/storefront/design/preview-data", h.getStorefrontDesignPreview)
}

func (h *Handler) createStorefrontThemeCheckout(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.publish")
	if !ok {
		return
	}
	if _, ok := businessPermission(c, "billing.purchase_addon"); !ok {
		return
	}
	intent, err := h.service.CreateStorefrontThemeCheckout(c.Request.Context(), ws.WorkspaceID, ws.UserID, c.Param("themeKey"), c.GetHeader("Idempotency-Key"))
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"checkout_intent": intent}})
}

func (h *Handler) getStorefrontDesign(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.view", "storefront.manage_appearance")
	if !ok {
		return
	}
	design, err := h.service.GetStorefrontDesign(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"design": design}})
}

func (h *Handler) saveStorefrontDesignDraft(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_appearance")
	if !ok {
		return
	}
	var input StorefrontDesignInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if strings.TrimSpace(input.IdempotencyKey) == "" {
		input.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	design, err := h.service.SaveStorefrontDesignDraft(c.Request.Context(), ws.WorkspaceID, ws.UserID, input)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"design": design}})
}

func (h *Handler) publishStorefrontDesign(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.publish")
	if !ok {
		return
	}
	var input StorefrontDesignCommandInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if strings.TrimSpace(input.IdempotencyKey) == "" {
		input.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	design, err := h.service.PublishStorefrontDesign(c.Request.Context(), ws.WorkspaceID, ws.UserID, input)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"design": design}})
}

func (h *Handler) discardStorefrontDesign(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_appearance")
	if !ok {
		return
	}
	var input StorefrontDesignCommandInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if strings.TrimSpace(input.IdempotencyKey) == "" {
		input.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	design, err := h.service.DiscardStorefrontDesign(c.Request.Context(), ws.WorkspaceID, ws.UserID, input)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"design": design}})
}

func (h *Handler) getStorefrontDesignPreview(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.view", "storefront.manage_appearance")
	if !ok {
		return
	}
	design, err := h.service.GetStorefrontDesign(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	preview, err := h.service.GetStorefrontDesignPreview(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"design": design, "storefront": preview}})
}
