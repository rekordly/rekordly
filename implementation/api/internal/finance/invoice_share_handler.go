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
	protected.POST("/estimates/:id/shares", h.createEstimateShare)
	protected.POST("/customers/:id/statement-shares", h.createCustomerStatementShare)
	protected.POST("/payments/:id/receipt", h.createPaymentReceipt)
}

func (h *Handler) RegisterPublicFinanceRoutes(public *gin.RouterGroup) {
	public.GET("/public/invoices/:token", h.getPublicInvoice)
	public.GET("/public/estimates/:token", h.getPublicEstimate)
	public.POST("/public/estimates/:token/respond", h.respondPublicEstimate)
	public.GET("/public/statements/:token", h.getPublicStatement)
	public.GET("/public/receipts/:token", h.getPublicReceipt)
}

type CreateShareInput struct {
	ExpiryDays   int    `json:"expiry_days"` // defaults to 30 days
	AllowRespond *bool  `json:"allow_respond"`
	FromDate     string `json:"from_date"`
	ToDate       string `json:"to_date"`
}

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
		"data": gin.H{
			"share_url":  publicURL,
			"token":      token,
			"expires_at": share.ExpiresAt.Time,
		},
	})
}

func (h *Handler) createEstimateShare(c *gin.Context) {
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

	var in CreateShareInput
	_ = c.ShouldBindJSON(&in)
	allowRespond := true
	if in.AllowRespond != nil {
		allowRespond = *in.AllowRespond
	}

	token, share, err := h.service.CreateEstimateShare(c.Request.Context(), wsCtx.WorkspaceID, id, wsCtx.UserID, in.ExpiryDays, allowRespond)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CREATE_SHARE_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"data": gin.H{
			"share_url":  fmt.Sprintf("/public/estimates/%s", token),
			"token":      token,
			"expires_at": share.ExpiresAt.Time,
		},
	})
}

func (h *Handler) createCustomerStatementShare(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "invalid customer id"}})
		return
	}

	var in CreateShareInput
	_ = c.ShouldBindJSON(&in)

	token, share, err := h.service.CreateCustomerStatementShare(c.Request.Context(), wsCtx.WorkspaceID, id, wsCtx.UserID, in.FromDate, in.ToDate, in.ExpiryDays)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CREATE_SHARE_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"data": gin.H{
			"share_url":  fmt.Sprintf("/public/statements/%s", token),
			"token":      token,
			"expires_at": share.ExpiresAt.Time,
		},
	})
}

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
		"data": gin.H{
			"receipt_url": publicURL,
			"token":       token,
			"receipt":     receipt,
		},
	})
}

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

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"invoice_view": view}})
}

func (h *Handler) getPublicEstimate(c *gin.Context) {
	token := c.Param("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_TOKEN", "message": "token is required"}})
		return
	}

	view, err := h.service.GetPublicEstimate(c.Request.Context(), token)
	if err != nil {
		if errors.Is(err, ErrShareNotFoundOrExpired) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "quotation link has expired or does not exist"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "GET_PUBLIC_ESTIMATE_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"estimate_view": view}})
}

func (h *Handler) respondPublicEstimate(c *gin.Context) {
	token := c.Param("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_TOKEN", "message": "token is required"}})
		return
	}

	var in struct {
		Action        string `json:"action" binding:"required"` // accepted | declined
		ResponderName string `json:"responder_name" binding:"required"`
		Comment       string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	est, err := h.service.RespondPublicEstimate(c.Request.Context(), token, in.Action, in.ResponderName, in.Comment)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "RESPOND_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"estimate": est}})
}

func (h *Handler) getPublicStatement(c *gin.Context) {
	token := c.Param("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_TOKEN", "message": "token is required"}})
		return
	}

	view, err := h.service.GetPublicCustomerStatement(c.Request.Context(), token)
	if err != nil {
		if errors.Is(err, ErrShareNotFoundOrExpired) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "statement link has expired or does not exist"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "GET_PUBLIC_STATEMENT_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"statement_view": view}})
}

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

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"receipt_view": view}})
}
