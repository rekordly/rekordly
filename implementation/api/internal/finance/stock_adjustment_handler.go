package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterStockAdjustmentRoutes(protected *gin.RouterGroup) {
	protected.POST("/inventory/adjustments", h.createStockAdjustment)
	protected.GET("/inventory/adjustments", h.listStockAdjustments)
	protected.GET("/inventory/adjustments/:id", h.getStockAdjustment)
}

func (h *Handler) createStockAdjustment(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateStockAdjustmentInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	adj, err := h.service.CreateStockAdjustment(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "ADJUSTMENT_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"adjustment": adj}})
}

func (h *Handler) listStockAdjustments(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var filter ListStockAdjustmentsFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}
	adjustments, err := h.service.ListStockAdjustments(c.Request.Context(), ws.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list stock adjustments"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"adjustments": adjustments}})
}

func (h *Handler) getStockAdjustment(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid adjustment ID"}})
		return
	}
	adj, err := h.service.GetStockAdjustment(c.Request.Context(), ws.WorkspaceID, id)
	if err != nil {
		if errors.Is(err, ErrAdjustmentNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Stock adjustment not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"adjustment": adj}})
}
