package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterCatalogueRoutes(protected *gin.RouterGroup) {
	protected.POST("/catalogue/items", h.createCatalogueItem)
	protected.GET("/catalogue/items", h.listCatalogueItems)
	protected.POST("/catalogue/items/:id/options", h.createProductOption)
	protected.GET("/catalogue/items/:id/options", h.listProductOptions)
	protected.POST("/catalogue/items/:id/variants", h.createProductVariant)
	protected.GET("/catalogue/items/:id/variants", h.listProductVariants)
	protected.PATCH("/catalogue/items/:id/variants/:var_id", h.updateProductVariant)
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

func (h *Handler) createProductOption(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid product ID"}})
		return
	}
	var in CreateProductOptionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	opt, err := h.service.CreateProductOption(c.Request.Context(), wsCtx.WorkspaceID, productID, in)
	if err != nil {
		status := http.StatusBadRequest
		code := "CREATE_PRODUCT_OPTION_FAILED"
		if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"option": opt}})
}

func (h *Handler) listProductOptions(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid product ID"}})
		return
	}
	opts, err := h.service.ListProductOptions(c.Request.Context(), wsCtx.WorkspaceID, productID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Product not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"options": opts}})
}

func (h *Handler) createProductVariant(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid product ID"}})
		return
	}
	var in CreateVariantInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	variant, err := h.service.CreateProductVariant(c.Request.Context(), wsCtx.WorkspaceID, productID, in)
	if err != nil {
		status := http.StatusBadRequest
		code := "CREATE_PRODUCT_VARIANT_FAILED"
		if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"variant": variant}})
}

func (h *Handler) listProductVariants(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid product ID"}})
		return
	}
	variants, err := h.service.ListProductVariants(c.Request.Context(), wsCtx.WorkspaceID, productID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Product not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"variants": variants}})
}

func (h *Handler) updateProductVariant(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid product ID"}})
		return
	}
	variantID, err := strconv.ParseInt(c.Param("var_id"), 10, 64)
	if err != nil || variantID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid variant ID"}})
		return
	}
	var in UpdateVariantInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	variant, err := h.service.UpdateProductVariant(c.Request.Context(), wsCtx.WorkspaceID, productID, variantID, in)
	if err != nil {
		status := http.StatusBadRequest
		code := "UPDATE_PRODUCT_VARIANT_FAILED"
		if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"variant": variant}})
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
