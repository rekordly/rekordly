package finance

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterSupplierBillRoutes(g *gin.RouterGroup) {
	g.POST("/supplier-bills", h.createSupplierBill)
	g.GET("/supplier-bills", h.listSupplierBills)
	g.GET("/supplier-bills/:id", h.getSupplierBill)
	g.GET("/supplier-bills/:id/match", h.supplierBillMatch)
	g.POST("/supplier-bills/:id/commands/approve", h.approveSupplierBill)
	g.POST("/supplier-bills/:id/commands/reject", h.rejectSupplierBill)
	g.POST("/supplier-bills/:id/commands/dispute", h.disputeSupplierBill)
	g.POST("/supplier-bills/:id/commands/reverse", h.reverseSupplierBill)
	g.POST("/supplier-bills/:id/commands/apply-credit", h.applyCreditToSupplierBill)
}

func (h *Handler) getSupplierBill(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.view", "purchases.create_bill", "purchases.approve_bill", "purchases.create")
	if !ok {
		return
	}
	id, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil || id < 1 {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid bill"}})
		return
	}
	bill, e := h.service.GetSupplierBill(c, ws.WorkspaceID, id)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	if bill.OutletID != nil && !enforceProcurementOutletScope(c, ws, *bill.OutletID) {
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"bill": bill}})
}

func (h *Handler) supplierBillMatch(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.view", "purchases.create_bill", "purchases.approve_bill", "purchases.create")
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
	ws, ok := requireProcurementPermission(c, "purchases.view", "purchases.create_bill", "purchases.approve_bill", "purchases.pay_supplier", "purchases.create")
	if !ok {
		return
	}
	rows, e := h.service.ListSupplierBills(c, ws.WorkspaceID)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	scoped := ws.ScopedOutletIDs()
	if len(scoped) > 0 {
		filtered := make([]SupplierBillView, 0, len(rows))
		for _, b := range rows {
			if b.OutletID == nil || ws.IsOutletAllowed(*b.OutletID) {
				filtered = append(filtered, b)
			}
		}
		rows = filtered
	}
	c.JSON(200, gin.H{"data": gin.H{"bills": rows}})
}

func (h *Handler) createSupplierBill(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.create_bill", "purchases.create")
	if !ok {
		return
	}
	var in CreateSupplierBillInput
	if c.ShouldBindJSON(&in) != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid supplier bill"}})
		return
	}
	if in.Approve && !ws.HasPermission("purchases.approve_bill") {
		c.JSON(403, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Missing purchases.approve_bill permission"}})
		return
	}
	if in.Payment != nil && !ws.HasPermission("purchases.pay_supplier") && !ws.HasPermission("purchases.create") {
		c.JSON(403, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Missing purchases.pay_supplier permission"}})
		return
	}
	if in.OutletID != nil && !enforceProcurementOutletScope(c, ws, *in.OutletID) {
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
	resp := gin.H{"bill": bill}
	if bill.Payment != nil {
		resp["payment"] = bill.Payment
	}
	c.JSON(201, gin.H{"data": resp})
}

func (h *Handler) approveSupplierBill(c *gin.Context) {
	id, e := strconv.ParseInt(c.Param("id"), 10, 64)
	var in SupplierBillCommandInput
	if e != nil || c.ShouldBindJSON(&in) != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid bill approval"}})
		return
	}
	needed := []string{"purchases.approve_bill"}
	if in.AcceptVariance {
		needed = []string{"purchases.accept_variance", "purchases.approve_bill"}
	}
	ws, ok := requireProcurementPermission(c, needed...)
	if !ok {
		return
	}
	if in.AcceptVariance && !ws.HasPermission("purchases.accept_variance") && ws.RoleCode != "procurement_manager" {
		c.JSON(403, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Variance acceptance permission is required"}})
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

func (h *Handler) rejectSupplierBill(c *gin.Context) {
	h.handleBillStatusCommand(c, "reject")
}

func (h *Handler) disputeSupplierBill(c *gin.Context) {
	h.handleBillStatusCommand(c, "dispute")
}

func (h *Handler) reverseSupplierBill(c *gin.Context) {
	h.handleBillStatusCommand(c, "reverse")
}

func (h *Handler) handleBillStatusCommand(c *gin.Context, command string) {
	ws, ok := requireProcurementPermission(c, "purchases.approve_bill")
	if !ok {
		return
	}
	id, e := strconv.ParseInt(c.Param("id"), 10, 64)
	var in SupplierBillCommandInput
	if e != nil || id < 1 || c.ShouldBindJSON(&in) != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid supplier bill command"}})
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	bill, e := h.service.TransitionSupplierBill(c, ws.WorkspaceID, ws.UserID, id, command, in)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"bill": bill}})
}

func (h *Handler) applyCreditToSupplierBill(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.pay_supplier", "purchases.approve_bill")
	if !ok {
		return
	}
	id, e := strconv.ParseInt(c.Param("id"), 10, 64)
	var in ApplySupplierCreditToBillInput
	if e != nil || id < 1 || c.ShouldBindJSON(&in) != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid credit application"}})
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	bill, e := h.service.ApplySupplierCreditToBill(c, ws.WorkspaceID, ws.UserID, id, in)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"bill": bill}})
}
