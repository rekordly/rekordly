package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterBudgetsTaxRoutes(group *gin.RouterGroup) {
	// Budgets
	group.POST("/budgets", h.createBudget)
	group.GET("/budgets", h.listBudgets)
	group.GET("/budgets/:id", h.getBudget)
	group.PATCH("/budgets/:id", h.updateBudget)
	group.DELETE("/budgets/:id", h.deleteBudget)
	group.GET("/budgets/:id/status", h.getBudgetStatus)

	// Tax-Readiness Reports
	group.GET("/reports/tax-readiness", h.getTaxReadinessReport)
	group.GET("/reports/summary", h.getFinanceSummary)

	// Tax Settings
	group.GET("/tax-settings", h.getTaxSettings)
	group.PUT("/tax-settings", h.updateTaxSettings)
}

// @Summary Create a budget
// @Description Creates a new spending budget or income goal with plan-limit enforcement.
// @Tags budgets
// @Accept json
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param request body CreateBudgetInput true "Budget details"
// @Success 201 {object} map[string]any
// @Failure 400 {object} map[string]any
// @Failure 402 {object} map[string]any
// @Failure 403 {object} map[string]any
// @Router /api/v1/budgets [post]
func (h *Handler) createBudget(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.view_basic", "money.view", "money.create")
	if !ok {
		return
	}

	var in CreateBudgetInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body", "details": err.Error()})
		return
	}

	detail, err := h.service.CreateBudget(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		if errors.Is(err, ErrPlanLimitExceeded) {
			c.JSON(http.StatusPaymentRequired, gin.H{"error": err.Error(), "code": "PLAN_LIMIT_EXCEEDED"})
			return
		}
		if errors.Is(err, ErrInvalidBudgetDates) || errors.Is(err, ErrInvalidBudgetAmount) || errors.Is(err, ErrForbiddenCategory) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create budget", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": detail.Budget})
}

// @Summary List budgets
// @Description Lists budgets for the current workspace with optional scope and active filters.
// @Tags budgets
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param scope query string false "Scope (business, personal, all)"
// @Param is_active query bool false "Active status filter"
// @Param from_date query string false "From date (YYYY-MM-DD)"
// @Param to_date query string false "To date (YYYY-MM-DD)"
// @Param limit query int false "Limit"
// @Success 200 {object} map[string]any
// @Router /api/v1/budgets [get]
func (h *Handler) listBudgets(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.view_basic", "money.view", "money.create")
	if !ok {
		return
	}

	filter := ListBudgetsFilter{
		Scope:    c.Query("scope"),
		FromDate: c.Query("from_date"),
		ToDate:   c.Query("to_date"),
	}

	if activeStr := c.Query("is_active"); activeStr != "" {
		b := activeStr == "true" || activeStr == "1"
		filter.IsActive = &b
	}

	if lStr := c.Query("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			filter.Limit = int32(l)
		}
	}

	budgets, err := h.service.ListBudgets(c.Request.Context(), wsCtx.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list budgets", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": budgets})
}

// @Summary Get a budget
// @Description Retrieves details for a specific budget.
// @Tags budgets
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param id path int true "Budget ID"
// @Success 200 {object} map[string]any
// @Failure 404 {object} map[string]any
// @Router /api/v1/budgets/{id} [get]
func (h *Handler) getBudget(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.view_basic", "money.view", "money.create")
	if !ok {
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid budget id"})
		return
	}

	detail, err := h.service.GetBudget(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "budget not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get budget", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": detail.Budget})
}

// @Summary Update a budget
// @Description Updates a budget's name, amount, dates, or active status.
// @Tags budgets
// @Accept json
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param id path int true "Budget ID"
// @Param request body UpdateBudgetInput true "Updated budget fields"
// @Success 200 {object} map[string]any
// @Failure 400 {object} map[string]any
// @Failure 404 {object} map[string]any
// @Router /api/v1/budgets/{id} [patch]
func (h *Handler) updateBudget(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.view_basic", "money.view", "money.create")
	if !ok {
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid budget id"})
		return
	}

	var in UpdateBudgetInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body", "details": err.Error()})
		return
	}

	updated, err := h.service.UpdateBudget(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, in)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "budget not found"})
			return
		}
		if errors.Is(err, ErrInvalidBudgetDates) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update budget", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updated.Budget})
}

// @Summary Delete a budget
// @Description Deletes a budget from the workspace.
// @Tags budgets
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param id path int true "Budget ID"
// @Success 204 "No Content"
// @Failure 404 {object} map[string]any
// @Router /api/v1/budgets/{id} [delete]
func (h *Handler) deleteBudget(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.view_basic", "money.view", "money.create")
	if !ok {
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid budget id"})
		return
	}

	if err := h.service.DeleteBudget(c.Request.Context(), wsCtx.WorkspaceID, id); err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "budget not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete budget", "details": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

// @Summary Get budget progress status
// @Description Calculates real-time actual spending, remaining amount, and usage percent from posted transactions.
// @Tags budgets
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param id path int true "Budget ID"
// @Success 200 {object} map[string]any
// @Failure 404 {object} map[string]any
// @Router /api/v1/budgets/{id}/status [get]
func (h *Handler) getBudgetStatus(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.view_basic", "money.view", "money.create")
	if !ok {
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid budget id"})
		return
	}

	status, err := h.service.GetBudgetStatus(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "budget not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get budget status", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": status})
}

// @Summary Get tax-readiness aggregate report
// @Description Returns read-only VAT/tax-readiness totals queryable from posted records only.
// @Tags reports
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param from_date query string true "From Date (YYYY-MM-DD)"
// @Param to_date query string true "To Date (YYYY-MM-DD)"
// @Param scope query string false "Scope (business, personal, all)"
// @Success 200 {object} map[string]any
// @Failure 400 {object} map[string]any
// @Router /api/v1/reports/tax-readiness [get]
func (h *Handler) getTaxReadinessReport(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.tax", "reports.view_basic")
	if !ok {
		return
	}

	fromDate := c.Query("from_date")
	toDate := c.Query("to_date")
	scope := c.Query("scope")

	if fromDate == "" || toDate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from_date and to_date query parameters are required (YYYY-MM-DD)"})
		return
	}

	report, err := h.service.GetTaxReadinessReport(c.Request.Context(), wsCtx.WorkspaceID, fromDate, toDate, scope)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": report})
}

// @Summary Get workspace tax settings
// @Description Returns configured tax settings (TIN, default VAT rate, registration status).
// @Tags settings
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/tax-settings [get]
func (h *Handler) getTaxSettings(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.view_basic", "money.view", "money.create")
	if !ok {
		return
	}

	settings, err := h.service.GetTaxSettings(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get tax settings", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": settings})
}

// @Summary Update workspace tax settings
// @Description Updates workspace TIN, default VAT rate, and registration status.
// @Tags settings
// @Accept json
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param request body UpdateTaxSettingsInput true "Tax settings details"
// @Success 200 {object} map[string]any
// @Failure 400 {object} map[string]any
// @Router /api/v1/tax-settings [put]
func (h *Handler) updateTaxSettings(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "reports.tax", "settings.manage")
	if !ok {
		return
	}

	var in UpdateTaxSettingsInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body", "details": err.Error()})
		return
	}

	updated, err := h.service.UpdateTaxSettings(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update tax settings", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updated})
}
