package finance

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterInventoryRoutes(protected *gin.RouterGroup) {
	protected.GET("/inventory/balances", h.listInventoryBalances)
	protected.POST("/inventory/opening-stock", h.createOpeningStock)
}

func (h *Handler) listInventoryBalances(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	balances, err := h.service.ListInventoryBalances(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list inventory balances"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"balances": balances}})
}

func (h *Handler) createOpeningStock(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateOpeningStockInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	balance, err := h.service.CreateOpeningStock(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		code := "OPENING_STOCK_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrNotFound) {
			code = "NOT_FOUND"
			status = http.StatusNotFound
		}
		if errors.Is(err, ErrDuplicateIdempotent) {
			code = "IDEMPOTENCY_CONFLICT"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"balance": balance}})
}
