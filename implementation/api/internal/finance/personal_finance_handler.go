package finance

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterPersonalFinanceRoutes(protected *gin.RouterGroup) {
	p := protected.Group("/personal")
	{
		// Dashboard & Activity
		p.GET("/dashboard", h.getPersonalDashboard)
		p.GET("/activity", h.listPersonalActivity)

		// Accounts & Opening Balances
		p.GET("/accounts", h.listPersonalAccounts)
		p.POST("/accounts", h.createPersonalAccount)
		p.PATCH("/accounts/:id", h.updatePersonalAccount)
		p.POST("/accounts/:id/archive", h.archivePersonalAccount)
		p.POST("/accounts/:id/reactivate", h.reactivatePersonalAccount)
		p.POST("/accounts/:id/opening-balance", h.recordPersonalOpeningBalance)

		// Categories & Tags
		p.POST("/categories/seed-defaults", h.seedPersonalCategories)
		p.PATCH("/categories/:id", h.updatePersonalCategory)
		p.POST("/categories/:id/archive", h.archivePersonalCategory)
		p.POST("/categories/:id/reactivate", h.reactivatePersonalCategory)
		p.GET("/tags", h.listPersonalTags)
		p.POST("/tags", h.createPersonalTag)
		p.DELETE("/tags/:id", h.archivePersonalTag)

		// Personal Budgets
		p.GET("/budgets", h.listPersonalBudgets)
		p.POST("/budgets", h.createPersonalBudget)
		p.GET("/budgets/:id", h.getPersonalBudget)
		p.PATCH("/budgets/:id", h.updatePersonalBudget)
		p.POST("/budgets/:id/copy", h.copyPersonalBudget)
		p.POST("/budgets/:id/evaluate-alerts", h.evaluatePersonalBudgetAlerts)

		// Loans
		p.GET("/loans", h.listPersonalLoans)
		p.GET("/loans/:id", h.getPersonalLoan)
		p.POST("/commands/open-borrowed-loan", h.openBorrowedLoan)
		p.POST("/commands/lend-money", h.lendMoney)
		p.POST("/commands/record-loan-repayment", h.recordLoanRepayment)
		p.POST("/loans/:id/events/:event_id/reverse", h.reverseLoanEvent)

		// Investments
		p.GET("/investments", h.listInvestments)
		p.POST("/investments", h.createInvestment)
		p.GET("/investments/:id", h.getInvestment)
		p.POST("/commands/record-investment-event", h.recordInvestmentEvent)
		p.POST("/investments/:id/valuations", h.recordInvestmentValuation)

		// Personal Assets
		p.GET("/assets", h.listPersonalAssets)
		p.POST("/assets", h.createPersonalAsset)
		p.GET("/assets/:id", h.getPersonalAsset)
		p.POST("/commands/acquire-asset", h.acquirePersonalAsset)
		p.POST("/commands/dispose-asset", h.disposePersonalAsset)
		p.POST("/assets/:id/valuations", h.recordAssetValuation)
	}

	// Owner Cross-Space Transfers & All Summary
	owner := protected.Group("/owner")
	{
		owner.POST("/commands/transfer-between-spaces", h.transferBetweenSpaces)
		owner.GET("/owner-transfers", h.listOwnerTransfers)
		owner.GET("/all-summary", h.getAllOwnerSummary)
	}
}

func (h *Handler) getPersonalDashboard(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	res, err := h.service.GetPersonalDashboard(c.Request.Context(), wsCtx.WorkspaceID, c.Query("from_date"), c.Query("to_date"), c.Query("currency"))
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listPersonalActivity(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var cursorID int64
	if raw := c.Query("cursor_id"); raw != "" {
		if v, err := strconv.ParseInt(raw, 10, 64); err == nil {
			cursorID = v
		}
	}
	var limit int32
	if raw := c.Query("limit"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil {
			limit = int32(v)
		}
	}
	res, err := h.service.ListPersonalActivity(c.Request.Context(), wsCtx.WorkspaceID, PersonalActivityFilter{
		Tab:        c.Query("tab"),
		FromDate:   c.Query("from_date"),
		ToDate:     c.Query("to_date"),
		CursorDate: c.Query("cursor_date"),
		CursorID:   cursorID,
		Limit:      limit,
	})
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listPersonalAccounts(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var active *bool
	if raw := c.Query("is_active"); raw != "" {
		b := raw == "true" || raw == "1"
		active = &b
	}
	res, err := h.service.ListAccountsOrdered(c.Request.Context(), wsCtx.WorkspaceID, active)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createPersonalAccount(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var in CreateAccountInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreatePersonalAccount(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) updatePersonalAccount(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid account id"}})
		return
	}
	var in UpdateAccountMetadataInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.UpdatePersonalAccountMetadata(c.Request.Context(), wsCtx.WorkspaceID, id, in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) archivePersonalAccount(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid account id"}})
		return
	}
	res, err := h.service.ArchivePersonalAccount(c.Request.Context(), wsCtx.WorkspaceID, id, true)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) reactivatePersonalAccount(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid account id"}})
		return
	}
	res, err := h.service.ArchivePersonalAccount(c.Request.Context(), wsCtx.WorkspaceID, id, false)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) recordPersonalOpeningBalance(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid account id"}})
		return
	}
	var in OpeningBalanceInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.RecordAccountOpeningBalance(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) seedPersonalCategories(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	res, err := h.service.SeedDefaultPersonalCategories(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) updatePersonalCategory(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid category id"}})
		return
	}
	var in UpdateCategoryInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.UpdatePersonalCategory(c.Request.Context(), wsCtx.WorkspaceID, id, in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) archivePersonalCategory(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid category id"}})
		return
	}
	res, err := h.service.ArchivePersonalCategory(c.Request.Context(), wsCtx.WorkspaceID, id, true)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) reactivatePersonalCategory(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid category id"}})
		return
	}
	res, err := h.service.ArchivePersonalCategory(c.Request.Context(), wsCtx.WorkspaceID, id, false)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listPersonalTags(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	res, err := h.service.ListPersonalTags(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createPersonalTag(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var in CreatePersonalTagInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreatePersonalTag(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) archivePersonalTag(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid tag id"}})
		return
	}
	res, err := h.service.ArchivePersonalTag(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listPersonalBudgets(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	res, err := h.service.ListPersonalBudgetsWithStatus(c.Request.Context(), wsCtx.WorkspaceID, c.Query("status"))
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createPersonalBudget(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var in CreatePersonalBudgetInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreatePersonalBudget(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) getPersonalBudget(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid budget id"}})
		return
	}
	res, err := h.service.GetPersonalBudgetDetail(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) updatePersonalBudget(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid budget id"}})
		return
	}
	var in UpdatePersonalBudgetInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.UpdatePersonalBudget(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) copyPersonalBudget(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid budget id"}})
		return
	}
	var in CopyBudgetInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CopyPersonalBudget(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) evaluatePersonalBudgetAlerts(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid budget id"}})
		return
	}
	res, err := h.service.EvaluatePersonalBudgetAlerts(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listPersonalLoans(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	res, err := h.service.ListPersonalLoans(c.Request.Context(), wsCtx.WorkspaceID, c.Query("direction"), c.Query("status"))
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getPersonalLoan(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid loan id"}})
		return
	}
	res, err := h.service.GetPersonalLoanDetail(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) openBorrowedLoan(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var in CreateLoanInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.OpenBorrowedLoan(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) lendMoney(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var in CreateLoanInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.LendMoney(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) recordLoanRepayment(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var in RecordLoanRepaymentInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.RecordLoanRepayment(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) reverseLoanEvent(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	loanID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || loanID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid loan id"}})
		return
	}
	eventID, err := strconv.ParseInt(c.Param("event_id"), 10, 64)
	if err != nil || eventID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid event id"}})
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.service.ReverseLoanEvent(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, loanID, eventID, body.Reason)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listInvestments(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	res, err := h.service.ListInvestments(c.Request.Context(), wsCtx.WorkspaceID, c.Query("status"))
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createInvestment(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var in CreateInvestmentInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateInvestment(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) getInvestment(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid investment id"}})
		return
	}
	res, err := h.service.GetInvestmentDetail(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) recordInvestmentEvent(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var in RecordInvestmentEventInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.RecordInvestmentEvent(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) recordInvestmentValuation(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid investment id"}})
		return
	}
	var in CreateValuationInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.RecordInvestmentValuation(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) listPersonalAssets(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	res, err := h.service.ListPersonalAssets(c.Request.Context(), wsCtx.WorkspaceID, c.Query("status"))
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) createPersonalAsset(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var in CreateAssetInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreatePersonalAsset(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) getPersonalAsset(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid asset id"}})
		return
	}
	res, err := h.service.GetPersonalAssetDetail(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) acquirePersonalAsset(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var in AcquireAssetInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.AcquirePersonalAsset(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) disposePersonalAsset(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	var in DisposeAssetInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.DisposePersonalAsset(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) recordAssetValuation(c *gin.Context) {
	wsCtx, ok := requirePersonalWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid asset id"}})
		return
	}
	var in CreateValuationInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.RecordAssetValuation(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) transferBetweenSpaces(c *gin.Context) {
	wsCtx, ok := requireOwnerContext(c)
	if !ok {
		return
	}
	var in OwnerTransferInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.TransferBetweenSpaces(c.Request.Context(), wsCtx.UserID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	status := http.StatusCreated
	if res.WasDuplicate {
		status = http.StatusOK
	}
	c.JSON(status, gin.H{"data": res})
}

func (h *Handler) listOwnerTransfers(c *gin.Context) {
	wsCtx, ok := requireOwnerContext(c)
	if !ok {
		return
	}
	res, err := h.service.ListOwnerTransfers(c.Request.Context(), wsCtx.UserID)
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getAllOwnerSummary(c *gin.Context) {
	wsCtx, ok := requireOwnerContext(c)
	if !ok {
		return
	}
	res, err := h.service.GetAllOwnerSummary(c.Request.Context(), wsCtx.UserID, c.Query("from_date"), c.Query("to_date"))
	if err != nil {
		personalFinanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}
