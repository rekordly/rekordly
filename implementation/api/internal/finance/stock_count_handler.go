package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterStockCountRoutes(protected *gin.RouterGroup) {
	protected.POST("/inventory/counts", h.startStockCount)
	protected.GET("/inventory/counts", h.listStockCounts)
	protected.GET("/inventory/counts/:id", h.getStockCount)
	protected.PUT("/inventory/counts/:id/lines", h.recordStockCountLines)
	protected.POST("/inventory/counts/:id/approve", h.approveStockCount)
}

func (h *Handler) startStockCount(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in StartStockCountInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	cnt, err := h.service.StartStockCount(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "COUNT_START_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"count": cnt}})
}

func (h *Handler) listStockCounts(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var filter ListStockCountsFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}
	counts, err := h.service.ListStockCounts(c.Request.Context(), ws.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list stock counts"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"counts": counts}})
}

func (h *Handler) getStockCount(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid count ID"}})
		return
	}
	cnt, err := h.service.GetStockCount(c.Request.Context(), ws.WorkspaceID, id)
	if err != nil {
		if errors.Is(err, ErrCountNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Stock count not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"count": cnt}})
}

func (h *Handler) recordStockCountLines(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid count ID"}})
		return
	}
	var in RecordCountLinesInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	cnt, err := h.service.RecordStockCountLines(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in)
	if err != nil {
		status := http.StatusBadRequest
		code := "RECORD_LINES_FAILED"
		if errors.Is(err, ErrCountNotFound) {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		} else if errors.Is(err, ErrCountInvalidState) {
			code = "INVALID_STATE"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"count": cnt}})
}

func (h *Handler) approveStockCount(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid count ID"}})
		return
	}
	var in struct {
		OccurredOn string `json:"occurred_on"`
	}
	_ = c.ShouldBindJSON(&in)
	cnt, err := h.service.ApproveAndPostStockCount(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in.OccurredOn)
	if err != nil {
		status := http.StatusBadRequest
		code := "APPROVE_FAILED"
		if errors.Is(err, ErrCountNotFound) {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		} else if errors.Is(err, ErrCountInvalidState) {
			code = "INVALID_STATE"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"count": cnt}})
}
