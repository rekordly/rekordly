package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

func (h *Handler) RegisterEstimateRoutes(protected *gin.RouterGroup) {
	protected.POST("/estimates", h.createEstimate)
	protected.GET("/estimates", h.listEstimates)
	protected.GET("/estimates/:id", h.getEstimate)
	protected.PATCH("/estimates/:id/status", h.updateEstimateStatus)
	protected.POST("/estimates/:id/convert-to-invoice", h.convertEstimateToInvoice)
}

// @Summary Create an estimate/quotation
// @Tags estimates
// @Accept json
// @Produce json
// @Param request body CreateEstimateInput true "Estimate payload"
// @Success 201 {object} map[string]any
// @Router /api/v1/estimates [post]
func (h *Handler) createEstimate(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var in CreateEstimateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}

	detail, err := h.service.CreateEstimate(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		code := "CREATE_ESTIMATE_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrForbiddenParty) {
			code = "FORBIDDEN_PARTY"
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"estimate": detail})
}

// @Summary Get estimate by ID
// @Tags estimates
// @Produce json
// @Param id path int true "Estimate ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/estimates/{id} [get]
func (h *Handler) getEstimate(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid estimate id"}})
		return
	}

	detail, err := h.service.GetEstimate(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "estimate not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "GET_ESTIMATE_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"estimate": detail})
}

// @Summary List estimates
// @Tags estimates
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/estimates [get]
func (h *Handler) listEstimates(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	var params db.ListEstimatesParams
	params.Limit = int32(limit)

	if search := c.Query("search"); search != "" {
		params.Search = pgtype.Text{String: search, Valid: true}
	}
	if status := c.Query("status"); status != "" {
		params.Status = pgtype.Text{String: status, Valid: true}
	}

	estimates, err := h.service.ListEstimates(c.Request.Context(), wsCtx.WorkspaceID, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "LIST_ESTIMATES_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"estimates": estimates})
}

type UpdateEstimateStatusInput struct {
	Status string `json:"status" binding:"required"`
}

// @Summary Update estimate status
// @Tags estimates
// @Accept json
// @Produce json
// @Param id path int true "Estimate ID"
// @Param request body UpdateEstimateStatusInput true "Status payload"
// @Success 200 {object} map[string]any
// @Router /api/v1/estimates/{id}/status [patch]
func (h *Handler) updateEstimateStatus(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid estimate id"}})
		return
	}

	var in UpdateEstimateStatusInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	detail, err := h.service.UpdateEstimateStatus(c.Request.Context(), wsCtx.WorkspaceID, id, in.Status)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "UPDATE_STATUS_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"estimate": detail})
}

// @Summary Convert estimate to invoice
// @Tags estimates
// @Produce json
// @Param id path int true "Estimate ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/estimates/{id}/convert-to-invoice [post]
func (h *Handler) convertEstimateToInvoice(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid estimate id"}})
		return
	}

	idempKey := c.GetHeader("Idempotency-Key")

	invoiceDetail, err := h.service.ConvertEstimateToInvoice(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, idempKey)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CONVERT_ESTIMATE_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"invoice": invoiceDetail,
		"message": "Estimate successfully converted to invoice draft",
	})
}
