package finance

import (
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/billing"
)

func (h *Handler) RegisterBlueprint13Routes(publicV1, protected *gin.RouterGroup) {
	// Paystack webhook uses raw-body HMAC signature verification (not user session)
	publicV1.POST("/webhooks/paystack", h.paystackWebhook)

	// Authenticated billing & entitlement endpoints
	protected.GET("/commercial-mode", h.getCommercialMode)
	protected.GET("/plans", h.listPlans)
	protected.GET("/workspaces/:id/billing-subject", h.getWorkspaceBillingSubject)

	bs := protected.Group("/billing-subjects/:subjectId")
	{
		bs.GET("/subscription", h.getSubscription)
		bs.GET("/entitlements", h.getEntitlements)
		bs.GET("/usage", h.getUsage)
		bs.GET("/downgrade-impact", h.getDowngradeImpact)
		bs.POST("/checkout-intents", h.createCheckoutIntent)
		bs.POST("/subscription-change-quotes", h.createChangeQuote)
		bs.POST("/commands/change-plan", h.changePlan)
		bs.POST("/commands/cancel-subscription", h.cancelSubscription)
		bs.POST("/commands/resume-subscription", h.resumeSubscription)
		bs.POST("/commands/purchase-addon", h.purchaseAddon)
		bs.POST("/commands/transfer-ownership", h.transferBillingOwnership)
		bs.POST("/commands/refund", h.requestBillingRefund)
		bs.GET("/transactions", h.listBillingTransactions)
		bs.GET("/billing-documents", h.listBillingDocuments)
	}
	protected.GET("/checkout-intents/:intentId", h.verifyCheckoutIntent)
	protected.GET("/billing-documents/:docId/download", h.downloadBillingDocument)
}

func (h *Handler) requireSubjectAccess(c *gin.Context, requiredPerms ...string) (int64, int64, bool) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return 0, 0, false
	}
	userID := wsCtx.UserID
	subjectID, err := strconv.ParseInt(c.Param("subjectId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid billing subject id"}})
		return 0, 0, false
	}
	subj, err := h.service.queries.GetBillingSubjectByID(c.Request.Context(), subjectID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "billing subject not found"}})
		return 0, 0, false
	}
	if subj.OwnerUserID != userID {
		// Check workspace membership & permissions
		var allowed bool
		_ = h.service.pool.QueryRow(c.Request.Context(), `
			SELECT EXISTS(
				SELECT 1 FROM workspace_memberships wm
				JOIN role_permissions rp ON rp.role_id = wm.role_id
				WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND wm.status = 'active'
				  AND rp.permission_code = ANY($3)
			)`, subj.WorkspaceID, userID, requiredPerms).Scan(&allowed)
		if !allowed {
			c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "BILLING_PERMISSION_REQUIRED", "message": "billing permission required"}})
			return 0, 0, false
		}
	}
	return subjectID, userID, true
}

func (h *Handler) getCommercialMode(c *gin.Context) {
	res, err := h.service.GetCommercialMode(c.Request.Context())
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listPlans(c *gin.Context) {
	var isAddon *bool
	if raw := c.Query("is_addon"); raw != "" {
		b := raw == "true"
		isAddon = &b
	}
	res, err := h.service.ListPlans(c.Request.Context(), c.Query("subject_type"), isAddon)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getWorkspaceBillingSubject(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "billing.view", "money.view")
	if !ok {
		return
	}
	subj, sub, err := h.service.ResolveSubjectForWorkspace(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"subject": subj, "subscription": sub}})
}

func (h *Handler) getSubscription(c *gin.Context) {
	subjID, _, ok := h.requireSubjectAccess(c, "billing.view")
	if !ok {
		return
	}
	snap, err := h.service.ResolveEntitlements(c.Request.Context(), subjID)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": snap})
}

func (h *Handler) getEntitlements(c *gin.Context) {
	subjID, _, ok := h.requireSubjectAccess(c, "billing.view")
	if !ok {
		return
	}
	snap, err := h.service.ResolveEntitlements(c.Request.Context(), subjID)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"commercial_mode":      snap.CommercialMode,
		"plan_code":            snap.Plan.PlanCode,
		"plan_version":         snap.Plan.Version,
		"entitlement_revision": snap.EntitlementRevision,
		"features":             snap.Features,
	}})
}

func (h *Handler) getUsage(c *gin.Context) {
	subjID, _, ok := h.requireSubjectAccess(c, "billing.view")
	if !ok {
		return
	}
	res, err := h.service.GetUsageSummary(c.Request.Context(), subjID)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getDowngradeImpact(c *gin.Context) {
	subjID, _, ok := h.requireSubjectAccess(c, "billing.view", "billing.manage_plan")
	if !ok {
		return
	}
	targetID, err := strconv.ParseInt(c.Query("target_plan_version"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "target_plan_version is required"}})
		return
	}
	res, err := h.service.GetDowngradeImpact(c.Request.Context(), subjID, targetID)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createCheckoutIntent(c *gin.Context) {
	subjID, userID, ok := h.requireSubjectAccess(c, "billing.manage_plan")
	if !ok {
		return
	}
	var in CreateCheckoutInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateCheckoutIntent(c.Request.Context(), subjID, userID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) verifyCheckoutIntent(c *gin.Context) {
	intentID, err := strconv.ParseInt(c.Param("intentId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid checkout intent id"}})
		return
	}
	res, err := h.service.VerifyCheckoutIntent(c.Request.Context(), intentID)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createChangeQuote(c *gin.Context) {
	subjID, _, ok := h.requireSubjectAccess(c, "billing.view", "billing.manage_plan")
	if !ok {
		return
	}
	var body struct {
		TargetPlanVersionID int64 `json:"target_plan_version_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.GetSubscriptionChangeQuote(c.Request.Context(), subjID, body.TargetPlanVersionID)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) changePlan(c *gin.Context) {
	subjID, userID, ok := h.requireSubjectAccess(c, "billing.manage_plan")
	if !ok {
		return
	}
	var in ChangePlanInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.ChangePlan(c.Request.Context(), subjID, userID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) cancelSubscription(c *gin.Context) {
	subjID, _, ok := h.requireSubjectAccess(c, "billing.cancel_resume")
	if !ok {
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.service.CancelSubscription(c.Request.Context(), subjID, body.Reason)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) resumeSubscription(c *gin.Context) {
	subjID, _, ok := h.requireSubjectAccess(c, "billing.cancel_resume")
	if !ok {
		return
	}
	res, err := h.service.ResumeSubscription(c.Request.Context(), subjID)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) purchaseAddon(c *gin.Context) {
	subjID, _, ok := h.requireSubjectAccess(c, "billing.purchase_addon")
	if !ok {
		return
	}
	var in PurchaseAddonInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.PurchaseAddon(c.Request.Context(), subjID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) transferBillingOwnership(c *gin.Context) {
	subjID, _, ok := h.requireSubjectAccess(c, "billing.manage_subjects")
	if !ok {
		return
	}
	var body struct {
		NewOwnerUserID int64  `json:"new_owner_user_id" binding:"required"`
		BillingName    string `json:"billing_name"`
		BillingEmail   string `json:"billing_email"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.OwnershipTransferBillingSubject(c.Request.Context(), subjID, body.NewOwnerUserID, body.BillingName, body.BillingEmail)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) requestBillingRefund(c *gin.Context) {
	subjID, userID, ok := h.requireSubjectAccess(c, "billing.request_refund")
	if !ok {
		return
	}
	var in RequestRefundInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.RequestRefund(c.Request.Context(), subjID, userID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listBillingTransactions(c *gin.Context) {
	subjID, _, ok := h.requireSubjectAccess(c, "billing.view_documents")
	if !ok {
		return
	}
	res, err := h.service.ListBillingTransactions(c.Request.Context(), subjID)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listBillingDocuments(c *gin.Context) {
	subjID, _, ok := h.requireSubjectAccess(c, "billing.view_documents")
	if !ok {
		return
	}
	res, err := h.service.ListBillingDocuments(c.Request.Context(), subjID)
	if err != nil {
		writeBlueprint13Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) downloadBillingDocument(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	userID := wsCtx.UserID
	docID, err := strconv.ParseInt(c.Param("docId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid document id"}})
		return
	}
	doc, err := h.service.queries.GetBillingDocumentByID(c.Request.Context(), docID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "billing document not found"}})
		return
	}
	subj, err := h.service.queries.GetBillingSubjectByID(c.Request.Context(), doc.BillingSubjectID)
	if err != nil || subj.OwnerUserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "BILLING_PERMISSION_REQUIRED", "message": "only the billing owner can download billing documents"}})
		return
	}
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename="+doc.DocumentNumber+".txt")
	c.String(http.StatusOK, doc.ContentText)
}

func (h *Handler) paystackWebhook(c *gin.Context) {
	rawBody, err := io.ReadAll(io.LimitReader(c.Request.Body, 512*1024))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": "unable to read request body"}})
		return
	}
	outcome, err := h.service.HandlePaystackWebhook(c.Request.Context(), rawBody, c.Request.Header)
	if err != nil {
		if errors.Is(err, billing.ErrInvalidWebhookSig) || errors.Is(err, ErrInvalidWebhookSignature) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "INVALID_SIGNATURE", "message": "invalid webhook signature"}})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "WEBHOOK_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"status": outcome}})
}

func writeBlueprint13Error(c *gin.Context, err error) {
	switch err {
	case ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": err.Error()}})
	case ErrFeatureNotIncluded, ErrPlanLimitReached, ErrEntitlementStale, ErrSubscriptionPastDue,
		ErrCheckoutNotAvailable, ErrPlanVersionUnavailable, ErrBillingPermissionRequired,
		ErrPaymentConfirmPending, ErrDowngradeRequiresSelect, billing.ErrProviderUnavailable:
		status := http.StatusForbidden
		if err == ErrCheckoutNotAvailable || err == ErrDowngradeRequiresSelect || err == ErrPlanVersionUnavailable {
			status = http.StatusConflict
		} else if err == ErrPaymentConfirmPending {
			status = http.StatusAccepted
		} else if err == billing.ErrProviderUnavailable {
			status = http.StatusServiceUnavailable
		}
		c.JSON(status, gin.H{"error": gin.H{"code": err.Error(), "message": err.Error()}})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": err.Error()}})
	}
}
