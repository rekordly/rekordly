package finance

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

func (h *Handler) RegisterBlueprint11Routes(protected *gin.RouterGroup) {
	// Workspace-scoped (works with X-Workspace-ID header or :workspace_id param)
	register := func(g *gin.RouterGroup) {
		// Chart of Accounts
		g.GET("/chart-of-accounts", h.listChartOfAccounts)
		g.POST("/chart-of-accounts/seed-defaults", h.seedChartOfAccounts)
		g.POST("/chart-of-accounts", h.createChartAccount)
		g.PATCH("/chart-of-accounts/:id", h.updateChartAccount)
		g.POST("/chart-of-accounts/:id/archive", h.archiveChartAccount)
		g.GET("/account-mappings", h.listAccountMappings)
		g.PUT("/account-mappings/:key", h.upsertAccountMapping)

		// Posting Templates & Engine
		g.GET("/posting-templates", h.listPostingTemplates)
		g.POST("/commands/preview-template-posting", h.previewTemplatePosting)
		g.POST("/commands/post-template", h.postFromTemplate)

		// Journals & Drill-down
		g.GET("/journals", h.listJournals)
		g.GET("/journals/:journal", h.getJournalDetail)
		g.POST("/journals/:journal/commands/reverse", h.reverseJournal)

		// Manual Journals
		g.GET("/manual-journal-drafts", h.listManualJournalDrafts)
		g.POST("/manual-journal-drafts", h.createManualJournalDraft)
		g.GET("/manual-journal-drafts/:id", h.getManualJournalDraft)
		g.POST("/commands/post-manual-journal", h.postManualJournal)

		// Reports & Exports
		g.GET("/reports/exports", h.listReportExports)
		g.GET("/reports/exports/:id", h.getReportExport)
		g.GET("/reports/ledger/:report", h.getLedgerReport)
		g.POST("/report-exports", h.createReportExport)

		// Subledger Reconciliation & Projection Rebuilds
		g.GET("/reconciliations/subledger", h.listSubledgerReconciliations)
		g.POST("/reconciliations/subledger", h.runSubledgerReconciliation)
		g.GET("/projection-rebuilds", h.listProjectionRebuilds)
		g.POST("/projection-rebuilds", h.runProjectionRebuild)

		// Tax Codes, Schedules & Payments
		g.GET("/tax-codes", h.listTaxCodes)
		g.POST("/tax-codes", h.createTaxCode)
		g.GET("/tax-schedules", h.listTaxSchedules)
		g.GET("/tax-payments", h.listTaxPayments)
		g.POST("/commands/record-tax-payment", h.recordTaxPayment)

		// Accounting Periods & Close
		g.GET("/periods", h.listAccountingPeriods)
		g.POST("/periods", h.createAccountingPeriod)
		g.GET("/periods/:period/checklist", h.listPeriodChecklist)
		g.POST("/periods/:period/commands/checklist", h.runPeriodChecklist)
		g.POST("/periods/:period/commands/close", h.closeAccountingPeriod)
		g.POST("/periods/:period/commands/lock", h.lockAccountingPeriod)
		g.POST("/periods/:period/commands/reopen", h.reopenAccountingPeriod)
	}

	register(protected.Group("/ledger"))
	register(protected.Group("/workspaces/:id"))
	register(protected.Group("/businesses/:id"))
}

func (h *Handler) listChartOfAccounts(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ledger.view", "reports.view_basic", "chart.manage")
	if !ok {
		return
	}
	var active *bool
	if raw := c.Query("is_active"); raw != "" {
		b := raw == "true" || raw == "1"
		active = &b
	}
	rows, err := h.service.ListChartAccounts(c.Request.Context(), wsCtx.WorkspaceID, c.Query("account_class"), active)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) seedChartOfAccounts(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "chart.manage")
	if !ok {
		return
	}
	rows, err := h.service.SeedDefaultChartOfAccounts(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.Kind)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) createChartAccount(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "chart.manage")
	if !ok {
		return
	}
	var in CreateChartAccountInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	acc, err := h.service.CreateChartAccount(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": acc})
}

func (h *Handler) updateChartAccount(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "chart.manage")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid chart account id"}})
		return
	}
	var in UpdateChartAccountInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	acc, err := h.service.UpdateChartAccount(c.Request.Context(), wsCtx.WorkspaceID, id, in)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": acc})
}

func (h *Handler) archiveChartAccount(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "chart.manage")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid chart account id"}})
		return
	}
	acc, err := h.service.ArchiveChartAccount(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": acc})
}

func (h *Handler) listAccountMappings(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ledger.view", "chart.manage")
	if !ok {
		return
	}
	rows, err := h.service.ListAccountMappings(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) upsertAccountMapping(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "chart.manage")
	if !ok {
		return
	}
	var body struct {
		ChartAccountID int64 `json:"chart_account_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	m, err := h.service.UpsertAccountMapping(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.Param("key"), body.ChartAccountID)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": m})
}

func (h *Handler) listPostingTemplates(c *gin.Context) {
	if _, ok := requirePermission(c, "ledger.view", "chart.manage"); !ok {
		return
	}
	rows, err := h.service.queries.ListPostingTemplates(c.Request.Context())
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) previewTemplatePosting(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ledger.view", "money.create")
	if !ok {
		return
	}
	var in TemplatePostingRequest
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.PreviewTemplatePosting(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) postFromTemplate(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "money.create", "journal.create_manual")
	if !ok {
		return
	}
	var in TemplatePostingRequest
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.PostFromTemplate(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listJournals(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ledger.view", "ledger.view_detail", "reports.view_accounting")
	if !ok {
		return
	}
	var periodID, outletID, chartAccID, cursorID int64
	if v, err := strconv.ParseInt(c.Query("period_id"), 10, 64); err == nil {
		periodID = v
	}
	if v, err := strconv.ParseInt(c.Query("outlet_id"), 10, 64); err == nil {
		outletID = v
	}
	if v, err := strconv.ParseInt(c.Query("chart_account_id"), 10, 64); err == nil {
		chartAccID = v
	}
	if v, err := strconv.ParseInt(c.Query("cursor_id"), 10, 64); err == nil {
		cursorID = v
	}
	var limit int32
	if v, err := strconv.Atoi(c.Query("limit")); err == nil {
		limit = int32(v)
	}
	res, err := h.service.ListJournals(c.Request.Context(), wsCtx.WorkspaceID, ListJournalsFilter{
		FromDate:       c.Query("from_date"),
		ToDate:         c.Query("to_date"),
		SourceType:     c.Query("source_type"),
		PeriodID:       periodID,
		OutletID:       outletID,
		ChartAccountID: chartAccID,
		CursorDate:     c.Query("cursor_date"),
		CursorID:       cursorID,
		Limit:          limit,
	})
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getJournalDetail(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ledger.view_detail", "ledger.view", "reports.view_accounting")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("journal"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid journal id"}})
		return
	}
	res, err := h.service.GetJournalDetail(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) reverseJournal(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "journal.reverse")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("journal"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid journal id"}})
		return
	}
	var body struct {
		Reason        string `json:"reason" binding:"required"`
		AllowNextOpen bool   `json:"allow_next_open_period"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.ReverseLedgerEntry(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, c.GetHeader("Idempotency-Key"), body.Reason, body.AllowNextOpen)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listManualJournalDrafts(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "journal.create_manual", "journal.approve_manual", "ledger.view")
	if !ok {
		return
	}
	rows, err := h.service.ListManualJournalDrafts(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) createManualJournalDraft(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "journal.create_manual")
	if !ok {
		return
	}
	var in CreateManualJournalDraftInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateManualJournalDraft(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) getManualJournalDraft(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "journal.create_manual", "journal.approve_manual")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid draft id"}})
		return
	}
	res, err := h.service.GetManualJournalDraftDetail(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) postManualJournal(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "journal.approve_manual")
	if !ok {
		return
	}
	var body struct {
		DraftID int64 `json:"draft_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.PostManualJournalDraft(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, body.DraftID, wsCtx.IsOwner, c.GetHeader("Idempotency-Key"))
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) getLedgerReport(c *gin.Context) {
	reportType := c.Param("report")
	perm := "reports.view_accounting"
	if reportType == "vat_schedule" || reportType == "wht_schedule" {
		perm = "reports.view_tax"
	}
	wsCtx, ok := requirePermission(c, perm, "reports.view_basic")
	if !ok {
		return
	}
	res, err := h.service.GenerateReport(c.Request.Context(), wsCtx.WorkspaceID, reportType, c.Query("from_date"), c.Query("to_date"), c.Query("currency"))
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createReportExport(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.export")
	if !ok {
		return
	}
	var body struct {
		ReportType string `json:"report_type" binding:"required"`
		Format     string `json:"format"`
		FromDate   string `json:"from_date"`
		ToDate     string `json:"to_date"`
		Currency   string `json:"currency"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	exp, err := h.service.ExportReport(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, body.ReportType, body.Format, body.FromDate, body.ToDate, body.Currency)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": exp})
}

func (h *Handler) listReportExports(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.export", "reports.view_basic")
	if !ok {
		return
	}
	rows, err := h.service.queries.ListReportExports(c.Request.Context(), db.ListReportExportsParams{
		WorkspaceID: wsCtx.WorkspaceID,
		Limit:       50,
	})
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) getReportExport(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.export", "reports.view_basic")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid export id"}})
		return
	}
	exp, err := h.service.queries.GetReportExportByID(c.Request.Context(), db.GetReportExportByIDParams{
		ID:          id,
		WorkspaceID: wsCtx.WorkspaceID,
	})
	if isNoRows(err) {
		blueprint11Error(c, ErrNotFound)
		return
	}
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": exp})
}

func (h *Handler) listSubledgerReconciliations(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reconciliation.view", "reconciliation.run")
	if !ok {
		return
	}
	runs, err := h.service.queries.ListReconciliationRuns(c.Request.Context(), db.ListReconciliationRunsParams{
		WorkspaceID: wsCtx.WorkspaceID,
		Limit:       25,
	})
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	out := make([]ReconciliationRunDetail, 0, len(runs))
	for _, r := range runs {
		diffs, _ := h.service.queries.ListReconciliationDifferences(c.Request.Context(), db.ListReconciliationDifferencesParams{
			WorkspaceID: wsCtx.WorkspaceID,
			RunID:       r.ID,
		})
		out = append(out, ReconciliationRunDetail{Run: r, Differences: diffs})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func (h *Handler) runSubledgerReconciliation(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reconciliation.run")
	if !ok {
		return
	}
	var body struct {
		AsOfDate string `json:"as_of_date"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.service.RunSubledgerReconciliation(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, body.AsOfDate)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listProjectionRebuilds(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reconciliation.view")
	if !ok {
		return
	}
	rows, err := h.service.queries.ListProjectionRebuildRuns(c.Request.Context(), db.ListProjectionRebuildRunsParams{
		WorkspaceID: wsCtx.WorkspaceID,
		Limit:       25,
	})
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) runProjectionRebuild(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reconciliation.run")
	if !ok {
		return
	}
	var body struct {
		Scope string `json:"scope"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.service.RunProjectionRebuild(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), body.Scope)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listTaxCodes(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.view_tax", "reports.view_basic")
	if !ok {
		return
	}
	rows, err := h.service.queries.ListTaxCodes(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) createTaxCode(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "chart.manage", "reports.view_tax")
	if !ok {
		return
	}
	var in CreateTaxCodeInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateTaxCode(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listTaxSchedules(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.view_tax")
	if !ok {
		return
	}
	var taxType pgtype.Text
	if t := c.Query("tax_type"); t != "" {
		taxType = pgtype.Text{String: t, Valid: true}
	}
	rows, err := h.service.queries.ListTaxScheduleItems(c.Request.Context(), db.ListTaxScheduleItemsParams{
		WorkspaceID: wsCtx.WorkspaceID,
		Limit:       100,
		TaxType:     taxType,
	})
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) listTaxPayments(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.view_tax")
	if !ok {
		return
	}
	rows, err := h.service.queries.ListTaxPayments(c.Request.Context(), db.ListTaxPaymentsParams{
		WorkspaceID: wsCtx.WorkspaceID,
		Limit:       50,
	})
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) recordTaxPayment(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "money.create", "reports.view_tax")
	if !ok {
		return
	}
	var in RecordTaxPaymentInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.RecordTaxPayment(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listAccountingPeriods(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "ledger.view", "period.close", "reports.view_accounting")
	if !ok {
		return
	}
	rows, err := h.service.queries.ListAccountingPeriods(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) createAccountingPeriod(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "period.close", "chart.manage")
	if !ok {
		return
	}
	var in CreateAccountingPeriodInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateAccountingPeriod(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listPeriodChecklist(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "period.close", "ledger.view")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("period"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid period id"}})
		return
	}
	runs, err := h.service.queries.ListPeriodCloseRuns(c.Request.Context(), db.ListPeriodCloseRunsParams{
		WorkspaceID:        wsCtx.WorkspaceID,
		AccountingPeriodID: id,
	})
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	out := make([]PeriodCloseChecklistResult, 0, len(runs))
	for _, r := range runs {
		chks, _ := h.service.queries.ListPeriodCloseChecks(c.Request.Context(), db.ListPeriodCloseChecksParams{
			WorkspaceID: wsCtx.WorkspaceID,
			CloseRunID:  r.ID,
		})
		out = append(out, PeriodCloseChecklistResult{Run: r, Checks: chks})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func (h *Handler) runPeriodChecklist(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "period.close")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("period"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid period id"}})
		return
	}
	res, err := h.service.RunPeriodCloseChecklist(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) closeAccountingPeriod(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "period.close")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("period"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid period id"}})
		return
	}
	res, err := h.service.CloseAccountingPeriod(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) lockAccountingPeriod(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "period.lock")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("period"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid period id"}})
		return
	}
	res, err := h.service.LockAccountingPeriod(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) reopenAccountingPeriod(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "period.reopen")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("period"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid period id"}})
		return
	}
	var body struct {
		Reason string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.ReopenAccountingPeriod(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, body.Reason)
	if err != nil {
		blueprint11Error(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}
