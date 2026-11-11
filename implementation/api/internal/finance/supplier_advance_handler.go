package finance

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterSupplierAdvanceRoutes(g *gin.RouterGroup) {
	g.POST("/supplier-advances", h.createSupplierAdvance)
	g.GET("/supplier-advances", h.listSupplierAdvances)
	g.POST("/supplier-advances/:id/commands/apply", h.applySupplierAdvance)
}

func (h *Handler) createSupplierAdvance(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.manage_advance", "purchases.pay_supplier")
	if !ok {
		return
	}
	var input CreateSupplierAdvanceInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Invalid supplier advance"}})
		return
	}
	if strings.TrimSpace(input.IdempotencyKey) == "" {
		input.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	advance, err := h.service.CreateSupplierAdvance(c, ws.WorkspaceID, ws.UserID, input)
	if err != nil {
		h.supplierAdvanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"advance": advance}})
}

func (h *Handler) listSupplierAdvances(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.view", "purchases.manage_advance", "purchases.pay_supplier", "purchases.create")
	if !ok {
		return
	}
	advances, err := h.service.ListSupplierAdvances(c, ws.WorkspaceID)
	if err != nil {
		h.supplierAdvanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"advances": advances}})
}

func (h *Handler) applySupplierAdvance(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.manage_advance", "purchases.pay_supplier")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid supplier advance"}})
		return
	}
	var input ApplySupplierAdvanceInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Invalid supplier advance application"}})
		return
	}
	if strings.TrimSpace(input.IdempotencyKey) == "" {
		input.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	result, err := h.service.ApplySupplierAdvance(c, ws.WorkspaceID, ws.UserID, id, input)
	if err != nil {
		h.supplierAdvanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"application": result}})
}

func (h *Handler) supplierAdvanceError(c *gin.Context, err error) {
	status, code := http.StatusBadRequest, "SUPPLIER_ADVANCE_FAILED"
	switch {
	case errors.Is(err, ErrNotFound):
		status, code = http.StatusNotFound, "NOT_FOUND"
	case errors.Is(err, ErrDuplicateIdempotent):
		status, code = http.StatusConflict, "IDEMPOTENCY_CONFLICT"
	case errors.Is(err, ErrPurchaseRequestVersion):
		status, code = http.StatusConflict, "VERSION_CONFLICT"
	case errors.Is(err, ErrSupplierAdvanceInsufficient):
		status, code = http.StatusConflict, "SUPPLIER_ADVANCE_INSUFFICIENT"
	case errors.Is(err, ErrOverpayment):
		status, code = http.StatusConflict, "OVERPAYMENT"
	case errors.Is(err, ErrForbiddenParty), errors.Is(err, ErrForbiddenAccount):
		status, code = http.StatusForbidden, "FORBIDDEN"
	}
	c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
}
