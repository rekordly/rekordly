package finance

import (
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) registerStorefrontShippingRoutes(g *gin.RouterGroup) {
	g.GET("/storefront/shipping/shipbubble", h.getStorefrontShipbubbleSettings)
	g.PATCH("/storefront/shipping/shipbubble", h.updateStorefrontShipbubbleSettings)
	g.POST("/storefront/shipping/shipbubble/test", h.testStorefrontShipbubbleConnection)
	g.POST("/storefront/orders/:id/commands/retry-courier-booking", h.retryStorefrontCourierBooking)
}

func (h *Handler) RegisterStorefrontShippingWebhookRoutes(g *gin.RouterGroup) {
	g.POST("/webhooks/shipbubble", h.shipbubbleWebhook)
}

func (h *Handler) getStorefrontShipbubbleSettings(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_checkout", "storefront.view")
	if !ok {
		return
	}
	res, err := h.service.GetStorefrontShipbubbleSettings(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) updateStorefrontShipbubbleSettings(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_checkout")
	if !ok {
		return
	}
	var in UpdateStorefrontShipbubbleSettingsInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.UpdateStorefrontShipbubbleSettings(c.Request.Context(), ws.WorkspaceID, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) testStorefrontShipbubbleConnection(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_checkout")
	if !ok {
		return
	}
	var in struct {
		APIKey string `json:"api_key"`
	}
	_ = c.ShouldBindJSON(&in)
	couriers, err := h.service.TestStorefrontShipbubbleConnection(c.Request.Context(), ws.WorkspaceID, in.APIKey)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"couriers": couriers}})
}

func (h *Handler) retryStorefrontCourierBooking(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.fulfil", "storefront.manage_checkout")
	if !ok {
		return
	}
	orderID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || orderID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": "invalid order id"}})
		return
	}
	order, err := h.service.RetryStorefrontOrderCourierBooking(c.Request.Context(), ws.WorkspaceID, orderID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) getPublicDeliveryRates(c *gin.Context) {
	var in PublicDeliveryRatesInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.GetPublicDeliveryRates(storefrontRequestContext(c), c.Param("slug"), false, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) shipbubbleWebhook(c *gin.Context) {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unable to read body"})
		return
	}
	if err := h.service.HandleShipbubbleWebhook(c.Request.Context(), raw, c.Request.Header); err != nil {
		if err == ErrInvalidWebhookSignature {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "received"})
}
