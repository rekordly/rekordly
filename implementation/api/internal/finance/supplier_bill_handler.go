package finance

import (
	"github.com/gin-gonic/gin"
	"strconv"
	"strings"
)

func (h *Handler) RegisterSupplierBillRoutes(g *gin.RouterGroup) {
	g.POST("/supplier-bills", h.createSupplierBill)
	g.GET("/supplier-bills", h.listSupplierBills)
	g.GET("/supplier-bills/:id/match", h.supplierBillMatch)
	g.POST("/supplier-bills/:id/commands/approve", h.approveSupplierBill)
}
func (h *Handler) supplierBillMatch(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil || id < 1 {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid bill"}})
		return
	}
	m, e := h.service.SupplierBillMatch(c, ws.WorkspaceID, id)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"match": m}})
}
func (h *Handler) listSupplierBills(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	rows, e := h.service.ListSupplierBills(c, ws.WorkspaceID)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"bills": rows}})
}
func (h *Handler) createSupplierBill(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateSupplierBillInput
	if c.ShouldBindJSON(&in) != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid supplier bill"}})
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	bill, e := h.service.CreateSupplierBill(c, ws.WorkspaceID, ws.UserID, in)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(201, gin.H{"data": gin.H{"bill": bill}})
}
func (h *Handler) approveSupplierBill(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, e := strconv.ParseInt(c.Param("id"), 10, 64)
	var in SupplierBillCommandInput
	if e != nil || c.ShouldBindJSON(&in) != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid bill approval"}})
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	bill, e := h.service.ApproveSupplierBill(c, ws.WorkspaceID, ws.UserID, id, in)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"bill": bill}})
}
