package finance

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterPurchaseOrderRoutes(g *gin.RouterGroup) {
	g.POST("/purchase-orders", h.createPurchaseOrder)
	g.PATCH("/purchase-orders/:id", h.updatePurchaseOrderDraft)
	g.POST("/purchase-orders/:id/duplicate", h.duplicatePurchaseOrder)
	g.POST("/purchase-orders/:id/revise", h.revisePurchaseOrder)
	g.GET("/purchase-orders/:id/versions", h.listPurchaseOrderVersions)
	g.POST("/purchase-orders/:id/share", h.createPurchaseOrderShare)
	g.GET("/purchase-orders", h.listPurchaseOrders)
	g.GET("/purchase-orders/:id", h.getPurchaseOrder)
	g.POST("/purchase-orders/:id/commands/issue", h.issuePurchaseOrder)
	g.POST("/purchase-orders/:id/commands/:command", h.advancePurchaseOrder)
}

func (h *Handler) RegisterPurchaseOrderShareRoutes(g *gin.RouterGroup) {
	g.GET("/purchase-orders/share/:token", h.getPurchaseOrderShare)
	g.POST("/purchase-orders/share/:token/respond", h.respondPurchaseOrderShare)
}

func (h *Handler) getPurchaseOrderShare(c *gin.Context) {
	share, err := h.service.GetPurchaseOrderShare(c.Request.Context(), c.Param("token"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "SHARE_NOT_FOUND", "message": "This purchase-order link is invalid or expired"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"share": share}})
}

func (h *Handler) respondPurchaseOrderShare(c *gin.Context) {
	var input struct {
		Response string                    `json:"response"`
		Note     string                    `json:"note"`
		Lines    []SupplierShareLineUpdate `json:"lines"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	share, err := h.service.RespondPurchaseOrderShareWithLines(c.Request.Context(), c.Param("token"), input.Response, input.Note, input.Lines)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "SHARE_RESPONSE_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"share": share}})
}

func (h *Handler) getPurchaseOrder(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.view", "purchases.create_po", "purchases.create")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "Invalid purchase order"}})
		return
	}
	po, err := h.service.GetPurchaseOrderForUser(c, ws.WorkspaceID, ws.UserID, id)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	if po.OutletID != nil && !enforceProcurementOutletScope(c, ws, *po.OutletID) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": po}})
}

func (h *Handler) createPurchaseOrder(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.create_po", "purchases.create")
	if !ok {
		return
	}
	var in CreatePurchaseOrderInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid request"}})
		return
	}
	if in.OutletID != nil && !enforceProcurementOutletScope(c, ws, *in.OutletID) {
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	in.CanApprove = ws.HasPermission("purchases.approve_po")
	po, e := h.service.CreateDirectPurchaseOrder(c, ws.WorkspaceID, ws.UserID, in)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(201, gin.H{"data": gin.H{"order": po}})
}

func (h *Handler) issuePurchaseOrder(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.create_po", "purchases.create", "purchases.approve_po", "purchases.issue_po")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "Invalid purchase order"}})
		return
	}
	var in IssuePurchaseOrderInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "Invalid request"}})
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	canApprove := ws.HasPermission("purchases.approve_po")
	result, err := h.service.IssuePurchaseOrder(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, canApprove, in)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

func (h *Handler) updatePurchaseOrderDraft(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.create_po", "purchases.create")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid purchase order"}})
		return
	}
	var in UpdatePurchaseOrderDraftInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid request"}})
		return
	}
	if in.OutletID != nil && !enforceProcurementOutletScope(c, ws, *in.OutletID) {
		return
	}
	po, err := h.service.UpdatePurchaseOrderDraft(c, ws.WorkspaceID, ws.UserID, id, in)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"order": po}})
}

func (h *Handler) duplicatePurchaseOrder(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.create_po", "purchases.create")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid purchase order"}})
		return
	}
	var in struct {
		IdempotencyKey string `json:"idempotency_key"`
	}
	_ = c.ShouldBindJSON(&in)
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	po, err := h.service.DuplicatePurchaseOrder(c, ws.WorkspaceID, ws.UserID, id, in.IdempotencyKey)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(201, gin.H{"data": gin.H{"order": po}})
}

func (h *Handler) revisePurchaseOrder(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.create_po", "purchases.approve_po", "purchases.create")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid purchase order"}})
		return
	}
	var in RevisePurchaseOrderInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid revision payload"}})
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	po, err := h.service.RevisePurchaseOrder(c, ws.WorkspaceID, ws.UserID, id, in)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"order": po}})
}

func (h *Handler) listPurchaseOrderVersions(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.view", "purchases.create_po", "purchases.create")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid purchase order"}})
		return
	}
	versions, err := h.service.ListPurchaseOrderVersions(c, ws.WorkspaceID, id)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"versions": versions}})
}

func (h *Handler) createPurchaseOrderShare(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.issue_po", "purchases.approve_po", "purchases.create_po")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "Invalid purchase order"}})
		return
	}
	var input CreatePurchaseOrderShareInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	share, err := h.service.CreatePurchaseOrderShare(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, input)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"share": share}})
}

func (h *Handler) listPurchaseOrders(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.view", "purchases.create_po", "purchases.create")
	if !ok {
		return
	}
	before, _ := strconv.ParseInt(c.Query("before_id"), 10, 64)
	limit64, _ := strconv.ParseInt(c.Query("limit"), 10, 32)
	rows, nextBeforeID, e := h.service.ListPurchaseOrders(c, ws.WorkspaceID, int32(limit64), before)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	scoped := ws.ScopedOutletIDs()
	if len(scoped) > 0 {
		filtered := make([]PurchaseOrderView, 0, len(rows))
		for _, r := range rows {
			if r.OutletID == nil || ws.IsOutletAllowed(*r.OutletID) {
				filtered = append(filtered, r)
			}
		}
		rows = filtered
	}
	c.JSON(200, gin.H{"data": gin.H{"orders": rows, "items": rows, "next_before_id": nextBeforeID}})
}

func (h *Handler) advancePurchaseOrder(c *gin.Context) {
	cmd := c.Param("command")
	var needed []string
	switch cmd {
	case "approved":
		needed = []string{"purchases.approve_po"}
	case "issued":
		needed = []string{"purchases.issue_po", "purchases.approve_po"}
	case "cancel", "cancel_remainder", "close":
		needed = []string{"purchases.close_po", "purchases.approve_po"}
	case "submitted", "acknowledged":
		needed = []string{"purchases.create_po", "purchases.approve_po", "purchases.issue_po", "purchases.create"}
	default:
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid command"}})
		return
	}
	ws, ok := requireProcurementPermission(c, needed...)
	if !ok {
		return
	}
	id, e := strconv.ParseInt(c.Param("id"), 10, 64)
	var in struct {
		ExpectedVersion int32  `json:"expected_version"`
		IdempotencyKey  string `json:"idempotency_key"`
		Reason          string `json:"reason"`
	}
	if e != nil || id < 1 || c.ShouldBindJSON(&in) != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid command"}})
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	var po PurchaseOrderView
	if cmd == "cancel" || cmd == "cancel_remainder" || cmd == "close" {
		po, e = h.service.ResolvePurchaseOrder(c, ws.WorkspaceID, ws.UserID, id, int64(in.ExpectedVersion), cmd, in.Reason, in.IdempotencyKey)
	} else {
		po, e = h.service.AdvancePurchaseOrder(c, ws.WorkspaceID, ws.UserID, id, in.ExpectedVersion, cmd, in.IdempotencyKey)
	}
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": po}})
}
