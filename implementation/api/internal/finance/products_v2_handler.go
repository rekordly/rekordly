package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// RegisterProductV2Routes exposes the Products area: list, detail, create, edit,
// archive, history, collections and imports. All are business-workspace only.
func (h *Handler) RegisterProductV2Routes(protected *gin.RouterGroup) {
	protected.GET("/catalogue/products", h.listProductsV2)
	protected.POST("/catalogue/products", h.createProductV2)
	protected.POST("/catalogue/products/import", h.importProducts)
	protected.GET("/catalogue/product-imports", h.listProductImports)
	protected.GET("/catalogue/products/:id", h.getProductV2)
	protected.PATCH("/catalogue/products/:id", h.updateProductV2)
	protected.PUT("/catalogue/products/:id/options", h.saveProductOptionsV2)
	protected.POST("/catalogue/products/:id/archive", h.archiveProduct)
	protected.POST("/catalogue/products/:id/restore", h.restoreProduct)
	protected.GET("/catalogue/products/:id/price-history", h.productPriceHistory)
	protected.GET("/catalogue/products/:id/events", h.productEvents)
	protected.GET("/catalogue/products/:id/history", h.productCombinedHistory)
	protected.GET("/catalogue/products/:id/stock-movements", h.productStockMovements)
	protected.POST("/catalogue/products/:id/stock", h.changeProductStock)
	protected.POST("/catalogue/products/:id/stock/move", h.moveProductStock)
	protected.POST("/catalogue/product-images/authorize", h.authorizeProductImage)
	protected.POST("/catalogue/products/prices/bulk", h.bulkChangeProductPrices)
	protected.POST("/catalogue/products/:id/prices", h.changeProductPrices)
	protected.GET("/catalogue/collections", h.listProductCollections)
	protected.POST("/catalogue/collections", h.createProductCollection)
	protected.PATCH("/catalogue/collections/:id", h.updateProductCollection)
	protected.DELETE("/catalogue/collections/:id", h.deleteProductCollection)
}

func (h *Handler) changeProductPrices(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	var in ChangeProductPricesInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	detail, err := h.service.ChangeProductPrices(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, in)
	if err != nil {
		productError(c, err, "CHANGE_PRICES_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": detail})
}

func (h *Handler) bulkChangeProductPrices(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in BulkChangeProductPricesInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	result, failed, err := h.service.BulkChangeProductPrices(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if len(failed) > 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  gin.H{"code": "BULK_PRICE_FAILED", "message": "Could not update prices for all selected products"},
			"failed": failed,
		})
		return
	}
	if err != nil {
		productError(c, err, "BULK_PRICE_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

func (h *Handler) saveProductOptionsV2(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	var in SaveProductOptionsInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	detail, err := h.service.SaveProductOptions(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, in)
	if err != nil {
		productError(c, err, "SAVE_OPTIONS_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": detail})
}

func productID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid id"}})
		return 0, false
	}
	return id, true
}

func productError(c *gin.Context, err error, code string) {
	status := http.StatusBadRequest
	if errors.Is(err, ErrProductNotFound) {
		status, code = http.StatusNotFound, "PRODUCT_NOT_FOUND"
	}
	c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
}

func (h *Handler) listProductsV2(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var filter ListProductsFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}
	products, err := h.service.ListProducts(c.Request.Context(), wsCtx.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list products"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"products": products}})
}

func (h *Handler) createProductV2(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in SaveProductInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	detail, err := h.service.CreateProductV2(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		productError(c, err, "CREATE_PRODUCT_FAILED")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": detail})
}

func (h *Handler) getProductV2(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	detail, err := h.service.GetProduct(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		productError(c, err, "GET_PRODUCT_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": detail})
}

func (h *Handler) updateProductV2(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	var in SaveProductInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	detail, err := h.service.UpdateProductV2(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, in)
	if err != nil {
		productError(c, err, "UPDATE_PRODUCT_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": detail})
}

func (h *Handler) setArchived(c *gin.Context, archived bool) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	detail, err := h.service.SetProductArchived(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, archived)
	if err != nil {
		productError(c, err, "ARCHIVE_PRODUCT_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": detail})
}

func (h *Handler) archiveProduct(c *gin.Context) { h.setArchived(c, true) }
func (h *Handler) restoreProduct(c *gin.Context) { h.setArchived(c, false) }

func (h *Handler) productPriceHistory(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	history, err := h.service.ListProductPriceHistory(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		productError(c, err, "PRICE_HISTORY_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"history": history}})
}

func (h *Handler) productEvents(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	events, err := h.service.ListProductEvents(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		productError(c, err, "PRODUCT_EVENTS_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"events": events}})
}

func (h *Handler) listProductCollections(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	collections, err := h.service.ListProductCollections(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list collections"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"collections": collections}})
}

func (h *Handler) createProductCollection(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in SaveCollectionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	collection, err := h.service.CreateProductCollection(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		productError(c, err, "CREATE_COLLECTION_FAILED")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"collection": collection}})
}

func (h *Handler) updateProductCollection(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	var in SaveCollectionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	collection, err := h.service.UpdateProductCollection(c.Request.Context(), wsCtx.WorkspaceID, id, in)
	if err != nil {
		productError(c, err, "UPDATE_COLLECTION_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"collection": collection}})
}

func (h *Handler) deleteProductCollection(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	if err := h.service.DeleteProductCollection(c.Request.Context(), wsCtx.WorkspaceID, id); err != nil {
		productError(c, err, "DELETE_COLLECTION_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"deleted": true}})
}

func (h *Handler) importProducts(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in ImportProductsInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	batch, err := h.service.ImportProducts(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		productError(c, err, "IMPORT_PRODUCTS_FAILED")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"batch": batch}})
}

func (h *Handler) listProductImports(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	batches, err := h.service.ListProductImportBatches(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list imports"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"batches": batches}})
}

func (h *Handler) authorizeProductImage(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in ProductImageUploadInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	auth, err := h.service.AuthorizeProductImage(wsCtx.WorkspaceID, in)
	if err != nil {
		status, code := http.StatusBadRequest, "IMAGE_UPLOAD_REJECTED"
		if errors.Is(err, ErrImageUploadUnavailable) {
			status, code = http.StatusServiceUnavailable, "IMAGE_UPLOAD_UNAVAILABLE"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"authorization": auth}})
}

func (h *Handler) productCombinedHistory(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	items, err := h.service.GetProductCombinedHistory(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		productError(c, err, "PRODUCT_HISTORY_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) moveProductStock(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	var in MoveProductStockInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	transfer, err := h.service.MoveProductStock(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, in)
	if err != nil {
		productError(c, err, "MOVE_STOCK_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": transfer})
}
