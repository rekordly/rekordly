package finance

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterPublicStorefrontRoutes(g *gin.RouterGroup) {
	h.RegisterStorefrontPaymentWebhookRoutes(g)
	g.GET("/public/storefronts/by-host", h.getPublicStorefrontByHost)
	g.GET("/public/storefronts/:slug", h.getPublicStorefront)
	g.GET("/public/storefronts/:slug/products/:productId", h.getPublicStorefrontProduct)
	g.POST("/public/storefronts/:slug/carts/validate", h.validatePublicCart)
	g.GET("/public/storefronts/:slug/carts/:token", h.getPublicCart)
	g.POST("/public/storefronts/:slug/carts", h.upsertPublicCart)
	g.POST("/public/storefronts/:slug/checkout", h.submitGuestCheckout)
	g.POST("/public/storefronts/:slug/analytics/checkout-started", h.trackPublicCheckoutStarted)

	g.GET("/public/orders/:token", h.getPublicOrderStatus)
	g.POST("/public/orders/:token/verify-payment", h.verifyPublicOrderPayment)
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
	proj, err := h.service.GetPublicStorefrontProjection(storefrontRequestContext(c), host, true, c.Query("q"), c.Query("collection"))
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"storefront": proj}})
}

func (h *Handler) getPublicStorefront(c *gin.Context) {
	proj, err := h.service.GetPublicStorefrontProjection(storefrontRequestContext(c), c.Param("slug"), false, c.Query("q"), c.Query("collection"))
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"storefront": proj}})
}

func (h *Handler) getPublicStorefrontProduct(c *gin.Context) {
	ctx := storefrontRequestContext(c)
	proj, err := h.service.GetPublicStorefrontProjection(ctx, c.Param("slug"), false, "", "")
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
	h.service.TrackStorefrontProductView(ctx, proj, matches[0].ID)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"product": matches[0], "variants": matches, "storefront": proj}})
}

func storefrontRequestContext(c *gin.Context) context.Context {
	class := "direct"
	if referer := c.Request.Referer(); referer != "" {
		if parsed, err := url.Parse(referer); err == nil {
			host := strings.ToLower(parsed.Hostname())
			switch {
			case strings.Contains(host, "whatsapp"):
				class = "whatsapp"
			case strings.Contains(host, "instagram"):
				class = "instagram"
			case strings.Contains(host, "facebook"):
				class = "facebook"
			case strings.Contains(host, "tiktok"):
				class = "tiktok"
			case strings.Contains(host, "google"):
				class = "google"
			case strings.Contains(host, "bing"):
				class = "bing"
			case strings.Contains(host, "youtube"):
				class = "youtube"
			case host != "":
				class = "other"
			}
		}
	}
	visitor, cookieErr := c.Cookie("rekordly_store_visitor")
	if cookieErr != nil || strings.TrimSpace(visitor) == "" {
		visitor, _ = randomHexToken(24)
		c.SetSameSite(http.SameSiteLaxMode)
		c.SetCookie("rekordly_store_visitor", visitor, 365*24*60*60, "/api/v1/public/storefronts", "", c.Request.TLS != nil, true)
	}
	ctx := context.WithValue(c.Request.Context(), storefrontReferrerContextKey{}, class)
	return context.WithValue(ctx, storefrontVisitorContextKey{}, hashOpaqueToken(visitor))
}

func (h *Handler) trackPublicCheckoutStarted(c *gin.Context) {
	if err := h.service.TrackStorefrontCheckoutStarted(storefrontRequestContext(c), c.Param("slug")); err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"tracked": true}})
}

func (h *Handler) validatePublicCart(c *gin.Context) {
	var in struct {
		Lines          []CartLineInput `json:"lines"`
		DeliveryMethod string          `json:"delivery_method"`
		DeliveryAreaID int64           `json:"delivery_area_id"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	cart, _, err := h.service.ValidateAndRecalculateCartWithArea(c.Request.Context(), c.Param("slug"), false, in.Lines, in.DeliveryMethod, in.DeliveryAreaID)
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
		DeliveryAreaID int64           `json:"delivery_area_id"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	cart, err := h.service.UpsertVisitorCartWithArea(c.Request.Context(), c.Param("slug"), in.CartToken, in.Lines, in.DeliveryMethod, in.DeliveryAreaID)
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

func (h *Handler) verifyPublicOrderPayment(c *gin.Context) {
	order, err := h.service.VerifyPublicOrderPayment(c.Request.Context(), c.Param("token"))
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
	areaID, _ := strconv.ParseInt(c.Query("delivery_area_id"), 10, 64)
	cart, err := h.service.GetVisitorCartWithArea(c.Request.Context(), c.Param("slug"), c.Param("token"), c.Query("delivery_method"), areaID)
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
