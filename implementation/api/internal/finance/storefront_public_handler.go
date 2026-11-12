package finance

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterPublicStorefrontRoutes(g *gin.RouterGroup) {
	g.GET("/public/storefronts/by-host", h.getPublicStorefrontByHost)
	g.GET("/public/storefronts/:slug", h.getPublicStorefront)
	g.GET("/public/storefronts/:slug/products/:productId", h.getPublicStorefrontProduct)
	g.POST("/public/storefronts/:slug/carts/validate", h.validatePublicCart)
	g.GET("/public/storefronts/:slug/carts/:token", h.getPublicCart)
	g.POST("/public/storefronts/:slug/carts", h.upsertPublicCart)
	g.POST("/public/storefronts/:slug/checkout", h.submitGuestCheckout)

	g.GET("/public/orders/:token", h.getPublicOrderStatus)
	g.POST("/public/orders/:token/messages", h.postPublicOrderMessage)
	g.POST("/public/orders/:token/acknowledge", h.acknowledgePublicOrderChanges)
	g.POST("/public/orders/:token/cancel", h.cancelPublicOrderBeforeConfirm)
	g.POST("/public/orders/:token/return-request", h.requestPublicOrderReturn)
}

func (h *Handler) getPublicStorefrontByHost(c *gin.Context) {
	host := c.Query("host")
	if strings.TrimSpace(host) == "" {
		host = c.Request.Host
	}
	proj, err := h.service.GetPublicStorefrontProjection(c.Request.Context(), host, true, c.Query("q"), c.Query("collection"))
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"storefront": proj}})
}

func (h *Handler) getPublicStorefront(c *gin.Context) {
	proj, err := h.service.GetPublicStorefrontProjection(c.Request.Context(), c.Param("slug"), false, c.Query("q"), c.Query("collection"))
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"storefront": proj}})
}

func (h *Handler) getPublicStorefrontProduct(c *gin.Context) {
	proj, err := h.service.GetPublicStorefrontProjection(c.Request.Context(), c.Param("slug"), false, "", "")
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	id, _ := strconv.ParseInt(c.Param("productId"), 10, 64)
	var matches []PublicProductView
	for _, p := range proj.Products {
		if p.ID == id || p.ProductID == id {
			matches = append(matches, p)
		}
	}
	if len(matches) == 0 {
		h.storefrontError(c, ErrProductNotPublished)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"product": matches[0], "variants": matches, "storefront": proj}})
}

func (h *Handler) validatePublicCart(c *gin.Context) {
	var in struct {
		Lines          []CartLineInput `json:"lines"`
		DeliveryMethod string          `json:"delivery_method"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	cart, _, err := h.service.ValidateAndRecalculateCart(c.Request.Context(), c.Param("slug"), false, in.Lines, in.DeliveryMethod)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"cart": cart}})
}

func (h *Handler) upsertPublicCart(c *gin.Context) {
	var in struct {
		CartToken      string          `json:"cart_token"`
		Lines          []CartLineInput `json:"lines"`
		DeliveryMethod string          `json:"delivery_method"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	cart, err := h.service.UpsertVisitorCart(c.Request.Context(), c.Param("slug"), in.CartToken, in.Lines, in.DeliveryMethod)
	if err != nil {
		if len(cart.Lines) > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "CART_ITEM_CHANGED", "message": err.Error()}, "data": gin.H{"cart": cart}})
			return
		}
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"cart": cart}})
}

func (h *Handler) submitGuestCheckout(c *gin.Context) {
	var in GuestCheckoutInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	in.ClientKey = c.ClientIP()
	res, err := h.service.SubmitGuestCheckout(c.Request.Context(), c.Param("slug"), false, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"order": res}})
}

func (h *Handler) getPublicOrderStatus(c *gin.Context) {
	order, err := h.service.GetPublicOrderStatus(c.Request.Context(), c.Param("token"))
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) postPublicOrderMessage(c *gin.Context) {
	var in struct {
		Message string `json:"message"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	order, err := h.service.PostPublicOrderMessage(c.Request.Context(), c.Param("token"), in.Message)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) acknowledgePublicOrderChanges(c *gin.Context) {
	var in struct {
		ExpectedVersion int32 `json:"expected_version"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	order, err := h.service.AcknowledgePublicOrderChanges(c.Request.Context(), c.Param("token"), in.ExpectedVersion)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) cancelPublicOrderBeforeConfirm(c *gin.Context) {
	var in struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&in)
	order, err := h.service.CancelPublicOrderBeforeConfirm(c.Request.Context(), c.Param("token"), in.Reason)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) getPublicCart(c *gin.Context) {
	cart, err := h.service.GetVisitorCart(c.Request.Context(), c.Param("slug"), c.Param("token"), c.Query("delivery_method"))
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"cart": cart}})
}

func (h *Handler) requestPublicOrderReturn(c *gin.Context) {
	var in struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&in)
	order, err := h.service.RequestPublicOrderReturn(c.Request.Context(), c.Param("token"), in.Reason)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}
