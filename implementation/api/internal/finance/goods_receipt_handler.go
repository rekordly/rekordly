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
	g.POST("/goods-receipts/:id/payments", h.payGoodsReceipt)
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
	before, _ := strconv.ParseInt(c.Query("before_id"), 10, 64)
	limit64, _ := strconv.ParseInt(c.Query("limit"), 10, 32)
	rows, nextBeforeID, e := h.service.ListGoodsReceipts(c, ws.WorkspaceID, int32(limit64), before)
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
	c.JSON(200, gin.H{"data": gin.H{"receipts": rows, "items": rows, "next_before_id": nextBeforeID}})
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
	if in.IssueOrder {
		in.CanApprovePO = ws.HasPermission("purchases.approve_po")
	}
	if in.Bill != nil {
		if !ws.HasPermission("purchases.create_bill") && !ws.HasPermission("purchases.create") {
			c.JSON(403, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Missing purchases.create_bill permission"}})
			return
		}
		if in.Bill.Approve && !ws.HasPermission("purchases.approve_bill") {
			c.JSON(403, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Missing purchases.approve_bill permission"}})
			return
		}
	}
	if in.Payment != nil {
		if !ws.HasPermission("purchases.pay_supplier") && !ws.HasPermission("purchases.create") {
			c.JSON(403, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Missing purchases.pay_supplier permission"}})
			return
		}
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
	resp := gin.H{"receipt": receipt}
	if receipt.Bill != nil {
		resp["bill"] = receipt.Bill
	}
	if receipt.Payment != nil {
		resp["payment"] = receipt.Payment
	}
	c.JSON(201, gin.H{"data": resp})
}

func (h *Handler) payGoodsReceipt(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.pay_supplier", "purchases.create")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid goods receipt"}})
		return
	}
	var in GoodsReceiptPaymentInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid payment request"}})
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	res, err := h.service.PayGoodsReceipt(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"receipt": res.Receipt, "bill": res.Bill, "payment": res.Payment}})
}
