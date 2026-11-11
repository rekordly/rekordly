package finance

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

// RegisterMoneyCaptureRoutes implements Blueprint 03. The active workspace is
// resolved by authenticated server context; the client never selects it in a body.
func (h *Handler) RegisterMoneyCaptureRoutes(protected *gin.RouterGroup) {
	protected.POST("/money-record-drafts", h.createMoneyRecordDraft)
	protected.GET("/money-record-drafts", h.listMoneyRecordDrafts)
	protected.GET("/money-record-drafts/:id", h.getMoneyRecordDraft)
	protected.PATCH("/money-record-drafts/:id", h.updateMoneyRecordDraft)
	protected.DELETE("/money-record-drafts/:id", h.discardMoneyRecordDraft)
	protected.POST("/money-record-drafts/:id/preview", h.previewMoneyRecordDraft)
	protected.POST("/money-record-drafts/:id/links", h.createMoneyRecordDraftLink)
	protected.GET("/money-record-drafts/:id/links", h.listMoneyRecordDraftLinks)
	protected.POST("/money-record-drafts/:id/attachments/upload-authorizations", h.authorizeEvidenceUpload)
	protected.POST("/money-record-drafts/:id/evidence", h.registerEvidenceAsset)
	protected.GET("/evidence/:id/access", h.getEvidenceAccess)
	protected.POST("/commands/confirm-money-record", h.confirmMoneyRecord)
	protected.GET("/money-records", h.listMoneyRecords)
	protected.GET("/money-records/:id", h.getMoneyRecord)
	protected.POST("/transactions/import-csv", h.importCSVDrafts)
}

type importCSVRow struct {
	Date        string  `json:"date" binding:"required"`
	Description string  `json:"description" binding:"required"`
	Amount      string  `json:"amount" binding:"required"`
	Direction   string  `json:"direction" binding:"required"`
	Reference   string  `json:"reference"`
	AccountID   *int64  `json:"account_id"`
	CategoryID  *int64  `json:"category_id"`
}

type importCSVRequest struct {
	DefaultAccountID int64          `json:"default_account_id"`
	Rows             []importCSVRow `json:"rows" binding:"required"`
}

func (h *Handler) importCSVDrafts(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	var in importCSVRequest
	if err := c.ShouldBindJSON(&in); err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_REQUEST", err)
		return
	}
	if len(in.Rows) == 0 {
		moneyCaptureError(c, http.StatusBadRequest, "EMPTY_IMPORT", errors.New("no rows provided for import"))
		return
	}
	if len(in.Rows) > 500 {
		moneyCaptureError(c, http.StatusBadRequest, "IMPORT_LIMIT_EXCEEDED", errors.New("maximum 500 rows per import"))
		return
	}

	createdDrafts := make([]gin.H, 0, len(in.Rows))
	for idx, row := range in.Rows {
		accountID := row.AccountID
		if accountID == nil && in.DefaultAccountID > 0 {
			accountID = &in.DefaultAccountID
		}
		direction := row.Direction
		if direction != "money_in" && direction != "money_out" {
			direction = "money_out"
		}
		scopeType := wsCtx.Kind
		if scopeType != "personal" && scopeType != "business" {
			scopeType = "business"
		}
		purpose := "expense"
		if direction == "money_in" {
			purpose = "income"
		}

		draftIn := MoneyRecordDraftInput{
			EntryMethod:    "import",
			Direction:      direction,
			ScopeType:      scopeType,
			Purpose:        purpose,
			Amount:         row.Amount,
			EffectiveDate:  row.Date,
			MoneyAccountID: accountID,
			CategoryID:     row.CategoryID,
			Description:    row.Description,
			Reference:      row.Reference,
		}

		draft, err := h.service.CreateMoneyRecordDraft(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, wsCtx.Kind, draftIn)
		if err != nil {
			moneyCaptureError(c, http.StatusBadRequest, "ROW_IMPORT_FAILED", fmt.Errorf("row %d failed: %w", idx+1, err))
			return
		}
		createdDrafts = append(createdDrafts, moneyRecordDraftView(draft))
	}

	c.JSON(http.StatusCreated, gin.H{
		"data": gin.H{
			"imported_count": len(createdDrafts),
			"drafts":         createdDrafts,
		},
	})
}

func (h *Handler) createMoneyRecordDraft(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	var in MoneyRecordDraftInput
	if err := c.ShouldBindJSON(&in); err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_REQUEST", err)
		return
	}
	draft, err := h.service.CreateMoneyRecordDraft(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, wsCtx.Kind, in)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"draft": moneyRecordDraftView(draft)}})
}

func (h *Handler) listMoneyRecordDrafts(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	beforeID, err := optionalPositiveInt(c.Query("before_id"))
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_CURSOR", err)
		return
	}
	limit, err := optionalLimit(c.Query("limit"))
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_LIMIT", err)
		return
	}
	drafts, err := h.service.ListMoneyRecordDrafts(c.Request.Context(), wsCtx.WorkspaceID, c.Query("state"), beforeID, limit)
	if err != nil {
		moneyCaptureError(c, http.StatusInternalServerError, "INTERNAL_ERROR", err)
		return
	}
	items := make([]gin.H, 0, len(drafts))
	for _, draft := range drafts {
		items = append(items, moneyRecordDraftView(draft))
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"drafts": items}})
}

func (h *Handler) getMoneyRecordDraft(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	draftID, err := requiredPositiveParam(c, "id")
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_ID", err)
		return
	}
	detail, err := h.service.GetMoneyRecordDraftDetail(c.Request.Context(), wsCtx.WorkspaceID, draftID)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	links := make([]gin.H, 0, len(detail.Links))
	for _, link := range detail.Links {
		links = append(links, moneyRecordDraftLinkView(link))
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"draft": moneyRecordDraftView(detail.Draft), "links": links, "evidence": evidenceAssetsView(detail.Evidence)}})
}

func (h *Handler) updateMoneyRecordDraft(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	draftID, err := requiredPositiveParam(c, "id")
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_ID", err)
		return
	}
	var in UpdateMoneyRecordDraftInput
	if err := c.ShouldBindJSON(&in); err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_REQUEST", err)
		return
	}
	draft, err := h.service.UpdateMoneyRecordDraft(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, wsCtx.Kind, draftID, in)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"draft": moneyRecordDraftView(draft)}})
}

type discardMoneyRecordDraftRequest struct {
	ExpectedVersion int32 `json:"expected_version" binding:"required"`
}

func (h *Handler) discardMoneyRecordDraft(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	draftID, err := requiredPositiveParam(c, "id")
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_ID", err)
		return
	}
	var in discardMoneyRecordDraftRequest
	if err := c.ShouldBindJSON(&in); err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_REQUEST", err)
		return
	}
	draft, err := h.service.DiscardMoneyRecordDraft(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, draftID, in.ExpectedVersion)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"draft": moneyRecordDraftView(draft)}})
}

func (h *Handler) previewMoneyRecordDraft(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	draftID, err := requiredPositiveParam(c, "id")
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_ID", err)
		return
	}
	preview, err := h.service.PreviewMoneyRecordDraft(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.Kind, draftID)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"preview": preview}})
}

func (h *Handler) createMoneyRecordDraftLink(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	draftID, err := requiredPositiveParam(c, "id")
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_ID", err)
		return
	}
	var in MoneyRecordDraftLinkInput
	if err := c.ShouldBindJSON(&in); err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_REQUEST", err)
		return
	}
	link, err := h.service.CreateMoneyRecordDraftLink(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, draftID, in)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"link": moneyRecordDraftLinkView(link)}})
}

func (h *Handler) listMoneyRecordDraftLinks(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	draftID, err := requiredPositiveParam(c, "id")
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_ID", err)
		return
	}
	links, err := h.service.ListMoneyRecordDraftLinks(c.Request.Context(), wsCtx.WorkspaceID, draftID)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	items := make([]gin.H, 0, len(links))
	for _, link := range links {
		items = append(items, moneyRecordDraftLinkView(link))
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"links": items}})
}

type evidenceUploadAuthorizationRequest struct {
	FileName  string `json:"file_name" binding:"required"`
	MimeType  string `json:"mime_type" binding:"required"`
	SizeBytes string `json:"size_bytes" binding:"required"`
}

func (h *Handler) authorizeEvidenceUpload(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	draftID, err := requiredPositiveParam(c, "id")
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_ID", err)
		return
	}
	var in evidenceUploadAuthorizationRequest
	if err := c.ShouldBindJSON(&in); err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_REQUEST", err)
		return
	}
	sizeBytes, err := parseDraftAmount("", in.SizeBytes, 0)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	authorization, err := h.service.AuthorizeEvidenceUpload(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, draftID, in.FileName, in.MimeType, sizeBytes)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"upload": authorization}})
}

func (h *Handler) registerEvidenceAsset(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	draftID, err := requiredPositiveParam(c, "id")
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_ID", err)
		return
	}
	var in EvidenceRegistrationInput
	if err := c.ShouldBindJSON(&in); err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_REQUEST", err)
		return
	}
	asset, err := h.service.RegisterEvidenceAsset(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, draftID, in)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"evidence": evidenceAssetsView([]db.EvidenceAsset{asset})[0]}})
}

func (h *Handler) getEvidenceAccess(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	evidenceID, err := requiredPositiveParam(c, "id")
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_ID", err)
		return
	}
	access, err := h.service.GetEvidenceAccess(c.Request.Context(), wsCtx.WorkspaceID, evidenceID)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"access": access}})
}

func (h *Handler) confirmMoneyRecord(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	var in ConfirmMoneyRecordInput
	if err := c.ShouldBindJSON(&in); err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_REQUEST", err)
		return
	}
	result, err := h.service.ConfirmMoneyRecord(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, wsCtx.Kind, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	status := http.StatusCreated
	if result.WasDuplicate {
		status = http.StatusOK
	}
	c.JSON(status, gin.H{"data": moneyRecordConfirmationView(result)})
}

func (h *Handler) listMoneyRecords(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	beforeID, err := optionalPositiveInt(c.Query("before_id"))
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_CURSOR", err)
		return
	}
	limit, err := optionalLimit(c.Query("limit"))
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_LIMIT", err)
		return
	}
	records, err := h.service.ListMoneyRecords(c.Request.Context(), wsCtx.WorkspaceID, c.Query("status"), beforeID, limit)
	if err != nil {
		moneyCaptureError(c, http.StatusInternalServerError, "INTERNAL_ERROR", err)
		return
	}
	items := make([]gin.H, 0, len(records))
	for _, record := range records {
		items = append(items, moneyRecordView(record))
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"records": items}})
}

func (h *Handler) getMoneyRecord(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	recordID, err := requiredPositiveParam(c, "id")
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_ID", err)
		return
	}
	detail, err := h.service.GetMoneyRecordDetail(c.Request.Context(), wsCtx.WorkspaceID, recordID)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	parts := make([]gin.H, 0, len(detail.Parts))
	for _, part := range detail.Parts {
		parts = append(parts, gin.H{"id": strconv.FormatInt(part.ID, 10), "workspace_id": strconv.FormatInt(part.WorkspaceID, 10), "amount_minor": strconv.FormatInt(part.AmountMinor, 10), "currency": part.Currency, "purpose": part.Purpose, "category_id": pgInt8View(part.CategoryID), "transaction_id": pgInt8View(part.TransactionID)})
	}
	links := make([]gin.H, 0, len(detail.Links))
	for _, link := range detail.Links {
		links = append(links, gin.H{"id": strconv.FormatInt(link.ID, 10), "link_type": link.LinkType, "linked_record_id": strconv.FormatInt(link.LinkedRecordID, 10), "allocated_amount_minor": pgInt8View(link.AllocatedAmountMinor), "metadata": jsonView(link.Metadata)})
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"record": moneyRecordView(detail.Record), "transaction": moneyTransactionView(detail.Transaction), "parts": parts, "links": links, "evidence": evidenceAssetsView(detail.Evidence)}})
}

func moneyCaptureWorkspace(c *gin.Context) (WorkspaceContext, bool) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_WORKSPACE", err)
		return WorkspaceContext{}, false
	}
	required := "money.create"
	if c.Request.Method == http.MethodGet {
		if !wsCtx.HasPermission("money.view") && !wsCtx.HasPermission("money.create") {
			c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Missing money.view permission"}})
			return WorkspaceContext{}, false
		}
		return wsCtx, true
	}
	if !wsCtx.HasPermission(required) {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Missing money.create permission"}})
		return WorkspaceContext{}, false
	}
	return wsCtx, true
}

func moneyCaptureServiceError(c *gin.Context, err error) {
	status, code := http.StatusBadRequest, "MONEY_CAPTURE_FAILED"
	switch {
	case errors.Is(err, ErrNotFound):
		status, code = http.StatusNotFound, "NOT_FOUND"
	case errors.Is(err, ErrDraftNotOwned), errors.Is(err, ErrForbiddenAccount), errors.Is(err, ErrForbiddenCategory), errors.Is(err, ErrCrossWorkspaceScope):
		status, code = http.StatusForbidden, "FORBIDDEN"
	case errors.Is(err, ErrDraftVersionConflict):
		status, code = http.StatusConflict, "DRAFT_VERSION_CONFLICT"
	case errors.Is(err, ErrIdempotencyConflict):
		status, code = http.StatusConflict, "IDEMPOTENCY_CONFLICT"
	case errors.Is(err, ErrIdempotencyRequired):
		code = "IDEMPOTENCY_KEY_REQUIRED"
	case errors.Is(err, ErrAllocationRequired):
		code = "ALLOCATION_REQUIRED"
	case errors.Is(err, ErrMixedRuleNotConfigured):
		code = "MIXED_RULES_REQUIRED"
	case errors.Is(err, ErrAccountInactive):
		code = "ACCOUNT_INACTIVE"
	case errors.Is(err, ErrAccountCurrencyMismatch):
		code = "ACCOUNT_CURRENCY_MISMATCH"
	case errors.Is(err, ErrFutureDatedConfirmation):
		code = "FUTURE_DATE_REQUIRES_DRAFT"
	case errors.Is(err, ErrEvidenceUnavailable):
		status, code = http.StatusServiceUnavailable, "DEPENDENCY_UNAVAILABLE"
	case errors.Is(err, ErrEvidenceType):
		code = "EVIDENCE_TYPE_NOT_ALLOWED"
	case errors.Is(err, ErrEvidenceSize):
		code = "EVIDENCE_SIZE_LIMIT"
	case errors.Is(err, ErrEvidenceAsset):
		code = "EVIDENCE_ASSET_INVALID"
	case errors.Is(err, ErrMixedAllocationMismatch):
		code = "ALLOCATION_MISMATCH"
	case errors.Is(err, ErrMixedWorkspaceAccess), errors.Is(err, ErrMixedPayerAccount):
		status, code = http.StatusForbidden, "FORBIDDEN"
	case errors.Is(err, ErrMixedSettlementVersion):
		status, code = http.StatusConflict, "SETTLEMENT_VERSION_CONFLICT"
	case errors.Is(err, ErrMixedSettlementState), errors.Is(err, ErrMixedSettlementRoute):
		status, code = http.StatusConflict, "MIXED_SETTLEMENT_CONFLICT"
	}
	moneyCaptureError(c, status, code, err)
}

func moneyCaptureError(c *gin.Context, status int, code string, err error) {
	c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
}

func requiredPositiveParam(c *gin.Context, name string) (int64, error) {
	return optionalPositiveInt(c.Param(name))
}
func optionalPositiveInt(raw string) (int64, error) {
	if raw == "" {
		return 0, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value <= 0 {
		return 0, errors.New("value must be a positive integer")
	}
	return value, nil
}
func optionalLimit(raw string) (int32, error) {
	if raw == "" {
		return 50, nil
	}
	value, err := strconv.ParseInt(raw, 10, 32)
	if err != nil || value < 1 || value > 100 {
		return 0, errors.New("limit must be between 1 and 100")
	}
	return int32(value), nil
}
func jsonView(raw []byte) any {
	if len(raw) == 0 {
		return gin.H{}
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return gin.H{}
	}
	return value
}

func moneyRecordDraftView(draft db.MoneyRecordDraft) gin.H {
	return gin.H{"id": strconv.FormatInt(draft.ID, 10), "workspace_id": strconv.FormatInt(draft.WorkspaceID, 10), "state": draft.State, "version": draft.Version, "entry_method": draft.EntryMethod, "direction": draft.Direction, "scope_type": draft.ScopeType, "purpose": draft.Purpose, "amount_minor": strconv.FormatInt(draft.AmountMinor, 10), "currency": draft.Currency, "currency_exponent": draft.CurrencyExponent, "effective_date": draft.EffectiveDate.Time.Format("2006-01-02"), "money_account_id": pgInt8View(draft.MoneyAccountID), "destination_account_id": pgInt8View(draft.DestinationAccountID), "category_id": pgInt8View(draft.CategoryID), "counterparty_id": pgInt8View(draft.CounterpartyID), "counterparty_name": pgTextView(draft.CounterpartyName), "description": pgTextView(draft.Description), "reference": pgTextView(draft.Reference), "tags": jsonView(draft.Tags), "payload": jsonView(draft.Payload), "ai_metadata": jsonView(draft.AiMetadata), "client_command_id": pgTextView(draft.ClientCommandID), "confirmed_record_id": pgInt8View(draft.ConfirmedRecordID)}
}
func moneyRecordView(record db.MoneyRecord) gin.H {
	return gin.H{"id": strconv.FormatInt(record.ID, 10), "workspace_id": strconv.FormatInt(record.WorkspaceID, 10), "draft_id": pgInt8View(record.DraftID), "transaction_id": pgInt8View(record.TransactionID), "direction": record.Direction, "scope_type": record.ScopeType, "purpose": record.Purpose, "entry_method": record.EntryMethod, "status": record.Status, "amount_minor": strconv.FormatInt(record.AmountMinor, 10), "currency": record.Currency, "currency_exponent": record.CurrencyExponent, "effective_date": record.EffectiveDate.Time.Format("2006-01-02"), "money_account_id": pgInt8View(record.MoneyAccountID), "destination_account_id": pgInt8View(record.DestinationAccountID), "category_id": pgInt8View(record.CategoryID), "counterparty_id": pgInt8View(record.CounterpartyID), "counterparty_name": pgTextView(record.CounterpartyName), "description": pgTextView(record.Description), "reference": pgTextView(record.Reference)}
}
func moneyTransactionView(transaction db.MoneyTransaction) gin.H {
	return gin.H{"id": strconv.FormatInt(transaction.ID, 10), "amount_minor": strconv.FormatInt(transaction.AmountMinor, 10), "currency": transaction.Currency, "currency_exponent": transaction.CurrencyExponent, "status": transaction.Status, "direction": transaction.Direction, "purpose": transaction.Purpose}
}
func evidenceAssetsView(items []db.EvidenceAsset) []gin.H {
	out := make([]gin.H, 0, len(items))
	for _, item := range items {
		out = append(out, gin.H{"id": strconv.FormatInt(item.ID, 10), "asset_id": item.AssetID, "storage_provider": item.StorageProvider, "delivery_type": item.DeliveryType, "original_file_name": item.OriginalFileName, "byte_size": strconv.FormatInt(item.ByteSize, 10), "mime_type": item.MimeType, "status": item.Status})
	}
	return out
}
func moneyRecordConfirmationView(result MoneyRecordConfirmation) gin.H {
	lines := make([]gin.H, 0, len(result.LedgerLines))
	for _, line := range result.LedgerLines {
		lines = append(lines, gin.H{"id": strconv.FormatInt(line.ID, 10), "account_class": line.AccountClass, "debit_minor": strconv.FormatInt(line.DebitMinor, 10), "credit_minor": strconv.FormatInt(line.CreditMinor, 10)})
	}
	return gin.H{"draft": moneyRecordDraftView(result.Draft), "record": moneyRecordView(result.Record), "transaction": moneyTransactionView(result.Transaction), "ledger_entry_id": strconv.FormatInt(result.LedgerEntry.ID, 10), "ledger_lines": lines, "evidence": evidenceAssetsView(result.Evidence), "was_duplicate": result.WasDuplicate}
}
func moneyRecordDraftLinkView(link db.MoneyRecordDraftLink) gin.H {
	return gin.H{"id": strconv.FormatInt(link.ID, 10), "draft_id": strconv.FormatInt(link.DraftID, 10), "link_type": link.LinkType, "linked_record_id": strconv.FormatInt(link.LinkedRecordID, 10), "allocated_amount_minor": pgInt8View(link.AllocatedAmountMinor), "metadata": jsonView(link.Metadata)}
}
func pgInt8View(value pgtype.Int8) any {
	if !value.Valid {
		return nil
	}
	return strconv.FormatInt(value.Int64, 10)
}
func pgTextView(value pgtype.Text) any {
	if !value.Valid {
		return nil
	}
	return value.String
}
