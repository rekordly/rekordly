package finance

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterBlueprint12Routes(protected *gin.RouterGroup) {
	ws := protected.Group("/workspaces/:id")
	{
		// AI Assistant (drafts only)
		ws.POST("/ai/money-drafts", h.createAIMoneyDraft)
		ws.GET("/ai/requests/:requestId", h.getAIRequest)
		ws.GET("/ai/usage", h.getAIUsage)
		ws.GET("/ai/drafts", h.listAIDrafts)
		ws.PATCH("/ai/drafts/:draftId", h.updateAIDraft)
		ws.GET("/ai/drafts/:draftId/preview", h.previewAIDraft)
		ws.POST("/ai/drafts/:draftId/commands/confirm", h.confirmAIDraft)
		ws.POST("/ai/drafts/:draftId/commands/discard", h.discardAIDraft)

		// CSV Imports
		ws.POST("/imports", h.createImportBatch)
		ws.GET("/imports", h.listImportBatches)
		ws.GET("/imports/:batch", h.getImportBatch)
		ws.POST("/imports/:batch/commands/set-mapping", h.setImportMapping)
		ws.POST("/imports/:batch/commands/analyze", h.analyzeImportBatch)
		ws.GET("/imports/:batch/rows", h.listImportRows)
		ws.PATCH("/imports/:batch/rows/:rowId", h.updateImportRow)
		ws.POST("/imports/:batch/commands/bulk-action", h.bulkUpdateImportRows)
		ws.POST("/imports/:batch/commands/confirm", h.confirmImportBatch)
		ws.POST("/imports/:batch/commands/undo", h.undoImportBatch)
		ws.GET("/imports/:batch/export-failures", h.exportImportFailures)

		// Background Jobs & Dead-Letter Operations
		ws.GET("/jobs/:job", h.getJob)
		ws.GET("/failed-jobs", h.listFailedJobs)
		ws.POST("/failed-jobs/:job/commands/retry", h.retryFailedJob)
		ws.POST("/failed-jobs/:job/commands/cancel", h.cancelFailedJob)

		// Deterministic Automation
		ws.GET("/automations", h.listAutomations)
		ws.PUT("/automations/:ruleKey", h.upsertAutomationRule)
		ws.POST("/automations/:ruleKey/commands/run", h.runAutomationRule)
	}
}

func (h *Handler) createAIMoneyDraft(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ai.use")
	if !ok {
		return
	}
	var in CreateAIMoneyDraftInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.ParseAIMoneyDraft(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) getAIRequest(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ai.use")
	if !ok {
		return
	}
	reqID, err := strconv.ParseInt(c.Param("requestId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid request id"}})
		return
	}
	res, err := h.service.GetAIRequest(c.Request.Context(), wsCtx.WorkspaceID, reqID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getAIUsage(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ai.view_usage", "ai.use")
	if !ok {
		return
	}
	res, err := h.service.GetAIUsage(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listAIDrafts(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ai.use")
	if !ok {
		return
	}
	res, err := h.service.ListAIDrafts(c.Request.Context(), wsCtx.WorkspaceID, c.Query("status"))
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) updateAIDraft(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ai.use")
	if !ok {
		return
	}
	draftID, err := strconv.ParseInt(c.Param("draftId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid draft id"}})
		return
	}
	var in UpdateAIDraftInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.UpdateAIDraft(c.Request.Context(), wsCtx.WorkspaceID, draftID, in)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) previewAIDraft(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ai.use")
	if !ok {
		return
	}
	draftID, err := strconv.ParseInt(c.Param("draftId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid draft id"}})
		return
	}
	res, err := h.service.PreviewAIDraftEffect(c.Request.Context(), wsCtx.WorkspaceID, draftID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) confirmAIDraft(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "transactions.create", "imports.confirm")
	if !ok {
		return
	}
	draftID, err := strconv.ParseInt(c.Param("draftId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid draft id"}})
		return
	}
	res, err := h.service.ConfirmAIDraft(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, draftID, c.GetHeader("Idempotency-Key"))
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) discardAIDraft(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ai.use")
	if !ok {
		return
	}
	draftID, err := strconv.ParseInt(c.Param("draftId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid draft id"}})
		return
	}
	res, err := h.service.DiscardAIDraft(c.Request.Context(), wsCtx.WorkspaceID, draftID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createImportBatch(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "imports.create")
	if !ok {
		return
	}
	var in CreateImportInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateImportBatch(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listImportBatches(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "imports.review", "imports.create")
	if !ok {
		return
	}
	res, err := h.service.ListImportBatches(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getImportBatch(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "imports.review", "imports.create")
	if !ok {
		return
	}
	batchID, err := strconv.ParseInt(c.Param("batch"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid batch id"}})
		return
	}
	res, err := h.service.GetImportBatch(c.Request.Context(), wsCtx.WorkspaceID, batchID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) setImportMapping(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "imports.create", "imports.review")
	if !ok {
		return
	}
	batchID, err := strconv.ParseInt(c.Param("batch"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid batch id"}})
		return
	}
	var in ImportColumnMapping
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.SetImportMapping(c.Request.Context(), wsCtx.WorkspaceID, batchID, in)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) analyzeImportBatch(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "imports.review", "imports.create")
	if !ok {
		return
	}
	batchID, err := strconv.ParseInt(c.Param("batch"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid batch id"}})
		return
	}
	res, err := h.service.AnalyzeImportBatch(c.Request.Context(), wsCtx.WorkspaceID, batchID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listImportRows(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "imports.review")
	if !ok {
		return
	}
	batchID, err := strconv.ParseInt(c.Param("batch"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid batch id"}})
		return
	}
	afterID, _ := strconv.ParseInt(c.Query("after_id"), 10, 64)
	limit64, _ := strconv.ParseInt(c.Query("limit"), 10, 32)
	res, err := h.service.ListImportRows(c.Request.Context(), wsCtx.WorkspaceID, batchID, c.Query("state"), afterID, int32(limit64))
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) updateImportRow(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "imports.review")
	if !ok {
		return
	}
	batchID, _ := strconv.ParseInt(c.Param("batch"), 10, 64)
	rowID, _ := strconv.ParseInt(c.Param("rowId"), 10, 64)
	var in UpdateImportRowInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.UpdateImportRow(c.Request.Context(), wsCtx.WorkspaceID, batchID, rowID, in)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) bulkUpdateImportRows(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "imports.review")
	if !ok {
		return
	}
	batchID, _ := strconv.ParseInt(c.Param("batch"), 10, 64)
	var in BulkImportRowActionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	updated, err := h.service.BulkUpdateImportRows(c.Request.Context(), wsCtx.WorkspaceID, batchID, in)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"updated": updated}})
}

func (h *Handler) confirmImportBatch(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "imports.confirm")
	if !ok {
		return
	}
	batchID, _ := strconv.ParseInt(c.Param("batch"), 10, 64)
	var body struct {
		RowIDs []int64 `json:"row_ids"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.service.ConfirmImportBatch(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, batchID, body.RowIDs)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) undoImportBatch(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "imports.undo")
	if !ok {
		return
	}
	batchID, _ := strconv.ParseInt(c.Param("batch"), 10, 64)
	var body struct {
		Preview bool `json:"preview"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.service.UndoImportBatch(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, batchID, body.Preview)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) exportImportFailures(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "imports.review")
	if !ok {
		return
	}
	batchID, _ := strconv.ParseInt(c.Param("batch"), 10, 64)
	csvStr, err := h.service.ExportImportBatchFailuresCSV(c.Request.Context(), wsCtx.WorkspaceID, batchID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=import-failures.csv")
	c.String(http.StatusOK, csvStr)
}

func (h *Handler) getJob(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "jobs.view_failures", "ai.use", "imports.review")
	if !ok {
		return
	}
	jobID, err := strconv.ParseInt(c.Param("job"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid job id"}})
		return
	}
	res, err := h.service.GetJob(c.Request.Context(), wsCtx.WorkspaceID, jobID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listFailedJobs(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "jobs.view_failures")
	if !ok {
		return
	}
	res, err := h.service.ListFailedJobs(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) retryFailedJob(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "jobs.retry")
	if !ok {
		return
	}
	jobID, err := strconv.ParseInt(c.Param("job"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid job id"}})
		return
	}
	res, err := h.service.RetryFailedJob(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, jobID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) cancelFailedJob(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "jobs.retry")
	if !ok {
		return
	}
	jobID, _ := strconv.ParseInt(c.Param("job"), 10, 64)
	res, err := h.service.CancelFailedJob(c.Request.Context(), wsCtx.WorkspaceID, jobID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listAutomations(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "automation.manage")
	if !ok {
		return
	}
	rules, err := h.service.ListAutomationRules(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	execs, _ := h.service.ListAutomationExecutions(c.Request.Context(), wsCtx.WorkspaceID)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"rules": rules, "executions": execs}})
}

func (h *Handler) upsertAutomationRule(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "automation.manage")
	if !ok {
		return
	}
	var in UpsertAutomationRuleInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	res, err := h.service.UpsertAutomationRule(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.Param("ruleKey"), in)
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) runAutomationRule(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "automation.manage")
	if !ok {
		return
	}
	res, err := h.service.RunAutomationRule(c.Request.Context(), wsCtx.WorkspaceID, c.Param("ruleKey"))
	if err != nil {
		writeBlueprint12Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func writeBlueprint12Error(c *gin.Context, err error) {
	switch err {
	case ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": err.Error()}})
	case ErrForbiddenAccount, ErrForbiddenCategory:
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": err.Error()}})
	case ErrAINotEntitled:
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "AI_NOT_ENTITLED", "message": "AI assistant is not enabled for this plan"}})
	case ErrAICreditLimitReached:
		c.JSON(http.StatusTooManyRequests, gin.H{"error": gin.H{"code": "AI_CREDIT_LIMIT_REACHED", "message": "Workspace AI credit limit reached; use manual entry"}})
	case ErrAIRateLimited:
		c.JSON(http.StatusTooManyRequests, gin.H{"error": gin.H{"code": "AI_RATE_LIMITED", "message": "Daily user AI limit reached; use manual entry"}})
	case ErrAIInputTooLarge:
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "AI_INPUT_TOO_LARGE", "message": "Narration exceeds maximum character limit"}})
	case ErrAIProviderTimeout:
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": gin.H{"code": "AI_PROVIDER_TIMEOUT", "message": "AI provider timed out; try manual entry"}})
	case ErrAIStructuredOutputInvalid:
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": gin.H{"code": "AI_STRUCTURED_OUTPUT_INVALID", "message": "AI response did not match draft schema; use manual entry"}})
	case ErrAIDraftRequiresReview:
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": gin.H{"code": "AI_DRAFT_REQUIRES_REVIEW", "message": "Draft has missing, uncertain, or specialized fields requiring review"}})
	case ErrImportFileUnsupported, ErrImportEncodingUnsupported, ErrImportMappingInvalid, ErrImportLimitExceeded:
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": err.Error(), "message": err.Error()}})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": err.Error()}})
	}
}
