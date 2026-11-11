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
	ws, ok := requireProcurementPermission(c, "purchases.view", "purchases.receive", "purchases.receive_unplanned", "purchases.create")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid goods receipt"}})
		return
	}
	receipt, err := h.service.GetGoodsReceipt(c, ws.WorkspaceID, id)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	if receipt.LocationID != nil && !enforceProcurementOutletScope(c, ws, *receipt.LocationID) {
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"receipt": receipt}})
}

func (h *Handler) listGoodsReceipts(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.view", "purchases.receive", "purchases.receive_unplanned", "purchases.create")
	if !ok {
		return
	}
	rows, e := h.service.ListGoodsReceipts(c, ws.WorkspaceID)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	scoped := ws.ScopedOutletIDs()
	if len(scoped) > 0 {
		filtered := make([]GoodsReceiptListItem, 0, len(rows))
		for _, r := range rows {
			if r.LocationID == nil || ws.IsOutletAllowed(*r.LocationID) {
				filtered = append(filtered, r)
			}
		}
		rows = filtered
	}
	c.JSON(200, gin.H{"data": gin.H{"receipts": rows}})
}

func (h *Handler) receiptOptions(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.view", "purchases.receive", "purchases.create")
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
	var in CreateGoodsReceiptInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid goods receipt"}})
		return
	}
	var needed []string
	if in.PurchaseOrderID <= 0 {
		needed = []string{"purchases.receive_unplanned"}
	} else {
		needed = []string{"purchases.receive", "purchases.receive_unplanned"}
	}
	ws, ok := requireProcurementPermission(c, needed...)
	if !ok {
		return
	}
	if in.LocationID > 0 && !enforceProcurementOutletScope(c, ws, in.LocationID) {
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
