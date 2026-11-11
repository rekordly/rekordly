package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterStockTransferRoutes(protected *gin.RouterGroup) {
	protected.POST("/inventory/transfers", h.createStockTransfer)
	protected.GET("/inventory/transfers", h.listStockTransfers)
	protected.GET("/inventory/transfers/:id", h.getStockTransfer)
	protected.POST("/inventory/transfers/:id/dispatch", h.dispatchStockTransfer)
	protected.POST("/inventory/transfers/:id/receive", h.receiveStockTransfer)
}

func (h *Handler) createStockTransfer(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateTransferInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	trf, err := h.service.CreateStockTransfer(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		status := http.StatusBadRequest
		code := "TRANSFER_CREATE_FAILED"
		if errors.Is(err, ErrSameLocationTransfer) {
			code = "SAME_LOCATION_TRANSFER"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"transfer": trf}})
}

func (h *Handler) listStockTransfers(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var filter ListStockTransfersFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}
	transfers, err := h.service.ListStockTransfers(c.Request.Context(), ws.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list stock transfers"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"transfers": transfers}})
}

func (h *Handler) getStockTransfer(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid transfer ID"}})
		return
	}
	trf, err := h.service.GetStockTransfer(c.Request.Context(), ws.WorkspaceID, id)
	if err != nil {
		if errors.Is(err, ErrTransferNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Stock transfer not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"transfer": trf}})
}

func (h *Handler) dispatchStockTransfer(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid transfer ID"}})
		return
	}
	var in struct {
		OccurredOn string `json:"occurred_on"`
	}
	_ = c.ShouldBindJSON(&in)
	trf, err := h.service.DispatchStockTransfer(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in.OccurredOn)
	if err != nil {
		status := http.StatusBadRequest
		code := "DISPATCH_FAILED"
		if errors.Is(err, ErrTransferNotFound) {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		} else if errors.Is(err, ErrTransferInvalidState) {
			code = "INVALID_STATE"
		} else if errors.Is(err, ErrInsufficientStock) {
			code = "INSUFFICIENT_STOCK"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"transfer": trf}})
}

func (h *Handler) receiveStockTransfer(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid transfer ID"}})
		return
	}
	var in ReceiveTransferInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	trf, err := h.service.ReceiveStockTransfer(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in)
	if err != nil {
		status := http.StatusBadRequest
		code := "RECEIVE_FAILED"
		if errors.Is(err, ErrTransferNotFound) {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		} else if errors.Is(err, ErrTransferInvalidState) {
			code = "INVALID_STATE"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"transfer": trf}})
}
