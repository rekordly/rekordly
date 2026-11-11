package finance

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterGoodsReceiptRoutes(g *gin.RouterGroup) {
	g.POST("/goods-receipts", h.createGoodsReceipt)
	g.GET("/goods-receipts", h.listGoodsReceipts)
	g.GET("/goods-receipts/:id", h.getGoodsReceipt)
	g.GET("/purchase-orders/:id/receipt-options", h.receiptOptions)
}

func (h *Handler) getGoodsReceipt(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok { return }
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 { c.JSON(400, gin.H{"error": gin.H{"message": "Invalid goods receipt"}}); return }
	receipt, err := h.service.GetGoodsReceipt(c, ws.WorkspaceID, id)
	if err != nil { h.procurementError(c, err); return }
	c.JSON(200, gin.H{"data": gin.H{"receipt": receipt}})
}
func (h *Handler) listGoodsReceipts(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	rows, e := h.service.ListGoodsReceipts(c, ws.WorkspaceID)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"receipts": rows}})
}

func (h *Handler) receiptOptions(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid purchase order"}})
		return
	}
	lines, err := h.service.ReceiptOptions(c, ws.WorkspaceID, id)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"lines": lines}})
}

func (h *Handler) createGoodsReceipt(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	if !ws.IsOwner && ws.RoleCode != "admin" && ws.RoleCode != "procurement_manager" {
		h.procurementError(c, ErrApprovalForbidden)
		return
	}
	var in CreateGoodsReceiptInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid goods receipt"}})
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	receipt, err := h.service.CreateGoodsReceipt(c, ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(201, gin.H{"data": gin.H{"receipt": receipt}})
}
