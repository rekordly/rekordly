package finance

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// ShopperSessionHeader is the server-to-server header used by the Next.js same-origin proxy
// to forward the host-only rekordly_shopper_session cookie value to the Go API.
const ShopperSessionHeader = "X-Shopper-Session-Token"

func (h *Handler) registerPublicShopperRoutes(g *gin.RouterGroup) {
	g.POST("/public/shopper/code", h.requestShopperCode)
	g.POST("/public/shopper/verify", h.verifyShopperCode)
	g.GET("/public/shopper/me", h.getShopperMe)
	g.GET("/public/shopper/orders", h.listShopperOrders)
	g.POST("/public/shopper/logout", h.logoutShopper)
}

func readShopperSessionHeader(c *gin.Context) string {
	return strings.TrimSpace(c.GetHeader(ShopperSessionHeader))
}

func (h *Handler) requestShopperCode(c *gin.Context) {
	var in struct {
		Email     string `json:"email"`
		StoreSlug string `json:"store_slug"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	msg, err := h.service.RequestShopperLoginCode(c.Request.Context(), in.Email, in.StoreSlug, c.ClientIP())
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": msg}})
}

func (h *Handler) verifyShopperCode(c *gin.Context) {
	var in VerifyShopperLoginInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	sessToken, shopper, err := h.service.VerifyShopperLogin(c.Request.Context(), in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"shopper": shopper, "session_token": sessToken}})
}

func (h *Handler) getShopperMe(c *gin.Context) {
	shopper, err := h.service.GetShopperProfile(c.Request.Context(), readShopperSessionHeader(c))
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"shopper": shopper}})
}

func (h *Handler) listShopperOrders(c *gin.Context) {
	orders, err := h.service.ListShopperOrdersView(c.Request.Context(), readShopperSessionHeader(c), c.Query("store"))
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"orders": orders}})
}

func (h *Handler) logoutShopper(c *gin.Context) {
	_ = h.service.LogoutShopper(c.Request.Context(), readShopperSessionHeader(c))
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"signed_out": true}})
}
