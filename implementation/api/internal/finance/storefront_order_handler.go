package finance

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterStorefrontOrderRoutes(g *gin.RouterGroup) {
	g.GET("/orders", h.listMerchantOrders)
	g.GET("/orders/export", h.exportMerchantOrders)
	g.GET("/orders/:id", h.getMerchantOrder)
	g.POST("/orders/:id/commands/request-change", h.requestOrderChange)
	g.POST("/orders/:id/commands/confirm", h.confirmStorefrontOrder)
	g.POST("/orders/:id/commands/pack", h.packStorefrontOrder)
	g.POST("/orders/:id/commands/ready-for-pickup", h.readyForPickupStorefrontOrder)
	g.POST("/orders/:id/commands/collect", h.collectStorefrontOrder)
	g.POST("/orders/:id/commands/mark-paid", h.markStorefrontOrderPaidManual)
	g.POST("/orders/:id/commands/fulfil", h.fulfilStorefrontOrder)
	g.POST("/orders/:id/commands/cancel", h.cancelStorefrontOrder)
	g.POST("/orders/:id/commands/decline", h.declineStorefrontOrder)
	g.POST("/orders/:id/commands/link-customer", h.linkOrCreateOrderCustomer)
	g.POST("/orders/:id/commands/create-invoice", h.convertOrderToInvoice)
	g.POST("/orders/:id/commands/messages", h.postMerchantOrderMessage)
	g.POST("/orders/:id/commands/return", h.returnStorefrontOrder)
	g.POST("/orders/:id/commands/retry-courier-booking", h.retryStorefrontCourierBooking)
	g.POST("/orders/commands/expire-reservations", h.expireStaleReservations)
}

func (h *Handler) packStorefrontOrder(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.fulfil")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	var in struct {
		ExpectedVersion int32 `json:"expected_version"`
	}
	if err != nil || id <= 0 || c.ShouldBindJSON(&in) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Invalid packing request"}})
		return
	}
	order, err := h.service.PackStorefrontOrder(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in.ExpectedVersion)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) listMerchantOrders(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.view")
	if !ok {
		return
	}
	outletFilter, _ := strconv.ParseInt(c.Query("outlet_id"), 10, 64)
	if outletFilter > 0 && !ws.IsOutletAllowed(outletFilter) {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "OUTLET_SCOPE_FORBIDDEN", "message": "Access to this outlet is forbidden"}})
		return
	}
	if scoped := ws.ScopedOutletID(); scoped != nil && outletFilter == 0 {
		outletFilter = *scoped
	}
	rows, err := h.service.ListMerchantOrders(c.Request.Context(), ws.WorkspaceID, c.Query("status"), outletFilter)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"orders": rows}})
}

func (h *Handler) getMerchantOrder(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.view")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid order"}})
		return
	}
	order, err := h.service.GetMerchantOrder(c.Request.Context(), ws.WorkspaceID, id)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	if order.OutletID != nil && !ws.IsOutletAllowed(*order.OutletID) {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "OUTLET_SCOPE_FORBIDDEN", "message": "Access to this outlet is forbidden"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) requestOrderChange(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.review", "orders.confirm")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	var in RequestOrderChangeInput
	if err != nil || id <= 0 || c.ShouldBindJSON(&in) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Invalid order revision"}})
		return
	}
	order, err := h.service.RequestOrderChange(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) confirmStorefrontOrder(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.confirm")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	var in ConfirmOrderInput
	if err != nil || id <= 0 || c.ShouldBindJSON(&in) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Invalid confirmation request"}})
		return
	}
	if in.OutletID > 0 && !ws.IsOutletAllowed(in.OutletID) {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "OUTLET_SCOPE_FORBIDDEN", "message": "Access to this outlet is forbidden"}})
		return
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	order, err := h.service.ConfirmStorefrontOrder(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) fulfilStorefrontOrder(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.fulfil")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	var in FulfilStorefrontOrderInput
	if err != nil || id <= 0 || c.ShouldBindJSON(&in) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Invalid fulfilment request"}})
		return
	}
	order, err := h.service.FulfilStorefrontOrder(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) cancelStorefrontOrder(c *gin.Context) {
	h.handleOrderDeclineOrCancel(c, "cancel")
}

func (h *Handler) declineStorefrontOrder(c *gin.Context) {
	h.handleOrderDeclineOrCancel(c, "decline")
}

func (h *Handler) handleOrderDeclineOrCancel(c *gin.Context, action string) {
	ws, ok := businessPermission(c, "orders.cancel", "orders.review")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid order"}})
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&in)
	order, err := h.service.DeclineOrCancelStorefrontOrder(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, action, in.Reason)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) linkOrCreateOrderCustomer(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.review", "contacts.manage")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid order"}})
		return
	}
	var in struct {
		CounterpartyID int64 `json:"counterparty_id"`
	}
	_ = c.ShouldBindJSON(&in)
	order, err := h.service.LinkOrCreateOrderCustomer(c.Request.Context(), ws.WorkspaceID, id, in.CounterpartyID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) convertOrderToInvoice(c *gin.Context) {
	ws, ok := businessPermission(c, "invoices.create")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid order"}})
		return
	}
	var in struct {
		Proforma bool `json:"proforma"`
	}
	_ = c.ShouldBindJSON(&in)
	order, err := h.service.ConvertOrderToInvoice(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in.Proforma)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) postMerchantOrderMessage(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.review", "orders.confirm")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	var in struct {
		Message         string `json:"message"`
		CustomerVisible *bool  `json:"customer_visible"`
	}
	if err != nil || id <= 0 || c.ShouldBindJSON(&in) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Invalid message"}})
		return
	}
	visible := true
	if in.CustomerVisible != nil {
		visible = *in.CustomerVisible
	}
	order, err := h.service.PostMerchantOrderMessage(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in.Message, visible)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) exportMerchantOrders(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.export")
	if !ok {
		return
	}
	csvBytes, err := h.service.ExportStorefrontOrdersCSV(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.Header("Content-Disposition", `attachment; filename="storefront-orders.csv"`)
	c.Data(http.StatusOK, "text/csv; charset=utf-8", csvBytes)
}

func (h *Handler) returnStorefrontOrder(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.fulfil", "orders.cancel")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	var in ReturnStorefrontOrderInput
	if err != nil || id <= 0 || c.ShouldBindJSON(&in) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Invalid return request"}})
		return
	}
	order, err := h.service.ReturnStorefrontOrder(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) expireStaleReservations(c *gin.Context) {
	if _, ok := businessPermission(c, "orders.confirm", "orders.cancel"); !ok {
		return
	}
	count, err := h.service.ExpireStaleStorefrontReservations(c.Request.Context())
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"expired_count": count}})
}

func (h *Handler) readyForPickupStorefrontOrder(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.fulfil")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	var in struct {
		ExpectedVersion int32 `json:"expected_version"`
	}
	if err != nil || id <= 0 || c.ShouldBindJSON(&in) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Invalid pickup ready request"}})
		return
	}
	order, err := h.service.ReadyForPickupStorefrontOrder(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in.ExpectedVersion)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) collectStorefrontOrder(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.fulfil")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	var in CollectStorefrontOrderInput
	if err != nil || id <= 0 || c.ShouldBindJSON(&in) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Invalid collection request"}})
		return
	}
	order, err := h.service.CollectStorefrontOrder(c.Request.Context(), ws.WorkspaceID, ws.UserID, id, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}

func (h *Handler) markStorefrontOrderPaidManual(c *gin.Context) {
	ws, ok := businessPermission(c, "orders.confirm", "orders.fulfil")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	var in struct {
		MoneyAccountID int64  `json:"money_account_id" binding:"required"`
		Notes          string `json:"notes"`
	}
	if err != nil || id <= 0 || c.ShouldBindJSON(&in) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Money account is required"}})
		return
	}
	if err := h.service.MarkStorefrontOrderPaidManual(c.Request.Context(), ws.WorkspaceID, id, in.MoneyAccountID, in.Notes); err != nil {
		h.storefrontError(c, err)
		return
	}
	order, err := h.service.GetMerchantOrder(c.Request.Context(), ws.WorkspaceID, id)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"order": order}})
}
