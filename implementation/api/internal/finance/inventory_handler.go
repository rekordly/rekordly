package finance

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterInventoryRoutes(protected *gin.RouterGroup) {
	protected.GET("/inventory/balances", h.listInventoryBalances)
	protected.GET("/inventory/overview", h.getInventoryOverview)
	protected.POST("/inventory/opening-stock", h.createOpeningStock)
	protected.POST("/inventory/issue-sale", h.issueSaleStock)
}

func (h *Handler) getInventoryOverview(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	overview, err := h.service.GetInventoryOverview(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVENTORY_OVERVIEW_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": overview})
}

func (h *Handler) createInventoryAdjustment(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateInventoryAdjustmentInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	item, err := h.service.CreateInventoryAdjustment(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVENTORY_ADJUSTMENT_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"adjustment": item}})
}

func (h *Handler) createInventoryTransfer(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateInventoryTransferInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	item, err := h.service.CreateInventoryTransfer(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVENTORY_TRANSFER_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"transfer": item}})
}

func (h *Handler) createStockCount(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateStockCountInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	item, err := h.service.CreateStockCount(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "STOCK_COUNT_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"count": item}})
}

func (h *Handler) issueSaleStock(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in IssueSaleStockInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	result, err := h.service.IssueSaleStock(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		status := http.StatusBadRequest
		code := "STOCK_ISSUE_FAILED"
		if errors.Is(err, ErrInsufficientStock) {
			code = "INSUFFICIENT_STOCK"
		} else if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		} else if errors.Is(err, ErrReservationNotActive) {
			code = "RESERVATION_NOT_ACTIVE"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
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
