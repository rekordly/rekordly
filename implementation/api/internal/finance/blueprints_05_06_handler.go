package finance

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

func (h *Handler) RegisterBlueprintsCompletionRoutes(protected *gin.RouterGroup) {
	// Proforma -> Invoice conversion
	protected.POST("/proformas/:id/convert", h.convertProformaToInvoice)

	// Debit notes
	protected.GET("/debit-notes", h.listDebitNotes)
	protected.POST("/debit-notes", h.createDebitNote)
	protected.GET("/debit-notes/:id", h.getDebitNote)
	protected.POST("/debit-notes/:id/void", h.voidDebitNote)

	// Document revision history
	protected.GET("/documents/:docType/:id/versions", h.listDocumentVersions)

	// Counterparty duplicate check
	protected.GET("/counterparties/check-duplicates", h.checkDuplicateCounterparties)

	// External portal evidences, messages & claim links (team inbox & authenticated party)
	protected.GET("/documents/:docType/:id/payment-evidences", h.listDocumentPaymentEvidences)
	protected.POST("/payment-evidences/:evidenceId/review", h.reviewExternalPaymentEvidence)
	protected.GET("/documents/:docType/:id/messages", h.listTeamDocumentMessages)
	protected.POST("/documents/:docType/:id/messages", h.postTeamDocumentMessage)
	protected.POST("/documents/:docType/:id/messages/read", h.markDocumentMessagesRead)
	protected.POST("/documents/:docType/:id/files", h.attachDocumentFile)
	protected.DELETE("/documents/:docType/:id/files/:fileId", h.removeDocumentFile)
	protected.POST("/external-links/claim", h.claimExternalPartyLink)
	protected.GET("/external-links", h.listMyExternalPartyLinks)

	// Outlet scope management for team members (Blueprint 02 §16)
	protected.PATCH("/settings/team/members/:memberId/outlet-scope", h.updateMemberOutletScope)
}

func (h *Handler) RegisterPublicBlueprintsCompletionRoutes(group *gin.RouterGroup) {
	group.POST("/public/invoices/:token/payment-evidence", h.submitPublicPaymentEvidence)
	group.GET("/public/:docType/:token/messages", h.listPublicDocumentMessages)
	group.POST("/public/:docType/:token/messages", h.postPublicDocumentMessage)
}

func (h *Handler) convertProformaToInvoice(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.create", "sales.create")
	if !ok {
		return
	}
	proformaID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || proformaID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid proforma ID"}})
		return
	}
	var in struct {
		FinalizeNow    bool   `json:"finalize_now"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	_ = c.ShouldBindJSON(&in)
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}

	detail, err := h.service.ConvertProformaToInvoice(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, proformaID, in.FinalizeNow, in.IdempotencyKey)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "PROFORMA_CONVERT_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": detail})
}

func (h *Handler) listDebitNotes(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.view", "sales.view")
	if !ok {
		return
	}
	var custParam, invParam pgtype.Int8
	if cid, err := strconv.ParseInt(c.Query("customer_id"), 10, 64); err == nil && cid > 0 {
		custParam = pgtype.Int8{Int64: cid, Valid: true}
	}
	if iid, err := strconv.ParseInt(c.Query("invoice_id"), 10, 64); err == nil && iid > 0 {
		invParam = pgtype.Int8{Int64: iid, Valid: true}
	}
	rows, err := h.service.queries.ListDebitNotes(c.Request.Context(), db.ListDebitNotesParams{
		WorkspaceID: wsCtx.WorkspaceID,
		CustomerID:  custParam,
		InvoiceID:   invParam,
		Limit:       100,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"debit_notes": rows}})
}

func (h *Handler) createDebitNote(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.create", "sales.create")
	if !ok {
		return
	}
	var in CreateDebitNoteInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	detail, err := h.service.CreateDebitNote(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CREATE_DEBIT_NOTE_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": detail})
}

func (h *Handler) getDebitNote(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.view", "sales.view")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid debit note ID"}})
		return
	}
	dn, err := h.service.queries.GetDebitNoteByID(c.Request.Context(), db.GetDebitNoteByIDParams{ID: id, WorkspaceID: wsCtx.WorkspaceID})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Debit note not found"}})
		return
	}
	items, _ := h.service.queries.ListDebitNoteItems(c.Request.Context(), db.ListDebitNoteItemsParams{DebitNoteID: dn.ID, WorkspaceID: wsCtx.WorkspaceID})
	c.JSON(http.StatusOK, gin.H{"data": DebitNoteDetail{DebitNote: dn, Items: items}})
}

func (h *Handler) voidDebitNote(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.create", "money.void")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid debit note ID"}})
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&in)
	if strings.TrimSpace(in.Reason) == "" {
		in.Reason = "Voided by user"
	}
	dn, err := h.service.VoidDebitNote(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, in.Reason)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VOID_DEBIT_NOTE_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"debit_note": dn}})
}

func (h *Handler) listDocumentVersions(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.view", "sales.view")
	if !ok {
		return
	}
	docType := c.Param("docType")
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid document ID"}})
		return
	}
	versions, err := h.service.ListDocumentVersions(c.Request.Context(), wsCtx.WorkspaceID, docType, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"versions": versions}})
}

func (h *Handler) checkDuplicateCounterparties(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "contacts.view", "sales.view", "purchases.view")
	if !ok {
		return
	}
	name := strings.TrimSpace(c.Query("name"))
	email := strings.TrimSpace(c.Query("email"))
	phone := strings.TrimSpace(c.Query("phone"))
	if name == "" && email == "" && phone == "" {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"matches": []db.Counterparty{}}})
		return
	}
	matches, err := h.service.queries.FindPossibleDuplicateCounterparties(c.Request.Context(), db.FindPossibleDuplicateCounterpartiesParams{
		WorkspaceID: wsCtx.WorkspaceID,
		Name:        optionalPgText(name),
		Email:       optionalPgText(email),
		Phone:       optionalPgText(phone),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"matches": matches}})
}

func (h *Handler) submitPublicPaymentEvidence(c *gin.Context) {
	var in SubmitPaymentEvidenceInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	ev, err := h.service.SubmitPublicPaymentEvidence(c.Request.Context(), c.Param("token"), in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "EVIDENCE_SUBMIT_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"evidence": ev}})
}

func (h *Handler) listDocumentPaymentEvidences(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.view", "sales.view")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid document ID"}})
		return
	}
	rows, err := h.service.queries.ListExternalPaymentEvidenceForDoc(c.Request.Context(), db.ListExternalPaymentEvidenceForDocParams{
		WorkspaceID:  wsCtx.WorkspaceID,
		DocumentType: c.Param("docType"),
		DocumentID:   id,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"evidences": rows}})
}

func (h *Handler) reviewExternalPaymentEvidence(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.create", "sales.create")
	if !ok {
		return
	}
	evID, err := strconv.ParseInt(c.Param("evidenceId"), 10, 64)
	if err != nil || evID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid evidence ID"}})
		return
	}
	var in struct {
		Status string `json:"status" binding:"required"` // approved or rejected
		Note   string `json:"note"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.Status != "approved" && in.Status != "rejected" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_STATUS", "message": "Status must be approved or rejected"}})
		return
	}
	ev, err := h.service.queries.ReviewExternalPaymentEvidence(c.Request.Context(), db.ReviewExternalPaymentEvidenceParams{
		ID:               evID,
		WorkspaceID:      wsCtx.WorkspaceID,
		Status:           in.Status,
		ReviewedByUserID: pgtype.Int8{Int64: wsCtx.UserID, Valid: true},
		ReviewNote:       optionalPgText(in.Note),
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "REVIEW_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"evidence": ev}})
}

func (h *Handler) listPublicDocumentMessages(c *gin.Context) {
	msgs, err := h.service.ListPublicMessages(c.Request.Context(), c.Param("docType"), c.Param("token"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"messages": msgs}})
}

func (h *Handler) postPublicDocumentMessage(c *gin.Context) {
	var in PostExternalMessageInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	msg, err := h.service.PostPublicMessage(c.Request.Context(), c.Param("docType"), c.Param("token"), in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "MESSAGE_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"message": msg}})
}

func isAllowedDocumentType(docType string) bool {
	switch docType {
	case "purchase_order", "invoice", "supplier_bill", "goods_receipt", "purchase":
		return true
	default:
		return false
	}
}

func (h *Handler) listTeamDocumentMessages(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "contacts.view", "invoices.view", "purchases.view")
	if !ok {
		return
	}
	docType := c.Param("docType")
	if !isAllowedDocumentType(docType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_DOC_TYPE", "message": "Unsupported document type"}})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid document ID"}})
		return
	}
	msgs, err := h.service.queries.ListExternalMessagesForDoc(c.Request.Context(), db.ListExternalMessagesForDocParams{
		WorkspaceID:  wsCtx.WorkspaceID,
		DocumentType: docType,
		DocumentID:   id,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	unreadCount, _ := h.service.queries.CountUnreadDocumentMessages(c.Request.Context(), db.CountUnreadDocumentMessagesParams{
		WorkspaceID:  wsCtx.WorkspaceID,
		DocumentType: docType,
		DocumentID:   id,
		UserID:       wsCtx.UserID,
	})
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"messages": msgs, "unread_count": unreadCount}})
}

func (h *Handler) postTeamDocumentMessage(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "contacts.manage", "invoices.create", "purchases.create")
	if !ok {
		return
	}
	docType := c.Param("docType")
	if !isAllowedDocumentType(docType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_DOC_TYPE", "message": "Unsupported document type"}})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid document ID"}})
		return
	}
	var in struct {
		Message    string `json:"message" binding:"required"`
		SenderName string `json:"sender_name"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	sender := strings.TrimSpace(in.SenderName)
	if sender == "" {
		if ws, err := h.service.queries.GetWorkspaceProfile(c.Request.Context(), wsCtx.WorkspaceID); err == nil && ws.Name != "" {
			sender = ws.Name
		} else {
			sender = "Team"
		}
	}
	msg, err := h.service.queries.CreateExternalMessage(c.Request.Context(), db.CreateExternalMessageParams{
		WorkspaceID:  wsCtx.WorkspaceID,
		DocumentType: docType,
		DocumentID:   id,
		SenderType:   "team",
		SenderName:   sender,
		Message:      strings.TrimSpace(in.Message),
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "MESSAGE_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"message": msg}})
}

func (h *Handler) markDocumentMessagesRead(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "contacts.view", "invoices.view", "purchases.view")
	if !ok {
		return
	}
	docType := c.Param("docType")
	if !isAllowedDocumentType(docType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_DOC_TYPE", "message": "Unsupported document type"}})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid document ID"}})
		return
	}
	var in struct {
		LastReadMessageID int64 `json:"last_read_message_id"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if err := h.service.queries.UpsertDocumentMessageRead(c.Request.Context(), db.UpsertDocumentMessageReadParams{
		WorkspaceID:       wsCtx.WorkspaceID,
		UserID:            wsCtx.UserID,
		DocumentType:      docType,
		DocumentID:        id,
		LastReadMessageID: in.LastReadMessageID,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"success": true}})
}

func (h *Handler) attachDocumentFile(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "contacts.manage", "invoices.create", "purchases.create")
	if !ok {
		return
	}
	docType := c.Param("docType")
	if !isAllowedDocumentType(docType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_DOC_TYPE", "message": "Unsupported document type"}})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid document ID"}})
		return
	}
	var in AttachDocumentFileInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	fileView, err := h.service.AttachDocumentFile(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, docType, id, in)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Document not found"}})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "ATTACH_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"file": fileView}})
}

func (h *Handler) removeDocumentFile(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "contacts.manage", "invoices.create", "purchases.create")
	if !ok {
		return
	}
	docType := c.Param("docType")
	if !isAllowedDocumentType(docType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_DOC_TYPE", "message": "Unsupported document type"}})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid document ID"}})
		return
	}
	fileID, err := strconv.ParseInt(c.Param("fileId"), 10, 64)
	if err != nil || fileID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid file ID"}})
		return
	}
	rows, err := h.service.queries.DeleteDocumentFile(c.Request.Context(), db.DeleteDocumentFileParams{
		WorkspaceID:  wsCtx.WorkspaceID,
		DocumentType: docType,
		DocumentID:   id,
		ID:           fileID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Document file not found"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"success": true}})
}

func (h *Handler) claimExternalPartyLink(c *gin.Context) {
	userID, ok := c.Get(ContextUserIDKey)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Authentication required"}})
		return
	}
	var in struct {
		DocumentType string `json:"document_type" binding:"required"`
		Token        string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	link, err := h.service.ClaimExternalPartyLink(c.Request.Context(), userID.(int64), in.DocumentType, in.Token)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CLAIM_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"link": link}})
}

func (h *Handler) listMyExternalPartyLinks(c *gin.Context) {
	userID, ok := c.Get(ContextUserIDKey)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Authentication required"}})
		return
	}
	links, err := h.service.queries.ListExternalPartyLinksForUser(c.Request.Context(), userID.(int64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"links": links}})
}

func (h *Handler) updateMemberOutletScope(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "settings.manage")
	if !ok {
		return
	}
	memberID, err := strconv.ParseInt(c.Param("memberId"), 10, 64)
	if err != nil || memberID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid member ID"}})
		return
	}
	var in struct {
		OutletIDs []int64 `json:"outlet_ids"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	scopeMap := map[string]any{}
	if len(in.OutletIDs) > 0 {
		scopeMap["outlet_ids"] = in.OutletIDs
	}
	raw, _ := json.Marshal(scopeMap)
	updated, err := h.service.queries.UpdateMembershipOutletScope(c.Request.Context(), db.UpdateMembershipOutletScopeParams{
		ID:          memberID,
		WorkspaceID: wsCtx.WorkspaceID,
		OutletScope: raw,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "UPDATE_SCOPE_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"membership": updated}})
}
