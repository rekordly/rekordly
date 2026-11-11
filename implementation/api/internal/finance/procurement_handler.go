package finance

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterProcurementRoutes(protected *gin.RouterGroup) {
	protected.POST("/purchase-requests", h.createPurchaseRequest)
	protected.GET("/purchase-requests", h.listPurchaseRequests)
	protected.POST("/purchase-requests/:id/commands/submit", h.submitPurchaseRequest)
	protected.POST("/purchase-requests/:id/commands/approve", h.approvePurchaseRequest)
	protected.POST("/purchase-requests/:id/commands/reject", h.rejectPurchaseRequest)
	protected.POST("/purchase-requests/:id/commands/request-changes", h.requestPurchaseRequestChanges)
	protected.POST("/purchase-requests/:id/commands/cancel", h.cancelPurchaseRequest)
	protected.GET("/procurement/approval-policy", h.getProcurementApprovalPolicy)
	protected.PUT("/procurement/approval-policy", h.updateProcurementApprovalPolicy)
	protected.POST("/procurement/attachments", h.addProcurementAttachment)
	protected.GET("/procurement/attachments", h.listProcurementAttachments)
}

func requireProcurementPermission(c *gin.Context, codes ...string) (WorkspaceContext, bool) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return WorkspaceContext{}, false
	}
	if len(codes) == 0 || ws.RoleCode == "procurement_manager" {
		return ws, true
	}
	for _, code := range codes {
		if ws.HasPermission(code) {
			return ws, true
		}
	}
	c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "You do not have permission to perform this action"}})
	return WorkspaceContext{}, false
}

func enforceProcurementOutletScope(c *gin.Context, ws WorkspaceContext, outletID int64) bool {
	if outletID <= 0 || ws.IsOutletAllowed(outletID) {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "OUTLET_SCOPE_FORBIDDEN", "message": "You do not have access to this outlet/location"}})
	return false
}

func (h *Handler) addProcurementAttachment(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.create", "purchases.request", "purchases.create_po", "purchases.receive", "purchases.create_bill")
	if !ok {
		return
	}
	var input ProcurementAttachmentInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	item, err := h.service.AddProcurementAttachment(c.Request.Context(), ws.WorkspaceID, ws.UserID, input)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"attachment": item}})
}

func (h *Handler) listProcurementAttachments(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.view", "purchases.request", "purchases.create")
	if !ok {
		return
	}
	parse := func(name string) int64 { id, _ := strconv.ParseInt(c.Query(name), 10, 64); return id }
	items, err := h.service.ListProcurementAttachments(c.Request.Context(), ws.WorkspaceID, ProcurementAttachmentInput{PurchaseRequestID: parse("purchase_request_id"), PurchaseOrderID: parse("purchase_order_id"), GoodsReceiptID: parse("goods_receipt_id"), SupplierBillID: parse("supplier_bill_id")})
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"attachments": items}})
}

func (h *Handler) getProcurementApprovalPolicy(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.view", "settings.manage", "purchases.create")
	if !ok {
		return
	}
	policy, err := h.service.GetProcurementApprovalPolicy(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"policy": policy}})
}

func (h *Handler) updateProcurementApprovalPolicy(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "settings.manage")
	if !ok {
		return
	}
	var input UpdateProcurementApprovalPolicyInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	policy, err := h.service.UpdateProcurementApprovalPolicy(c.Request.Context(), ws.WorkspaceID, ws.UserID, input)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"policy": policy}})
}
func (h *Handler) requestPurchaseRequestChanges(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.approve_request", "purchases.approve_po")
	if !ok {
		return
	}
	id, in, ok := procurementCommandInput(c)
	if !ok {
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	request, e := h.service.RequestPurchaseRequestChanges(c, ws.WorkspaceID, ws.UserID, id, in)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"request": request}})
}
func (h *Handler) rejectPurchaseRequest(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.approve_request", "purchases.approve_po")
	if !ok {
		return
	}
	id, in, ok := procurementCommandInput(c)
	if !ok {
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	request, e := h.service.RejectPurchaseRequest(c, ws.WorkspaceID, ws.UserID, id, in)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"request": request}})
}
func (h *Handler) cancelPurchaseRequest(c *gin.Context) {
	ws, ok := requireProcurementPermission(c, "purchases.request", "purchases.approve_request", "purchases.create")
	if !ok {
		return
	}
	id, in, ok := procurementCommandInput(c)
	if !ok {
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	request, e := h.service.CancelPurchaseRequest(c, ws.WorkspaceID, ws.UserID, id, in)
	if e != nil {
		h.procurementError(c, e)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"request": request}})
}

// @Summary Create a purchase request draft
// @Description Creates an operational draft only. It posts no stock, payable, expense or cash movement.
// @Tags procurement
// @Accept json
// @Produce json
// @Router /api/v1/purchase-requests [post]
func (h *Handler) createPurchaseRequest(c *gin.Context) {
	wsCtx, ok := requireProcurementPermission(c, "purchases.request", "purchases.create")
	if !ok {
		return
	}
	var input CreatePurchaseRequestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if input.IdempotencyKey == "" {
		input.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	request, err := h.service.CreatePurchaseRequest(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, input)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"request": request}})
}

// @Summary List purchase requests
// @Description Lists workspace-scoped, non-posting procurement requests using a cursor.
// @Tags procurement
// @Produce json
// @Router /api/v1/purchase-requests [get]
func (h *Handler) listPurchaseRequests(c *gin.Context) {
	wsCtx, ok := requireProcurementPermission(c, "purchases.view", "purchases.request", "purchases.create")
	if !ok {
		return
	}
	var filter ListPurchaseRequestsFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}
	requests, err := h.service.ListPurchaseRequests(c.Request.Context(), wsCtx.WorkspaceID, filter)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"requests": requests}})
}

// @Summary Submit a purchase request for approval
// @Description Freezes the current request version for approval. It has no stock or accounting effect.
// @Tags procurement
// @Accept json
// @Produce json
// @Router /api/v1/purchase-requests/{id}/commands/submit [post]
func (h *Handler) submitPurchaseRequest(c *gin.Context) {
	wsCtx, ok := requireProcurementPermission(c, "purchases.request", "purchases.create")
	if !ok {
		return
	}
	requestID, input, ok := procurementCommandInput(c)
	if !ok {
		return
	}
	if input.IdempotencyKey == "" {
		input.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	request, err := h.service.SubmitPurchaseRequest(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, requestID, input)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"request": request}})
}

// @Summary Approve a purchase request
// @Description Marks a submitted request approved. Approval is non-posting and does not issue a PO.
// @Tags procurement
// @Accept json
// @Produce json
// @Router /api/v1/purchase-requests/{id}/commands/approve [post]
func (h *Handler) approvePurchaseRequest(c *gin.Context) {
	wsCtx, ok := requireProcurementPermission(c, "purchases.approve_request", "purchases.approve_po")
	if !ok {
		return
	}
	requestID, input, ok := procurementCommandInput(c)
	if !ok {
		return
	}
	if input.IdempotencyKey == "" {
		input.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	request, err := h.service.ApprovePurchaseRequest(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, requestID, input)
	if err != nil {
		h.procurementError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"request": request}})
}

func procurementCommandInput(c *gin.Context) (int64, PurchaseRequestCommandInput, bool) {
	requestID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || requestID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid purchase request ID"}})
		return 0, PurchaseRequestCommandInput{}, false
	}
	var input PurchaseRequestCommandInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return 0, PurchaseRequestCommandInput{}, false
	}
	return requestID, input, true
}

func (h *Handler) procurementError(c *gin.Context, err error) {
	status, code := http.StatusBadRequest, "PROCUREMENT_REQUEST_FAILED"
	switch {
	case errors.Is(err, ErrNotFound):
		status, code = http.StatusNotFound, "NOT_FOUND"
	case errors.Is(err, ErrForbiddenParty), errors.Is(err, ErrForbiddenProduct), errors.Is(err, ErrApprovalForbidden):
		status, code = http.StatusForbidden, "FORBIDDEN"
	case errors.Is(err, ErrPurchaseRequestVersion):
		status, code = http.StatusConflict, "PURCHASE_REQUEST_VERSION_CONFLICT"
	case errors.Is(err, ErrDuplicateIdempotent):
		status, code = http.StatusConflict, "IDEMPOTENCY_CONFLICT"
	case errors.Is(err, ErrDuplicateBill):
		status, code = http.StatusConflict, "SUPPLIER_BILL_DUPLICATE"
	case strings.Contains(err.Error(), "state"):
		status, code = http.StatusConflict, "INVALID_STATE"
	}
	c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
}
