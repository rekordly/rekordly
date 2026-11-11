package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/db"
)

func (h *Handler) RegisterInvoicesWalletsRoutes(protected *gin.RouterGroup) {
	// Invoices
	protected.POST("/invoices", h.createInvoice)
	protected.GET("/invoices", h.listInvoices)
	protected.GET("/invoices/:id", h.getInvoice)
	protected.PATCH("/invoices/:id", h.updateDraftInvoice)
	protected.POST("/invoices/:id/finalize", h.finalizeInvoice)
	protected.POST("/invoices/:id/void", h.voidInvoice)
	protected.POST("/invoices/:id/wallet-payment", h.payInvoiceWithWallet)

	// Customer Wallets
	protected.GET("/customers/:id/wallet", h.getCustomerWallet)
	protected.POST("/customers/:id/wallet/deposits", h.depositToCustomerWallet)
	protected.GET("/customers/:id/wallet/ledger", h.listWalletLedger)
}

// @Summary Create an invoice
// @Description Creates an invoice (draft or finalized) with item lines.
// @Tags invoices
// @Accept json
// @Produce json
// @Param request body CreateInvoiceInput true "Invoice payload"
// @Success 201 {object} map[string]any
// @Router /api/v1/invoices [post]
func (h *Handler) createInvoice(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.create", "sales.create")
	if !ok {
		return
	}

	var in CreateInvoiceInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.OutletID > 0 && !wsCtx.IsOutletAllowed(in.OutletID) {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN_OUTLET", "message": "You do not have access to this outlet"}})
		return
	}
	if in.OutletID == 0 {
		if oid := wsCtx.ScopedOutletID(); oid != nil {
			in.OutletID = *oid
		}
	}

	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}

	detail, err := h.service.CreateInvoice(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		code := "CREATE_INVOICE_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrForbiddenParty) {
			code = "FORBIDDEN_PARTY"
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": detail})
}

// @Summary List invoices
// @Description Lists invoices for the active workspace.
// @Tags invoices
// @Produce json
// @Param from query string false "From date (YYYY-MM-DD)"
// @Param to query string false "To date (YYYY-MM-DD)"
// @Param status query string false "Status: draft, finalized, partially_paid, paid, voided"
// @Param customer_id query int false "Customer ID"
// @Param before_id query int false "Cursor before_id"
// @Param limit query int false "Limit"
// @Success 200 {object} map[string]any
// @Router /api/v1/invoices [get]
func (h *Handler) listInvoices(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.view", "sales.view")
	if !ok {
		return
	}

	var filter ListInvoicesFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}

	invoices, err := h.service.ListInvoices(c.Request.Context(), wsCtx.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list invoices"}})
		return
	}

	docKindFilter := c.Query("document_kind")
	scopedOutlets := wsCtx.ScopedOutletIDs()
	if docKindFilter != "" || len(scopedOutlets) > 0 {
		filtered := make([]db.Invoice, 0, len(invoices))
		for _, inv := range invoices {
			if docKindFilter != "" && inv.DocumentKind != docKindFilter {
				continue
			}
			if inv.OutletID.Valid && !wsCtx.IsOutletAllowed(inv.OutletID.Int64) {
				continue
			}
			filtered = append(filtered, inv)
		}
		invoices = filtered
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"invoices": invoices}})
}

// @Summary Get invoice by ID
// @Description Fetches invoice detail, items, and linked payments by ID.
// @Tags invoices
// @Produce json
// @Param id path int true "Invoice ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/invoices/{id} [get]
func (h *Handler) getInvoice(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.view", "sales.view")
	if !ok {
		return
	}

	invID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || invID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid invoice ID"}})
		return
	}

	detail, err := h.service.GetInvoice(c.Request.Context(), wsCtx.WorkspaceID, invID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Invoice not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": detail})
}

// @Summary Update draft invoice
// @Description Updates a draft invoice. Finalized invoices cannot be modified.
// @Tags invoices
// @Accept json
// @Produce json
// @Param id path int true "Invoice ID"
// @Param request body UpdateDraftInvoiceInput true "Update payload"
// @Success 200 {object} map[string]any
// @Failure 400 {object} map[string]any
// @Router /api/v1/invoices/{id} [patch]
func (h *Handler) updateDraftInvoice(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.create", "sales.create")
	if !ok {
		return
	}

	invID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || invID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid invoice ID"}})
		return
	}

	var in UpdateDraftInvoiceInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	detail, err := h.service.UpdateDraftInvoice(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, invID, in)
	if err != nil {
		code := "UPDATE_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrCannotEditFinalizedInvoice) {
			code = "CANNOT_EDIT_FINALIZED"
		} else if errors.Is(err, ErrNotFound) {
			code = "NOT_FOUND"
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": detail})
}

// @Summary Finalize an invoice
// @Description Finalizes a draft invoice and creates balanced double-entry ledger entries.
// @Tags invoices
// @Produce json
// @Param id path int true "Invoice ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/invoices/{id}/finalize [post]
func (h *Handler) finalizeInvoice(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.create", "sales.create")
	if !ok {
		return
	}

	invID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || invID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid invoice ID"}})
		return
	}

	detail, err := h.service.FinalizeInvoice(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, invID)
	if err != nil {
		code := "FINALIZE_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrAlreadyFinalized) {
			code = "ALREADY_FINALIZED"
		} else if errors.Is(err, ErrNotFound) {
			code = "NOT_FOUND"
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": detail})
}

type voidInvoiceRequest struct {
	Reason string `json:"reason" binding:"required"`
}

// @Summary Void an invoice
// @Description Voids an invoice and reverses ledger entries if finalized.
// @Tags invoices
// @Accept json
// @Produce json
// @Param id path int true "Invoice ID"
// @Param request body voidInvoiceRequest true "Reason"
// @Success 200 {object} map[string]any
// @Router /api/v1/invoices/{id}/void [post]
func (h *Handler) voidInvoice(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "invoices.create", "money.void")
	if !ok {
		return
	}

	invID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || invID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid invoice ID"}})
		return
	}

	var req voidInvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Void reason is required"}})
		return
	}

	detail, err := h.service.VoidInvoice(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, invID, req.Reason)
	if err != nil {
		code := "VOID_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrCannotVoidPaidInvoice) {
			code = "CANNOT_VOID_PAID_INVOICE"
		} else if errors.Is(err, ErrNotFound) {
			code = "NOT_FOUND"
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": detail})
}

// @Summary Get customer wallet
// @Description Fetches customer wallet balance.
// @Tags wallets
// @Produce json
// @Param id path int true "Customer ID"
// @Param currency query string false "Currency code (default NGN)"
// @Success 200 {object} map[string]any
// @Router /api/v1/customers/{id}/wallet [get]
func (h *Handler) getCustomerWallet(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "sales.view", "invoices.view", "contacts.view")
	if !ok {
		return
	}

	custID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || custID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid customer ID"}})
		return
	}

	currency := c.Query("currency")
	wallet, err := h.service.GetCustomerWallet(c.Request.Context(), wsCtx.WorkspaceID, custID, currency)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": wallet})
}

// @Summary Record customer deposit to wallet
// @Description Records money received as a customer deposit, crediting Customer Deposit Liability.
// @Tags wallets
// @Accept json
// @Produce json
// @Param id path int true "Customer ID"
// @Param request body CustomerWalletDepositInput true "Deposit payload"
// @Success 201 {object} map[string]any
// @Router /api/v1/customers/{id}/wallet/deposits [post]
func (h *Handler) depositToCustomerWallet(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "sales.create", "invoices.create", "money.create")
	if !ok {
		return
	}

	custID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || custID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid customer ID"}})
		return
	}

	var in CustomerWalletDepositInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}

	res, err := h.service.DepositToCustomerWallet(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, custID, in)
	if err != nil {
		code := "DEPOSIT_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrForbiddenParty) || errors.Is(err, ErrForbiddenAccount) {
			code = "FORBIDDEN_ENTITY"
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": res})
}

// @Summary List wallet transaction ledger
// @Description Lists customer wallet deposits and payment deductions.
// @Tags wallets
// @Produce json
// @Param id path int true "Customer ID"
// @Param before_id query int false "Cursor before_id"
// @Param limit query int false "Limit"
// @Success 200 {object} map[string]any
// @Router /api/v1/customers/{id}/wallet/ledger [get]
func (h *Handler) listWalletLedger(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "sales.view", "invoices.view", "contacts.view")
	if !ok {
		return
	}

	custID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || custID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid customer ID"}})
		return
	}

	beforeID, _ := strconv.ParseInt(c.Query("before_id"), 10, 64)
	limit, _ := strconv.ParseInt(c.Query("limit"), 10, 32)

	ledger, err := h.service.ListWalletLedger(c.Request.Context(), wsCtx.WorkspaceID, custID, beforeID, int32(limit))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ledger": ledger}})
}

type walletPaymentRequest struct {
	AmountMinor int64  `json:"amount_minor"`
	Amount      string `json:"amount"` // optional major decimal string
	Currency    string `json:"currency"`
}

// @Summary Pay invoice with customer wallet
// @Description Applies available customer wallet deposit liability to settle an invoice. Over-allocation and negative wallet balances are strictly prohibited.
// @Tags invoices
// @Accept json
// @Produce json
// @Param id path int true "Invoice ID"
// @Param request body walletPaymentRequest true "Payment amount"
// @Success 200 {object} map[string]any
// @Router /api/v1/invoices/{id}/wallet-payment [post]
func (h *Handler) payInvoiceWithWallet(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "sales.create", "invoices.create")
	if !ok {
		return
	}

	invID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || invID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid invoice ID"}})
		return
	}

	var req walletPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	if req.Amount != "" {
		parsed, parseErr := ParseMajorToMinor(req.Amount, CurrencyExponent(req.Currency))
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": parseErr.Error()}})
			return
		}
		req.AmountMinor = parsed
	}

	detail, err := h.service.PayInvoiceWithWallet(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, invID, req.AmountMinor)
	if err != nil {
		code := "WALLET_PAYMENT_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrInsufficientWalletBalance) {
			code = "INSUFFICIENT_WALLET_BALANCE"
		} else if errors.Is(err, ErrOverpayment) {
			code = "OVERPAYMENT_PROHIBITED"
		} else if errors.Is(err, ErrNotFound) {
			code = "NOT_FOUND"
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": detail})
}
