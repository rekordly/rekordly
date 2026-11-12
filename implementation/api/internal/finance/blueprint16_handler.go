package finance

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/db"
)

func (h *Handler) RegisterBlueprint16Routes(protected *gin.RouterGroup) {
	me := protected.Group("/me")
	{
		me.GET("/profile", h.getMeProfile)
		me.PATCH("/profile", h.updateMeProfile)
		me.POST("/recent-auth", h.grantRecentAuth)

		me.GET("/contact-methods", h.listContactMethods)
		me.POST("/contact-methods", h.addContactMethod)
		me.POST("/contact-methods/:contactId/commands/verify", h.verifyContactMethod)
		me.POST("/contact-methods/:contactId/commands/make-primary", h.makePrimaryContactMethod)
		me.DELETE("/contact-methods/:contactId", h.removeContactMethod)

		me.POST("/sessions/:sessionId/commands/revoke", h.revokeSessionCommand)
		me.POST("/sessions/commands/revoke-others", h.revokeOtherSessionsCommand)
		me.GET("/security-events", h.listSecurityEvents)

		me.GET("/privacy", h.getPrivacyDashboard)
		me.PUT("/consents", h.updateConsentPreference)
		me.POST("/exports", h.createOwnershipExport)
		me.GET("/exports", h.listOwnershipExports)
		me.GET("/exports/:exportId", h.getOwnershipExport)
	}

	protected.GET("/personal-spaces/:id/settings", h.getPersonalSpaceSettings)
	protected.PATCH("/personal-spaces/:id/settings", h.updatePersonalSpaceSettings)

	biz := protected.Group("/businesses/:id")
	{
		biz.GET("/settings/:section", h.getBusinessSettings)
		biz.PATCH("/settings/:section", h.updateBusinessSettings)
		biz.POST("/members/:member/commands/change-access", h.changeBusinessMemberAccess)
		biz.POST("/members/:member/commands/suspend", h.suspendBusinessMember)
		biz.POST("/members/:member/commands/remove", h.removeBusinessMember)
		biz.POST("/ownership-transfers", h.initiateBusinessOwnershipTransfer)
	}
	protected.POST("/ownership-transfers/:transferId/commands/accept", h.acceptBusinessOwnershipTransfer)

	protected.POST("/privacy-requests", h.createPrivacyRequest)
	protected.GET("/privacy-requests/:requestId", h.getPrivacyRequest)

	protected.POST("/deletion-cases/preview", h.previewDeletionCase)
	protected.POST("/deletion-cases", h.requestDeletionCase)
	protected.GET("/deletion-cases/:caseId", h.getDeletionCase)
	protected.POST("/deletion-cases/:caseId/commands/cancel", h.cancelDeletionCase)

	protected.POST("/support-cases", h.createSupportCase)
	protected.GET("/support-cases", h.listSupportCases)
	protected.GET("/support-cases/:caseId", h.getSupportCase)
	protected.POST("/support-cases/:caseId/messages", h.addSupportCaseMessage)
	protected.POST("/support-access-grants", h.createSupportAccessGrant)
	protected.POST("/support-access-grants/:grantId/commands/revoke", h.revokeSupportAccessGrant)
}

func writeBlueprint16Error(c *gin.Context, err error) {
	status := http.StatusBadRequest
	code := err.Error()
	switch {
	case errors.Is(err, ErrRecentAuthRequired):
		status = http.StatusUnauthorized
		code = "RECENT_AUTH_REQUIRED"
	case errors.Is(err, ErrNotFound):
		status = http.StatusNotFound
		code = "NOT_FOUND"
	case errors.Is(err, ErrSettingsVersionConflict), errors.Is(err, ErrSettingLockedAfterPosting),
		errors.Is(err, ErrContactAlreadyInUse), errors.Is(err, ErrLastLoginMethod),
		errors.Is(err, ErrLastOwnerRequired), errors.Is(err, ErrOwnershipTransferPending),
		errors.Is(err, ErrDeletionAlreadyRequested), errors.Is(err, ErrDeletionPurgeStarted),
		errors.Is(err, ErrRetentionHoldActive), errors.Is(err, ErrSessionAlreadyRevoked):
		status = http.StatusConflict
	case errors.Is(err, ErrExportReconciliationFailed):
		status = http.StatusUnprocessableEntity
	case err.Error() == "FORBIDDEN":
		status = http.StatusForbidden
		code = "FORBIDDEN"
	}
	c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
}

func (h *Handler) getMeProfile(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	p, err := h.service.GetMeProfile(c.Request.Context(), wsCtx.UserID)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": p})
}

func (h *Handler) updateMeProfile(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	var in UpdateProfileInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	p, err := h.service.UpdateMeProfile(c.Request.Context(), wsCtx.UserID, in)
	if err != nil {
		if errors.Is(err, ErrSettingsVersionConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "SETTINGS_VERSION_CONFLICT", "message": "Profile changed elsewhere. Reload and retry."}, "data": p})
			return
		}
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": p})
}

func (h *Handler) grantRecentAuth(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	var in struct {
		Purpose  string `json:"purpose" binding:"required"`
		Strength string `json:"strength"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	g, err := h.service.GrantRecentAuth(c.Request.Context(), wsCtx.UserID, nil, in.Purpose, in.Strength, 15*time.Minute)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": g})
}

func (h *Handler) listContactMethods(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	items, err := h.service.ListContactMethods(c.Request.Context(), wsCtx.UserID)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) addContactMethod(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	var in AddContactMethodInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.AddContactMethod(c.Request.Context(), wsCtx.UserID, in)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) verifyContactMethod(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	cid, _ := strconv.ParseInt(c.Param("contactId"), 10, 64)
	var in struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.VerifyContactMethod(c.Request.Context(), wsCtx.UserID, cid, in.Code)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) makePrimaryContactMethod(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	cid, _ := strconv.ParseInt(c.Param("contactId"), 10, 64)
	res, err := h.service.MakePrimaryContactMethod(c.Request.Context(), wsCtx.UserID, cid)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) removeContactMethod(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	cid, _ := strconv.ParseInt(c.Param("contactId"), 10, 64)
	res, err := h.service.RemoveContactMethod(c.Request.Context(), wsCtx.UserID, cid)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) revokeSessionCommand(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	sid, _ := strconv.ParseInt(c.Param("sessionId"), 10, 64)
	if err := h.service.RevokeUserSession(c.Request.Context(), wsCtx.UserID, sid); err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"revoked": true}})
}

func (h *Handler) revokeOtherSessionsCommand(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	var in struct {
		CurrentSessionID int64 `json:"current_session_id"`
	}
	_ = c.ShouldBindJSON(&in)
	count, err := h.service.RevokeOtherUserSessions(c.Request.Context(), wsCtx.UserID, in.CurrentSessionID)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"revoked_count": count}})
}

func (h *Handler) listSecurityEvents(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	items, err := h.service.ListSecurityEvents(c.Request.Context(), wsCtx.UserID, 50)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) getPersonalSpaceSettings(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}
	res, err := h.service.GetScopedWorkspaceSettings(c.Request.Context(), wsCtx, "personal")
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) updatePersonalSpaceSettings(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}
	var in UpdateScopedSettingsInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.UpdateScopedWorkspaceSettings(c.Request.Context(), wsCtx, "personal", "", in)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getBusinessSettings(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}
	res, err := h.service.GetScopedWorkspaceSettings(c.Request.Context(), wsCtx, "business")
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) updateBusinessSettings(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}
	var in UpdateScopedSettingsInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.UpdateScopedWorkspaceSettings(c.Request.Context(), wsCtx, "business", c.Param("section"), in)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) changeBusinessMemberAccess(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	memberID, _ := strconv.ParseInt(c.Param("member"), 10, 64)
	var in struct {
		RoleID    int64   `json:"role_id" binding:"required"`
		OutletIDs []int64 `json:"outlet_ids"`
		Reason    string  `json:"reason"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if err := h.service.ChangeBusinessMemberAccess(c.Request.Context(), wsCtx, memberID, in.RoleID, in.OutletIDs, in.Reason); err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"updated": true}})
}

func (h *Handler) suspendBusinessMember(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	memberID, _ := strconv.ParseInt(c.Param("member"), 10, 64)
	if err := h.service.SuspendBusinessMember(c.Request.Context(), wsCtx, memberID); err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"suspended": true}})
}

func (h *Handler) removeBusinessMember(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	memberID, _ := strconv.ParseInt(c.Param("member"), 10, 64)
	if err := h.service.RemoveBusinessMember(c.Request.Context(), wsCtx, memberID); err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"removed": true}})
}

func (h *Handler) initiateBusinessOwnershipTransfer(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	var in struct {
		ToUserID int64 `json:"to_user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.InitiateBusinessOwnershipTransfer(c.Request.Context(), wsCtx, in.ToUserID)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) acceptBusinessOwnershipTransfer(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	tid, _ := strconv.ParseInt(c.Param("transferId"), 10, 64)
	res, err := h.service.AcceptBusinessOwnershipTransfer(c.Request.Context(), wsCtx.UserID, tid)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getPrivacyDashboard(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	res, err := h.service.GetPrivacyDashboard(c.Request.Context(), wsCtx.UserID)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) updateConsentPreference(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	var in struct {
		ConsentKey string `json:"consent_key" binding:"required"`
		Granted    bool   `json:"granted"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.UpdateConsentPreference(c.Request.Context(), wsCtx.UserID, in.ConsentKey, in.Granted)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createOwnershipExport(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	var in CreateExportInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateOwnershipExport(c.Request.Context(), wsCtx.UserID, in)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listOwnershipExports(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	items, err := h.service.ListOwnershipExports(c.Request.Context(), wsCtx.UserID)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) getOwnershipExport(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	eid, _ := strconv.ParseInt(c.Param("exportId"), 10, 64)
	res, err := h.service.GetOwnershipExport(c.Request.Context(), wsCtx.UserID, eid)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createPrivacyRequest(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	var in struct {
		WorkspaceID *int64 `json:"workspace_id"`
		RequestType string `json:"request_type" binding:"required"`
		Summary     string `json:"summary"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreatePrivacyRequest(c.Request.Context(), wsCtx.UserID, in.WorkspaceID, in.RequestType, in.Summary)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) getPrivacyRequest(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	rid, _ := strconv.ParseInt(c.Param("requestId"), 10, 64)
	res, err := h.service.GetPrivacyRequest(c.Request.Context(), wsCtx.UserID, rid)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) previewDeletionCase(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	var in struct {
		Scope       string `json:"scope"`
		WorkspaceID *int64 `json:"workspace_id"`
	}
	_ = c.ShouldBindJSON(&in)
	res, err := h.service.PreviewDeletion(c.Request.Context(), wsCtx.UserID, in.Scope, in.WorkspaceID)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) requestDeletionCase(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	var in RequestDeletionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.RequestDeletion(c.Request.Context(), wsCtx.UserID, in)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) getDeletionCase(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	cid, _ := strconv.ParseInt(c.Param("caseId"), 10, 64)
	res, err := h.service.GetDeletionCase(c.Request.Context(), wsCtx.UserID, cid)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) cancelDeletionCase(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	cid, _ := strconv.ParseInt(c.Param("caseId"), 10, 64)
	res, err := h.service.CancelDeletionCase(c.Request.Context(), wsCtx.UserID, cid)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createSupportCase(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	var in CreateSupportCaseInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateSupportCase(c.Request.Context(), wsCtx.UserID, in)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listSupportCases(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	items, err := h.service.queries.ListSupportCasesByUser(c.Request.Context(), db.ListSupportCasesByUserParams{
		UserID: wsCtx.UserID,
		Limit:  25,
	})
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) getSupportCase(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	cid, _ := strconv.ParseInt(c.Param("caseId"), 10, 64)
	sc, msgs, err := h.service.GetSupportCase(c.Request.Context(), wsCtx.UserID, cid)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"case": sc, "messages": msgs}})
}

func (h *Handler) addSupportCaseMessage(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	cid, _ := strconv.ParseInt(c.Param("caseId"), 10, 64)
	var in struct {
		Body string `json:"body" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.AddSupportCaseMessage(c.Request.Context(), wsCtx.UserID, cid, in.Body)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) createSupportAccessGrant(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	var in CreateSupportAccessGrantInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateSupportAccessGrant(c.Request.Context(), wsCtx.UserID, in)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) revokeSupportAccessGrant(c *gin.Context) {
	wsCtx, _ := GetWorkspaceContext(c)
	gid, _ := strconv.ParseInt(c.Param("grantId"), 10, 64)
	res, err := h.service.RevokeSupportAccessGrant(c.Request.Context(), wsCtx.UserID, gid)
	if err != nil {
		writeBlueprint16Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}
