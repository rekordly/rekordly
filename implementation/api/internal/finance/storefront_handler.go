package finance

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterStorefrontRoutes(g *gin.RouterGroup) {
	h.registerStorefrontDesignRoutes(g)
	g.POST("/storefront", h.createStorefront)
	g.GET("/storefront", h.getMerchantStorefront)
	g.GET("/storefront/settings", h.getMerchantStorefront)
	g.PATCH("/storefront/settings", h.updateStorefrontSettings)
	g.POST("/storefront/commands/publish", h.publishStorefront)
	g.POST("/storefront/commands/unpublish", h.unpublishStorefront)
	g.POST("/storefront/commands/entitlement", h.setStorefrontEntitlement)
	g.GET("/storefront/collections", h.listStorefrontCollections)
	g.POST("/storefront/collections", func(c *gin.Context) {
		c.JSON(http.StatusGone, gin.H{"error": gin.H{"code": "GONE", "message": "Manage collections from Products."}})
	})
	g.GET("/storefront/products", h.listStorefrontProductCards)
	g.PATCH("/storefront/products/:productId", h.patchStorefrontProduct)
	g.POST("/storefront/products/bulk", h.bulkPatchStorefrontProducts)
	g.GET("/storefront/catalogue", h.listMerchantStorefrontProducts)
	g.PUT("/storefront/catalogue/:variantId", func(c *gin.Context) {
		c.JSON(http.StatusGone, gin.H{"error": gin.H{"code": "GONE", "message": "Manage products from Products."}})
	})
	g.GET("/storefront/domains", h.listStorefrontDomains)
	g.POST("/storefront/domains", h.addCustomDomain)
	g.POST("/storefront/domains/:domainId/commands/recheck", h.recheckCustomDomain)
	g.POST("/storefront/domains/:domainId/commands/disconnect", h.disconnectCustomDomain)
	g.GET("/storefront/analytics", h.getStorefrontAnalytics)
	g.GET("/storefront/overview", h.getStorefrontOverview)
}

func (h *Handler) storefrontError(c *gin.Context, err error) {
	status, code := http.StatusBadRequest, "STOREFRONT_REQUEST_FAILED"
	switch {
	case errors.Is(err, ErrNotFound):
		status, code = http.StatusNotFound, "NOT_FOUND"
	case errors.Is(err, ErrStorefrontNotPublished):
		status, code = http.StatusNotFound, "STOREFRONT_NOT_PUBLISHED"
	case errors.Is(err, ErrSlugUnavailable):
		status, code = http.StatusConflict, "SLUG_UNAVAILABLE"
	case errors.Is(err, ErrProductNotPublished):
		status, code = http.StatusNotFound, "PRODUCT_NOT_PUBLISHED"
	case errors.Is(err, ErrCartItemChanged):
		status, code = http.StatusConflict, "CART_ITEM_CHANGED"
	case errors.Is(err, ErrCheckoutRateLimited):
		status, code = http.StatusTooManyRequests, "CHECKOUT_RATE_LIMITED"
	case errors.Is(err, ErrOrderVersionConflict):
		status, code = http.StatusConflict, "ORDER_VERSION_CONFLICT"
	case errors.Is(err, ErrStorefrontDesignVersionConflict):
		status, code = http.StatusConflict, "STOREFRONT_DESIGN_VERSION_CONFLICT"
	case errors.Is(err, ErrDuplicateIdempotent):
		status, code = http.StatusConflict, "IDEMPOTENCY_KEY_REUSED"
	case errors.Is(err, ErrOrderAlreadyHandled):
		status, code = http.StatusConflict, "ORDER_ALREADY_HANDLED"
	case errors.Is(err, ErrInsufficientStock):
		status, code = http.StatusConflict, "INSUFFICIENT_STOCK"
	case errors.Is(err, ErrReservationNotActive):
		status, code = http.StatusConflict, "RESERVATION_CONFLICT"
	case errors.Is(err, ErrDomainInvalid):
		status, code = http.StatusBadRequest, "DOMAIN_INVALID"
	case errors.Is(err, ErrDomainAlreadyClaimed):
		status, code = http.StatusConflict, "DOMAIN_ALREADY_CLAIMED"
	case errors.Is(err, ErrStorefrontEntitlementLocked):
		status, code = http.StatusPaymentRequired, "STOREFRONT_ENTITLEMENT_REQUIRED"
	case errors.Is(err, ErrForbiddenParty):
		status, code = http.StatusForbidden, "FORBIDDEN"
	}
	c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
}

func (h *Handler) createStorefront(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_appearance", "storefront.publish")
	if !ok {
		return
	}
	var in CreateStorefrontInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	sf, err := h.service.CreateStorefront(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"storefront": sf}})
}

func (h *Handler) getMerchantStorefront(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.view", "storefront.manage_appearance", "storefront.manage_checkout", "storefront.manage_catalogue", "storefront.publish")
	if !ok {
		return
	}
	sf, err := h.service.GetMerchantStorefront(c.Request.Context(), ws.WorkspaceID)
	if errors.Is(err, ErrNotFound) {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"storefront": nil}})
		return
	}
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"storefront": sf}})
}

func (h *Handler) updateStorefrontSettings(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_appearance", "storefront.manage_checkout")
	if !ok {
		return
	}
	var patch map[string]json.RawMessage
	if err := c.ShouldBindJSON(&patch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	var card string
	if err := json.Unmarshal(patch["card"], &card); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "A settings card is required."}})
		return
	}
	cardFields := map[string]map[string]bool{
		"details":  {"name": true, "slug": true, "contact_phone": true, "contact_email": true, "whatsapp_number": true, "address": true, "business_hours": true},
		"delivery": {"delivery_methods": true, "delivery_guidance": true, "default_delivery_fee": true, "delivery_areas": true, "free_delivery_threshold": true},
		"payments": {"checkout_require_email": true, "checkout_require_phone": true, "reservation_ttl_hours": true},
		"shoppers": {"tagline": true, "description": true, "logo_url": true, "banner_url": true, "auto_show_new_products": true, "show_sold_out": true, "show_stock_count": true, "low_stock_threshold": true},
		"policies": {"return_policy": true, "privacy_policy": true, "terms_policy": true, "custom_policy": true},
		"sharing":  {"seo_title": true, "seo_description": true, "seo_image_url": true, "seo_indexable": true},
	}
	allowed, ok := cardFields[card]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Unknown settings card."}})
		return
	}
	for key := range patch {
		if key != "card" && key != "idempotency_key" && !allowed[key] {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "This field does not belong to the selected settings card."}})
			return
		}
	}
	var idempotencyKey string
	if err := json.Unmarshal(patch["idempotency_key"], &idempotencyKey); err != nil || strings.TrimSpace(idempotencyKey) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "An idempotency key is required."}})
		return
	}
	// Settings cards send only their own fields. Merge the patch with the current
	// values so the existing full-row update remains atomic without clearing other cards.
	current, err := h.service.GetMerchantStorefront(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	base := map[string]any{
		"name": current.Name, "slug": current.Slug, "theme_key": current.ThemeKey,
		"tagline": current.Settings.Tagline, "description": current.Settings.Description,
		"logo_url": current.Settings.LogoURL, "banner_url": current.Settings.BannerURL,
		"primary_color": current.Settings.PrimaryColor, "accent_color": current.Settings.AccentColor,
		"background_color": current.Settings.BackgroundColor, "text_color": current.Settings.TextColor,
		"font_family": current.Settings.FontFamily, "section_order": current.Settings.SectionOrder,
		"contact_phone": current.Settings.ContactPhone, "contact_email": current.Settings.ContactEmail,
		"whatsapp_number": current.Settings.WhatsappNumber, "address": current.Settings.Address,
		"business_hours": current.Settings.BusinessHours, "social_links": current.Settings.SocialLinks,
		"delivery_methods": current.Settings.DeliveryMethods, "delivery_guidance": current.Settings.DeliveryGuidance,
		"default_delivery_fee":   minorToMajorString(parseMinor(current.Settings.DefaultDeliveryFeeMinor), int(current.CurrencyExponent)),
		"free_delivery_threshold": "",
		"delivery_areas":         []StorefrontDeliveryAreaInput{},
		"checkout_require_email": current.Settings.CheckoutRequireEmail, "checkout_require_phone": current.Settings.CheckoutRequirePhone,
		"return_policy": current.Settings.ReturnPolicy, "privacy_policy": current.Settings.PrivacyPolicy,
		"terms_policy": current.Settings.TermsPolicy, "custom_policy": current.Settings.CustomPolicy,
		"seo_title": current.Settings.SeoTitle, "seo_description": current.Settings.SeoDescription,
		"seo_image_url": current.Settings.SeoImageURL, "seo_indexable": current.Settings.SeoIndexable,
		"auto_show_new_products": current.Settings.AutoShowNewProducts, "show_sold_out": current.Settings.ShowSoldOut,
		"show_stock_count": current.Settings.ShowStockCount, "low_stock_threshold": current.Settings.LowStockThreshold,
	}
	if current.Settings.FreeDeliveryThresholdMinor != nil {
		base["free_delivery_threshold"] = minorToMajorString(parseMinor(*current.Settings.FreeDeliveryThresholdMinor), int(current.CurrencyExponent))
	}
	areas := make([]StorefrontDeliveryAreaInput, 0, len(current.Settings.DeliveryAreas))
	for _, area := range current.Settings.DeliveryAreas {
		if !area.IsActive { continue }
		areas = append(areas, StorefrontDeliveryAreaInput{ID: area.ID, Name: area.Name, Fee: minorToMajorString(parseMinor(area.FeeMinor), int(current.CurrencyExponent)), Description: area.Description})
	}
	base["delivery_areas"] = areas
	for key, value := range patch {
		base[key] = value
	}
	merged, _ := json.Marshal(base)
	var in UpdateStorefrontSettingsInput
	if err := json.Unmarshal(merged, &in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	in.IdempotencyKey = idempotencyKey
	sf, err := h.service.UpdateStorefrontSettings(c.Request.Context(), ws.WorkspaceID, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"storefront": sf}})
}

func parseMinor(value string) int64 {
	minor, _ := strconv.ParseInt(value, 10, 64)
	return minor
}

func (h *Handler) publishStorefront(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.publish")
	if !ok {
		return
	}
	sf, err := h.service.PublishStorefront(c.Request.Context(), ws.WorkspaceID, true)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"storefront": sf}})
}

func (h *Handler) unpublishStorefront(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.publish")
	if !ok {
		return
	}
	sf, err := h.service.PublishStorefront(c.Request.Context(), ws.WorkspaceID, false)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"storefront": sf}})
}

func (h *Handler) setStorefrontEntitlement(c *gin.Context) {
	ws, ok := businessPermission(c, "settings.manage", "storefront.publish")
	if !ok {
		return
	}
	var in struct {
		EntitlementStatus string `json:"entitlement_status"`
		GraceDays         int    `json:"grace_days"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	sf, err := h.service.SetStorefrontEntitlementState(c.Request.Context(), ws.WorkspaceID, strings.TrimSpace(in.EntitlementStatus), in.GraceDays)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"storefront": sf}})
}

func (h *Handler) listStorefrontCollections(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.view", "storefront.manage_catalogue")
	if !ok {
		return
	}
	cols, err := h.service.ListStorefrontCollections(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"collections": cols}})
}

func (h *Handler) createStorefrontCollection(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_catalogue")
	if !ok {
		return
	}
	var in UpsertCollectionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	col, err := h.service.CreateStorefrontCollection(c.Request.Context(), ws.WorkspaceID, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"collection": col}})
}

func (h *Handler) listMerchantStorefrontProducts(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.view", "storefront.manage_catalogue")
	if !ok {
		return
	}
	items, err := h.service.ListMerchantStorefrontProducts(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"products": items}})
}

func (h *Handler) upsertStorefrontProduct(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_catalogue")
	if !ok {
		return
	}
	variantID, err := strconv.ParseInt(c.Param("variantId"), 10, 64)
	if err != nil || variantID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid variant"}})
		return
	}
	var in PublishCatalogueVariantInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	item, err := h.service.UpsertStorefrontProduct(c.Request.Context(), ws.WorkspaceID, variantID, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"product": item}})
}

func (h *Handler) listStorefrontDomains(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.view", "storefront.manage_domain")
	if !ok {
		return
	}
	domains, err := h.service.ListStorefrontDomains(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"domains": domains}})
}

func (h *Handler) addCustomDomain(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_domain")
	if !ok {
		return
	}
	var in struct {
		Hostname string `json:"hostname"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	domain, err := h.service.AddCustomDomain(c.Request.Context(), ws.WorkspaceID, in.Hostname)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"domain": domain}})
}

func (h *Handler) recheckCustomDomain(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_domain")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("domainId"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid domain"}})
		return
	}
	domain, err := h.service.RecheckCustomDomain(c.Request.Context(), ws.WorkspaceID, id)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"domain": domain}})
}

func (h *Handler) disconnectCustomDomain(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_domain")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("domainId"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid domain"}})
		return
	}
	domain, err := h.service.DisconnectCustomDomain(c.Request.Context(), ws.WorkspaceID, id)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"domain": domain}})
}

func (h *Handler) getStorefrontAnalytics(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.view", "reports.view_basic")
	if !ok {
		return
	}
	days, _ := strconv.Atoi(c.Query("days"))
	analytics, err := h.service.GetStorefrontAnalytics(c.Request.Context(), ws.WorkspaceID, days)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"analytics": analytics}})
}

func (h *Handler) getStorefrontOverview(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.view", "reports.view_basic")
	if !ok {
		return
	}
	period := c.DefaultQuery("period", "30d")
	overview, err := h.service.GetStorefrontOverview(c.Request.Context(), ws.WorkspaceID, period)
	if errors.Is(err, ErrNotFound) {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"overview": nil}})
		return
	}
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"overview": overview}})
}
