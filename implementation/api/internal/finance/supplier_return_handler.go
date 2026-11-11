package finance

import (
	"errors"
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
)

func (h *Handler) RegisterSupplierReturnRoutes(g *gin.RouterGroup) {
	g.POST("/supplier-returns", h.createSupplierReturn)
	g.GET("/supplier-returns", h.listSupplierReturns)
	g.GET("/goods-receipts/:id/return-options", h.returnOptions)
	g.POST("/supplier-credits", h.createSupplierCredit)
	g.POST("/supplier-refunds", h.createSupplierRefund)
}

func (h *Handler) listSupplierReturns(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	rows, err := h.service.ListSupplierReturns(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list supplier returns"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"returns": rows}})
}
func (h *Handler) returnOptions(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid receipt"}})
		return
	}
	rows, err := h.service.ReturnOptions(c.Request.Context(), ws.WorkspaceID, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "RETURN_OPTIONS_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"lines": rows}})
}

func (h *Handler) createSupplierReturn(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateSupplierReturnInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	v, err := h.service.CreateSupplierReturn(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": gin.H{"code": "SUPPLIER_RETURN_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"return": v}})
}

func (h *Handler) createSupplierCredit(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateSupplierCreditInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	v, err := h.service.CreateSupplierCredit(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": gin.H{"code": "SUPPLIER_CREDIT_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"credit": v}})
}

func (h *Handler) createSupplierRefund(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateSupplierRefundInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	v, err := h.service.CreateSupplierRefund(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": gin.H{"code": "SUPPLIER_REFUND_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"credit": v}})
}
