package finance

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
	"strings"
)

func (h *Handler) RegisterPurchaseOrderRoutes(g *gin.RouterGroup) {
	g.POST("/purchase-orders", h.createPurchaseOrder)
	g.POST("/purchase-orders/:id/share", h.createPurchaseOrderShare)
	g.GET("/purchase-orders", h.listPurchaseOrders)
	g.GET("/purchase-orders/:id", h.getPurchaseOrder)
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
		Response string `json:"response"`
		Note     string `json:"note"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	share, err := h.service.RespondPurchaseOrderShare(c.Request.Context(), c.Param("token"), input.Response, input.Note)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "SHARE_RESPONSE_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"share": share}})
}
func (h *Handler) getPurchaseOrder(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "Invalid purchase order"}})
		return
	}
	po, err := h.service.GetPurchaseOrder(c, ws.WorkspaceID, id)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": po}})
}
func (h *Handler) createPurchaseOrder(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in struct {
		PurchaseRequestID int64  `json:"purchase_request_id"`
		IdempotencyKey    string `json:"idempotency_key"`
	}
	if c.ShouldBindJSON(&in) != nil {
		c.JSON(400, gin.H{"error": gin.H{"message": "Invalid request"}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	po, e := h.service.CreatePurchaseOrderFromRequest(c, ws.WorkspaceID, ws.UserID, in.PurchaseRequestID, in.IdempotencyKey)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(201, gin.H{"data": gin.H{"order": po}})
}

func (h *Handler) createPurchaseOrderShare(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	if !ws.IsOwner && ws.RoleCode != "admin" && ws.RoleCode != "procurement_manager" {
		h.procurementError(c, ErrApprovalForbidden)
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
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	before, _ := strconv.ParseInt(c.Query("before_id"), 10, 64)
	rows, e := h.service.ListPurchaseOrders(c, ws.WorkspaceID, before)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(200, gin.H{"data": gin.H{"orders": rows}})
}
func (h *Handler) advancePurchaseOrder(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	if !ws.IsOwner && ws.RoleCode != "admin" && ws.RoleCode != "procurement_manager" {
		h.procurementError(c, ErrApprovalForbidden)
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
	cmd := c.Param("command")
	if cmd != "submitted" && cmd != "approved" && cmd != "issued" && cmd != "acknowledged" && cmd != "cancel" && cmd != "cancel_remainder" && cmd != "close" {
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
