package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type BankReconciliationHandler struct {
	service *BankReconciliationService
}

func NewBankReconciliationHandler(service *BankReconciliationService) *BankReconciliationHandler {
	return &BankReconciliationHandler{service: service}
}

func (h *BankReconciliationHandler) RegisterReconciliationRoutes(protected *gin.RouterGroup) {
	protected.GET("/reconciliations", h.listReconciliations)
	protected.POST("/reconciliations", h.startReconciliation)
	protected.GET("/reconciliations/:id", h.getReconciliation)
	protected.POST("/reconciliations/:id/commands/match", h.matchTransaction)
	protected.POST("/reconciliations/:id/commands/unmatch", h.unmatchTransaction)
	protected.POST("/reconciliations/:id/commands/complete", h.completeReconciliation)
}

func (h *BankReconciliationHandler) listReconciliations(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var accountID *int64
	if accStr := c.Query("account_id"); accStr != "" {
		if id, err := strconv.ParseInt(accStr, 10, 64); err == nil {
			accountID = &id
		}
	}

	recons, err := h.service.ListReconciliations(c.Request.Context(), wsCtx.WorkspaceID, accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"reconciliations": recons}})
}

func (h *BankReconciliationHandler) startReconciliation(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var in StartReconciliationInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	recon, err := h.service.StartReconciliation(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CREATE_RECON_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"reconciliation": recon}})
}

func (h *BankReconciliationHandler) getReconciliation(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid reconciliation ID"}})
		return
	}

	recon, matches, err := h.service.GetReconciliationDetail(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Reconciliation not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"reconciliation": recon, "matches": matches}})
}

func (h *BankReconciliationHandler) matchTransaction(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	reconID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid reconciliation ID"}})
		return
	}

	var in struct {
		TransactionID int64 `json:"transaction_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	match, err := h.service.MatchTransaction(c.Request.Context(), wsCtx.WorkspaceID, reconID, in.TransactionID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "MATCH_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"match": match}})
}

func (h *BankReconciliationHandler) unmatchTransaction(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	reconID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid reconciliation ID"}})
		return
	}

	var in struct {
		TransactionID int64 `json:"transaction_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	if err := h.service.UnmatchTransaction(c.Request.Context(), wsCtx.WorkspaceID, reconID, in.TransactionID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "UNMATCH_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"unmatched": true}})
}

func (h *BankReconciliationHandler) completeReconciliation(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	reconID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid reconciliation ID"}})
		return
	}

	recon, err := h.service.CompleteReconciliation(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, reconID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "COMPLETE_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"reconciliation": recon}})
}
