package finance

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type storefrontProductChange struct {
	ProductIDs     []int64 `json:"product_ids"`
	ShowOnStore    *bool   `json:"show_on_store"`
	IsFeatured     *bool   `json:"is_featured"`
	CollectionIDs  []int64 `json:"collection_ids"`
	IdempotencyKey string  `json:"idempotency_key"`
}

func (h *Handler) listStorefrontProductCards(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.view", "storefront.manage_catalogue")
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	before, _ := strconv.ParseInt(c.Query("before_id"), 10, 64)
	collectionID, _ := strconv.ParseInt(c.Query("collection_id"), 10, 64)
	items, collections, next, err := h.service.ListStorefrontProductCards(c.Request.Context(), ws.WorkspaceID, c.Query("filter"), before, limit, collectionID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"products": items, "collections": collections, "next_before_id": next}})
}

func (h *Handler) patchStorefrontProduct(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_catalogue")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("productId"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid product"}})
		return
	}
	var in storefrontProductChange
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	in.ProductIDs = []int64{id}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	if err := h.service.ChangeStorefrontProducts(c.Request.Context(), ws.WorkspaceID, in); err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"updated": true}})
}

func (h *Handler) bulkPatchStorefrontProducts(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_catalogue")
	if !ok {
		return
	}
	var in storefrontProductChange
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	if err := h.service.ChangeStorefrontProducts(c.Request.Context(), ws.WorkspaceID, in); err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"updated": len(in.ProductIDs)}})
}
