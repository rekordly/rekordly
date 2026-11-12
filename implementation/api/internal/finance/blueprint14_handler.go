package finance

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/notify"
)

func (h *Handler) RegisterBlueprint14Routes(publicV1, protected *gin.RouterGroup) {
	// Public Guest Portal & Email Webhook
	publicV1.GET("/s/:opaqueToken", h.getGuestSharePortal)
	publicV1.POST("/s/:opaqueToken/commands/create-download", h.downloadGuestSharedArtifact)
	publicV1.POST("/webhooks/resend", h.resendEmailWebhook)

	// User Notifications & Preferences
	me := protected.Group("/me")
	{
		me.GET("/notifications", h.listMeNotifications)
		me.GET("/notifications/unread-count", h.countMeUnreadNotifications)
		me.POST("/notifications/:id/commands/mark-read", h.markMeNotificationRead)
		me.POST("/notifications/:id/commands/mark-unread", h.markMeNotificationUnread)
		me.POST("/notifications/:id/commands/archive", h.archiveMeNotification)
		me.POST("/notifications/commands/mark-read-bulk", h.markMeNotificationsReadBulk)
		me.GET("/notification-preferences", h.listMeNotificationPrefs)
		me.PUT("/notification-preferences", h.upsertMeNotificationPref)
	}

	// Workspace-scoped Documents, Artifacts, Shares, Deliveries & Files
	ws := protected.Group("/workspaces/:id")
	{
		ws.POST("/documents/:document/:docId/commands/render", h.renderDocumentArtifact)
		ws.POST("/documents/:document/:docId/share-grants", h.createDocumentShareGrant)
		ws.GET("/documents/:document/:docId/share-grants", h.listDocumentShareGrants)
		ws.POST("/documents/:document/:docId/deliveries", h.createDocumentDelivery)
		ws.GET("/documents/:document/:docId/deliveries", h.listDocumentDeliveries)
		ws.POST("/documents/:document/:docId/whatsapp-handoff", h.createWhatsAppHandoff)

		ws.POST("/files/upload-intents", h.createFileUploadIntent)
		ws.GET("/files", h.listWorkspaceFiles)
		ws.POST("/files/:fileId/commands/finalize-upload", h.finalizeFileUpload)
		ws.POST("/files/:fileId/commands/create-download", h.createFileSignedDownload)
		ws.POST("/files/:fileId/commands/link", h.linkFileToResource)
		ws.POST("/files/:fileId/commands/request-deletion", h.requestFileDeletion)
	}

	// Resource-addressed commands (still workspace-checked via X-Workspace-ID / GetWorkspaceContext)
	protected.GET("/render-jobs/:jobId", h.getRenderJob)
	protected.GET("/artifacts/:artifactId", h.getDocumentArtifact)
	protected.POST("/artifacts/:artifactId/commands/create-download", h.downloadDocumentArtifact)
	protected.POST("/share-grants/:grantId/commands/revoke", h.revokeShareGrant)
	protected.GET("/deliveries/:deliveryId", h.getDelivery)
	protected.POST("/deliveries/:deliveryId/commands/retry", h.retryDelivery)
	protected.POST("/deliveries/:deliveryId/commands/resend", h.resendDelivery)
	protected.POST("/file-links/:linkId/commands/unlink", h.unlinkFileLink)
}

func (h *Handler) listMeNotifications(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	var wsPtr *int64
	if wsCtx.WorkspaceID > 0 {
		wsPtr = &wsCtx.WorkspaceID
	}
	cursorID, _ := strconv.ParseInt(c.Query("cursor"), 10, 64)
	limit64, _ := strconv.ParseInt(c.Query("limit"), 10, 32)
	includeArch := c.Query("include_archived") == "true"
	items, err := h.service.ListMeNotifications(c.Request.Context(), wsCtx.UserID, wsPtr, c.Query("category"), includeArch, cursorID, int32(limit64))
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) countMeUnreadNotifications(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	var wsPtr *int64
	if wsCtx.WorkspaceID > 0 {
		wsPtr = &wsCtx.WorkspaceID
	}
	cnt, err := h.service.CountMeUnreadNotifications(c.Request.Context(), wsCtx.UserID, wsPtr)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"unread_count": cnt}})
}

func (h *Handler) markMeNotificationRead(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	n, err := h.service.MarkMeNotificationRead(c.Request.Context(), wsCtx.UserID, id)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": n})
}

func (h *Handler) markMeNotificationUnread(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	n, err := h.service.MarkMeNotificationUnread(c.Request.Context(), wsCtx.UserID, id)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": n})
}

func (h *Handler) archiveMeNotification(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	n, err := h.service.ArchiveMeNotification(c.Request.Context(), wsCtx.UserID, id)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": n})
}

func (h *Handler) markMeNotificationsReadBulk(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	var wsPtr *int64
	if wsCtx.WorkspaceID > 0 {
		wsPtr = &wsCtx.WorkspaceID
	}
	if err := h.service.MarkMeNotificationsReadBulk(c.Request.Context(), wsCtx.UserID, wsPtr); err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true}})
}

func (h *Handler) listMeNotificationPrefs(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	var wsPtr *int64
	if wsCtx.WorkspaceID > 0 {
		wsPtr = &wsCtx.WorkspaceID
	}
	prefs, err := h.service.ListMeNotificationPreferences(c.Request.Context(), wsCtx.UserID, wsPtr)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": prefs})
}

func (h *Handler) upsertMeNotificationPref(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return
	}
	var in UpdateNotificationPrefInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	pref, err := h.service.UpsertMeNotificationPreference(c.Request.Context(), wsCtx.UserID, in)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": pref})
}

func (h *Handler) renderDocumentArtifact(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "documents.render")
	if !ok {
		return
	}
	docID, _ := strconv.ParseInt(c.Param("docId"), 10, 64)
	res, err := h.service.RenderDocumentArtifact(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.Param("document"), docID, c.GetHeader("Idempotency-Key"))
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) getRenderJob(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "documents.view_artifacts", "documents.render")
	if !ok {
		return
	}
	jobID, _ := strconv.ParseInt(c.Param("jobId"), 10, 64)
	res, err := h.service.GetRenderJob(c.Request.Context(), wsCtx.WorkspaceID, jobID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getDocumentArtifact(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "documents.view_artifacts", "documents.render")
	if !ok {
		return
	}
	artID, _ := strconv.ParseInt(c.Param("artifactId"), 10, 64)
	res, err := h.service.GetDocumentArtifact(c.Request.Context(), wsCtx.WorkspaceID, artID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) downloadDocumentArtifact(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "documents.view_artifacts", "documents.render")
	if !ok {
		return
	}
	artID, _ := strconv.ParseInt(c.Param("artifactId"), 10, 64)
	art, err := h.service.GetDocumentArtifact(c.Request.Context(), wsCtx.WorkspaceID, artID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", "attachment; filename="+art.DocumentType+"-"+strconv.FormatInt(art.DocumentID, 10)+".pdf")
	c.Data(http.StatusOK, "application/pdf", art.PdfBytes)
}

func (h *Handler) createDocumentShareGrant(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "shares.create")
	if !ok {
		return
	}
	docID, _ := strconv.ParseInt(c.Param("docId"), 10, 64)
	var in CreateShareGrantInput
	_ = c.ShouldBindJSON(&in)
	res, err := h.service.CreateShareGrant(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.Param("document"), docID, in)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listDocumentShareGrants(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "shares.create", "deliveries.view")
	if !ok {
		return
	}
	docID, _ := strconv.ParseInt(c.Param("docId"), 10, 64)
	res, err := h.service.ListShareGrants(c.Request.Context(), wsCtx.WorkspaceID, c.Param("document"), docID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) revokeShareGrant(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "shares.revoke", "shares.create")
	if !ok {
		return
	}
	grantID, _ := strconv.ParseInt(c.Param("grantId"), 10, 64)
	res, err := h.service.RevokeShareGrant(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, grantID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createDocumentDelivery(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "documents.send")
	if !ok {
		return
	}
	docID, _ := strconv.ParseInt(c.Param("docId"), 10, 64)
	var in CreateDeliveryInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateEmailDelivery(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.Param("document"), docID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listDocumentDeliveries(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "deliveries.view", "documents.send")
	if !ok {
		return
	}
	docID, _ := strconv.ParseInt(c.Param("docId"), 10, 64)
	res, err := h.service.ListDeliveriesByDocument(c.Request.Context(), wsCtx.WorkspaceID, c.Param("document"), docID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getDelivery(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "deliveries.view")
	if !ok {
		return
	}
	delivID, _ := strconv.ParseInt(c.Param("deliveryId"), 10, 64)
	res, err := h.service.GetDelivery(c.Request.Context(), wsCtx.WorkspaceID, delivID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) retryDelivery(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "deliveries.retry", "documents.send")
	if !ok {
		return
	}
	delivID, _ := strconv.ParseInt(c.Param("deliveryId"), 10, 64)
	res, err := h.service.RetryEmailDelivery(c.Request.Context(), wsCtx.WorkspaceID, delivID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) resendDelivery(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "documents.send")
	if !ok {
		return
	}
	delivID, _ := strconv.ParseInt(c.Param("deliveryId"), 10, 64)
	orig, err := h.service.GetDelivery(c.Request.Context(), wsCtx.WorkspaceID, delivID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	var body struct {
		RecipientEmail string `json:"recipient_email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateEmailDelivery(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, orig.DocumentType, orig.DocumentID, c.GetHeader("Idempotency-Key"), CreateDeliveryInput{
		RecipientEmail: body.RecipientEmail,
		IsResend:       true,
		ResendOfID:     &orig.ID,
	})
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) createWhatsAppHandoff(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "shares.create", "documents.send")
	if !ok {
		return
	}
	docID, _ := strconv.ParseInt(c.Param("docId"), 10, 64)
	res, err := h.service.CreateWhatsAppHandoff(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.Param("document"), docID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) createFileUploadIntent(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "files.manage")
	if !ok {
		return
	}
	var in UploadIntentInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateFileUploadIntent(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listWorkspaceFiles(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "files.manage", "evidence.view_private")
	if !ok {
		return
	}
	res, err := h.service.ListWorkspaceFiles(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) finalizeFileUpload(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "files.manage")
	if !ok {
		return
	}
	fileID, _ := strconv.ParseInt(c.Param("fileId"), 10, 64)
	var in FinalizeFileUploadInput
	_ = c.ShouldBindJSON(&in)
	res, err := h.service.FinalizeFileUpload(c.Request.Context(), wsCtx.WorkspaceID, fileID, in)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createFileSignedDownload(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "evidence.view_private", "files.manage")
	if !ok {
		return
	}
	fileID, _ := strconv.ParseInt(c.Param("fileId"), 10, 64)
	res, err := h.service.CreateFileSignedDownload(c.Request.Context(), wsCtx.WorkspaceID, fileID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) linkFileToResource(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "files.link", "files.manage")
	if !ok {
		return
	}
	fileID, _ := strconv.ParseInt(c.Param("fileId"), 10, 64)
	var body struct {
		ResourceType string `json:"resource_type" binding:"required"`
		ResourceID   int64  `json:"resource_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.LinkFileToResource(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, fileID, body.ResourceType, body.ResourceID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) unlinkFileLink(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "files.link", "files.manage")
	if !ok {
		return
	}
	linkID, _ := strconv.ParseInt(c.Param("linkId"), 10, 64)
	res, err := h.service.UnlinkFile(c.Request.Context(), wsCtx.WorkspaceID, linkID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) requestFileDeletion(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "files.delete")
	if !ok {
		return
	}
	fileID, _ := strconv.ParseInt(c.Param("fileId"), 10, 64)
	res, err := h.service.RequestFileDeletion(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, fileID)
	if err != nil {
		writeBlueprint14Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getGuestSharePortal(c *gin.Context) {
	c.Header("X-Robots-Tag", "noindex, nofollow")
	c.Header("Referrer-Policy", "no-referrer")
	ipSum := sha256.Sum256([]byte(c.ClientIP()))
	doc, err := h.service.GetGuestSharePortal(c.Request.Context(), c.Param("opaqueToken"), hex.EncodeToString(ipSum[:8]))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "SHARE_LINK_UNAVAILABLE", "message": "This share link is invalid, expired, or revoked"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": doc})
}

func (h *Handler) downloadGuestSharedArtifact(c *gin.Context) {
	c.Header("X-Robots-Tag", "noindex, nofollow")
	c.Header("Referrer-Policy", "no-referrer")
	c.Header("X-Content-Type-Options", "nosniff")
	ipSum := sha256.Sum256([]byte(c.ClientIP()))
	name, pdfBytes, err := h.service.DownloadGuestSharedArtifact(c.Request.Context(), c.Param("opaqueToken"), hex.EncodeToString(ipSum[:8]))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "SHARE_LINK_UNAVAILABLE", "message": "This share link is invalid, expired, or revoked"}})
		return
	}
	c.Header("Content-Disposition", "attachment; filename="+name)
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func (h *Handler) resendEmailWebhook(c *gin.Context) {
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 256*1024))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": "invalid body"}})
		return
	}
	outcome, err := h.service.ProcessEmailWebhook(c.Request.Context(), raw, c.GetHeader("Svix-Signature"))
	if err != nil {
		status := http.StatusBadRequest
		if err == notify.ErrInvalidEmailWebhook {
			status = http.StatusUnauthorized
		}
		c.JSON(status, gin.H{"error": gin.H{"code": "WEBHOOK_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"status": outcome}})
}

func writeBlueprint14Error(c *gin.Context, err error) {
	switch err {
	case ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": err.Error()}})
	case ErrFileQuarantined, ErrFilePublicDisallowed, ErrEmailSuppressed:
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": err.Error(), "message": err.Error()}})
	case ErrFileStillLinked, ErrDeliveryNotRetry:
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": err.Error(), "message": err.Error()}})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": err.Error()}})
	}
}
