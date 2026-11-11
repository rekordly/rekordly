package finance

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterInvoiceShareRoutes(protected *gin.RouterGroup) {
	protected.POST("/invoices/:id/shares", h.createInvoiceShare)
	protected.POST("/payments/:id/receipt", h.createPaymentReceipt)
}

func (h *Handler) RegisterPublicFinanceRoutes(public *gin.RouterGroup) {
	public.GET("/public/invoices/:token", h.getPublicInvoice)
	public.GET("/public/receipts/:token", h.getPublicReceipt)
}

type CreateShareInput struct {
	ExpiryDays int `json:"expiry_days"` // defaults to 30 days
}

// @Summary Create an invoice public share link
// @Tags invoices
// @Accept json
// @Produce json
// @Param id path int true "Invoice ID"
// @Success 201 {object} map[string]any
// @Router /api/v1/invoices/{id}/shares [post]
func (h *Handler) createInvoiceShare(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid invoice id"}})
		return
	}

	var in CreateShareInput
	_ = c.ShouldBindJSON(&in)

	token, share, err := h.service.CreateInvoiceShare(c.Request.Context(), wsCtx.WorkspaceID, id, in.ExpiryDays)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CREATE_SHARE_FAILED", "message": err.Error()}})
		return
	}

	publicURL := fmt.Sprintf("/public/invoices/%s", token)

	c.JSON(http.StatusCreated, gin.H{
		"share_url":  publicURL,
		"token":      token,
		"expires_at": share.ExpiresAt.Time,
	})
}

// @Summary Generate payment receipt
// @Tags payments
// @Produce json
// @Param id path int true "Payment ID"
// @Success 201 {object} map[string]any
// @Router /api/v1/payments/{id}/receipt [post]
func (h *Handler) createPaymentReceipt(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid payment id"}})
		return
	}

	token, receipt, err := h.service.CreatePaymentReceipt(c.Request.Context(), wsCtx.WorkspaceID, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CREATE_RECEIPT_FAILED", "message": err.Error()}})
		return
	}

	publicURL := fmt.Sprintf("/public/receipts/%s", token)

	c.JSON(http.StatusCreated, gin.H{
		"receipt_url": publicURL,
		"token":       token,
		"receipt":     receipt,
	})
}

// @Summary View public invoice (guest)
// @Tags public
// @Produce json
// @Param token path string true "Share Token"
// @Success 200 {object} map[string]any
// @Router /api/v1/public/invoices/{token} [get]
func (h *Handler) getPublicInvoice(c *gin.Context) {
	token := c.Param("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_TOKEN", "message": "token is required"}})
		return
	}

	view, err := h.service.GetPublicInvoice(c.Request.Context(), token)
	if err != nil {
		if errors.Is(err, ErrShareNotFoundOrExpired) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "invoice share link has expired or does not exist"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "GET_PUBLIC_INVOICE_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"invoice_view": view})
}

// @Summary View public receipt (guest)
// @Tags public
// @Produce json
// @Param token path string true "Receipt Token"
// @Success 200 {object} map[string]any
// @Router /api/v1/public/receipts/{token} [get]
func (h *Handler) getPublicReceipt(c *gin.Context) {
	token := c.Param("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_TOKEN", "message": "token is required"}})
		return
	}

	view, err := h.service.GetPublicReceipt(c.Request.Context(), token)
	if err != nil {
		if errors.Is(err, ErrReceiptNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "receipt not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "GET_PUBLIC_RECEIPT_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"receipt_view": view})
}
