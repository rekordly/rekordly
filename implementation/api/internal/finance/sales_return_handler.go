package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/rekordly/rekordly-api/internal/db"
)

func (h *Handler) RegisterSalesReturnRoutes(protected *gin.RouterGroup) {
	protected.POST("/sales-returns", h.createSalesReturn)
	protected.GET("/sales-returns", h.listSalesReturns)
	protected.GET("/sales-returns/:id", h.getSalesReturn)
	protected.GET("/customers/:id/credit", h.getCustomerCredit)
	protected.POST("/customers/:id/credit/apply", h.applyCustomerCredit)
}

// @Summary Create sales return / credit note
// @Tags sales-returns
// @Accept json
// @Produce json
// @Param request body CreateSalesReturnInput true "Return payload"
// @Success 201 {object} map[string]any
// @Router /api/v1/sales-returns [post]
func (h *Handler) createSalesReturn(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.create", "sales.create")
	if !ok {
		return
	}

	var in CreateSalesReturnInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	for _, it := range in.Items {
		if it.OutletID > 0 && !wsCtx.IsOutletAllowed(it.OutletID) {
			c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN_OUTLET", "message": "You do not have access to the specified outlet"}})
			return
		}
	}

	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}

	detail, err := h.service.CreateSalesReturn(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		code := "CREATE_SALES_RETURN_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrForbiddenParty) {
			code = "FORBIDDEN_PARTY"
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"sales_return": detail}})
}

// @Summary Get sales return by ID
// @Tags sales-returns
// @Produce json
// @Param id path int true "Return ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/sales-returns/{id} [get]
func (h *Handler) getSalesReturn(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.view", "sales.view")
	if !ok {
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid return id"}})
		return
	}

	detail, err := h.service.GetSalesReturn(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "sales return not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "GET_SALES_RETURN_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"sales_return": detail}})
}

// @Summary List sales returns
// @Tags sales-returns
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/sales-returns [get]
func (h *Handler) listSalesReturns(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.view", "sales.view")
	if !ok {
		return
	}

	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	var params db.ListSalesReturnsParams
	params.Limit = int32(limit)

	returns, err := h.service.ListSalesReturns(c.Request.Context(), wsCtx.WorkspaceID, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "LIST_SALES_RETURNS_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"sales_returns": returns}})
}

// @Summary Get customer credit balance
// @Tags customers
// @Produce json
// @Param id path int true "Customer ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/customers/{id}/credit [get]
func (h *Handler) getCustomerCredit(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.view", "sales.view")
	if !ok {
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid customer id"}})
		return
	}

	currency := c.DefaultQuery("currency", "NGN")

	detail, err := h.service.GetCustomerCredit(c.Request.Context(), wsCtx.WorkspaceID, id, currency)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "GET_CREDIT_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"customer_credit": detail}})
}

type ApplyCreditInput struct {
	InvoiceID   int64 `json:"invoice_id" binding:"required"`
	AmountMinor int64 `json:"amount_minor" binding:"required"`
}

// @Summary Apply customer credit to invoice
// @Tags customers
// @Accept json
// @Produce json
// @Param id path int true "Customer ID"
// @Param request body ApplyCreditInput true "Payload"
// @Success 200 {object} map[string]any
// @Router /api/v1/customers/{id}/credit/apply [post]
func (h *Handler) applyCustomerCredit(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.create", "sales.create")
	if !ok {
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid customer id"}})
		return
	}

	var in ApplyCreditInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	invDetail, err := h.service.ApplyCustomerCreditToInvoice(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, in.InvoiceID, in.AmountMinor)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "APPLY_CREDIT_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"invoice": invDetail,
			"message": "Customer credit applied to invoice successfully",
		},
	})
}
