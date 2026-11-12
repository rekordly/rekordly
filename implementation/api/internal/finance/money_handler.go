package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service        *Service
	authMiddleware gin.HandlerFunc
}

func NewHandler(service *Service, authMiddleware gin.HandlerFunc) *Handler {
	return &Handler{service: service, authMiddleware: authMiddleware}
}

func (h *Handler) RegisterRoutes(group *gin.RouterGroup) {
	h.RegisterPurchaseOrderShareRoutes(group)
	h.RegisterPublicFinanceRoutes(group)
	protected := group.Group("")
	if h.authMiddleware != nil {
		protected.Use(h.authMiddleware)
	}

	// Money accounts
	protected.POST("/accounts", h.createAccount)
	protected.GET("/accounts", h.listAccounts)

	// Categories
	protected.POST("/categories", h.createCategory)
	protected.GET("/categories", h.listCategories)

	// Transactions
	protected.POST("/transactions", h.createTransaction)
	protected.GET("/transactions", h.listTransactions)
	protected.GET("/transactions/:id", h.getTransaction)
	protected.POST("/transactions/:id/void", h.voidTransaction)

	// Blueprint 03 money capture drafts, previews and confirmation commands.
	h.RegisterMoneyCaptureRoutes(protected)
	h.RegisterMixedMoneyRoutes(protected)

	// Sales, Purchases, Counterparties, Payments
	h.RegisterSalesPurchasesRoutes(protected)

	// Product and service catalogue. Stock commands are registered separately
	// once immutable movements and costing are implemented.
	h.RegisterCatalogueRoutes(protected)
	h.RegisterInventoryRoutes(protected)
	h.RegisterOutletRoutes(protected)
	h.RegisterStockReservationRoutes(protected)
	h.RegisterStockTransferRoutes(protected)
	h.RegisterStockCountRoutes(protected)
	h.RegisterStockAdjustmentRoutes(protected)

	// Blueprint 08 begins with non-posting purchase requests and approvals.
	h.RegisterProcurementRoutes(protected)
	h.RegisterPurchaseOrderRoutes(protected)
	h.RegisterGoodsReceiptRoutes(protected)
	h.RegisterSupplierBillRoutes(protected)
	h.RegisterSupplierAdvanceRoutes(protected)
	h.RegisterSupplierReturnRoutes(protected)
	protected.GET("/reports/procurement", h.procurementReport)

	// Invoices, Estimates, Shares, Returns and Customer Wallets
	h.RegisterInvoicesWalletsRoutes(protected)
	h.RegisterEstimateRoutes(protected)
	h.RegisterInvoiceShareRoutes(protected)
	h.RegisterSalesReturnRoutes(protected)
	h.RegisterReconciliationRoutes(protected)
	h.RegisterWorkspaceOpsRoutes(protected)
	h.RegisterBlueprintsCompletionRoutes(protected)
	h.RegisterPublicBlueprintsCompletionRoutes(group)

	// Storefront, Orders, Domains and Fulfilment (Blueprint 09)
	h.RegisterStorefrontRoutes(protected)
	h.RegisterStorefrontOrderRoutes(protected)
	h.RegisterPublicStorefrontRoutes(group)

	// Budgets and Tax-Readiness Reports
	h.RegisterBudgetsTaxRoutes(protected)

	// Blueprint 10: Personal Finance, Budgets, Loans, Assets, Investments, Owner Transfers & All Summary
	h.RegisterPersonalFinanceRoutes(protected)

	// Blueprint 11: Chart of Accounts, Journal Engine, Reports, Tax Schedules, Reconciliation & Period Close
	h.RegisterBlueprint11Routes(protected)

	// Blueprint 12: AI Assistant, CSV Imports, Background Jobs & Deterministic Automation
	h.RegisterBlueprint12Routes(protected)

	// Blueprint 13: Plans, Billing, Entitlements & Downgrades
	h.RegisterBlueprint13Routes(group, protected)

	// Blueprint 14: Notifications, Documents, Files & Sharing
	h.RegisterBlueprint14Routes(group, protected)

	// Blueprint 15: Offline Sync, Conflicts & Recovery
	h.RegisterBlueprint15Routes(protected)
}

// @Summary Create a money account
// @Description Creates a new money account (cash, bank, mobile wallet) scoped to the active workspace.
// @Tags accounts
// @Accept json
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param request body CreateAccountInput true "Account details"
// @Success 201 {object} map[string]any
// @Failure 400 {object} map[string]any
// @Failure 401 {object} map[string]any
// @Failure 403 {object} map[string]any
// @Router /api/v1/accounts [post]
func (h *Handler) createAccount(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "money.create")
	if !ok {
		return
	}

	var in CreateAccountInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	acc, err := h.service.CreateAccount(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CREATE_ACCOUNT_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": acc})
}

// @Summary List money accounts
// @Description Lists active money accounts for the active workspace.
// @Tags accounts
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Success 200 {object} map[string]any
// @Failure 401 {object} map[string]any
// @Failure 403 {object} map[string]any
// @Router /api/v1/accounts [get]
func (h *Handler) listAccounts(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "money.view", "sales.view", "invoices.view")
	if !ok {
		return
	}

	accounts, err := h.service.ListAccounts(c.Request.Context(), wsCtx.WorkspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list accounts"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"accounts": accounts}})
}

// @Summary Create a category
// @Description Creates a new category for money classification.
// @Tags categories
// @Accept json
// @Produce json
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param request body CreateCategoryInput true "Category details"
// @Success 201 {object} map[string]any
// @Failure 400 {object} map[string]any
// @Router /api/v1/categories [post]
func (h *Handler) createCategory(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "money.create")
	if !ok {
		return
	}

	var in CreateCategoryInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	cat, err := h.service.CreateCategory(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CREATE_CATEGORY_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": cat})
}

// @Summary List categories
// @Description Lists categories for the active workspace filtered optionally by direction and scope.
// @Tags categories
// @Produce json
// @Param direction query string false "Direction: money_in, money_out"
// @Param scope query string false "Scope: personal, business, both"
// @Success 200 {object} map[string]any
// @Router /api/v1/categories [get]
func (h *Handler) listCategories(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "money.view", "purchases.view", "sales.view")
	if !ok {
		return
	}

	// Existing workspaces created before category seeding was connected may have
	// no categories. This idempotent initializer fixes that on first use.
	if err := h.service.SeedDefaultCategories(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.Kind); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "CATEGORY_SETUP_FAILED", "message": "Failed to prepare categories"}})
		return
	}

	direction := c.Query("direction")
	// Categories never cross Personal and Business workspaces, even if a caller
	// sends a different scope query parameter.
	scope := wsCtx.Kind

	categories, err := h.service.ListCategories(c.Request.Context(), wsCtx.WorkspaceID, direction, scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list categories"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"categories": categories}})
}

// @Summary Create or post a money transaction
// @Description Creates a draft or posted money transaction (income, expense, transfer) with double-entry balancing and idempotency protection.
// @Tags transactions
// @Accept json
// @Produce json
// @Param Idempotency-Key header string false "Idempotency key"
// @Param X-Workspace-ID header int false "Workspace ID"
// @Param request body CreateTransactionInput true "Transaction payload"
// @Success 201 {object} map[string]any
// @Failure 400 {object} map[string]any
// @Router /api/v1/transactions [post]
func (h *Handler) createTransaction(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "money.create")
	if !ok {
		return
	}

	var in CreateTransactionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	// Read idempotency key from header if not in body
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}

	detail, err := h.service.CreateTransaction(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		code := "TRANSACTION_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrForbiddenAccount) || errors.Is(err, ErrForbiddenCategory) {
			code = "FORBIDDEN_ENTITY"
			status = http.StatusForbidden
		} else if errors.Is(err, ErrLedgerUnbalanced) {
			code = "UNBALANCED_LEDGER"
			status = http.StatusInternalServerError
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": detail})
}

// @Summary List money transactions
// @Description Lists transactions for the active workspace with date filtering, status, direction, and cursor pagination.
// @Tags transactions
// @Produce json
// @Param from query string false "From date (YYYY-MM-DD)"
// @Param to query string false "To date (YYYY-MM-DD)"
// @Param status query string false "Status: draft, posted, voided, reversed"
// @Param direction query string false "Direction: money_in, money_out, transfer"
// @Param before_id query int false "Cursor before_id"
// @Param limit query int false "Limit (default 50)"
// @Success 200 {object} map[string]any
// @Router /api/v1/transactions [get]
func (h *Handler) listTransactions(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "money.view")
	if !ok {
		return
	}

	var filter ListTransactionsFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}

	txns, err := h.service.ListTransactions(c.Request.Context(), wsCtx.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list transactions"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"transactions": txns}})
}

// @Summary Get transaction by ID
// @Description Fetches transaction detail by ID for the active workspace.
// @Tags transactions
// @Produce json
// @Param id path int true "Transaction ID"
// @Success 200 {object} map[string]any
// @Failure 404 {object} map[string]any
// @Router /api/v1/transactions/{id} [get]
func (h *Handler) getTransaction(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "money.view")
	if !ok {
		return
	}

	txnID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || txnID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid transaction ID"}})
		return
	}

	detail, err := h.service.GetTransaction(c.Request.Context(), wsCtx.WorkspaceID, txnID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Transaction not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": detail})
}

type voidTransactionRequest struct {
	Reason string `json:"reason" binding:"required"`
}

// @Summary Void a posted transaction
// @Description Marks a posted transaction as voided, creates an immutable linked reversal transaction, reverses account balances, and creates reversal ledger entries.
// @Tags transactions
// @Accept json
// @Produce json
// @Param id path int true "Transaction ID"
// @Param request body voidTransactionRequest true "Void reason"
// @Success 200 {object} map[string]any
// @Failure 400 {object} map[string]any
// @Failure 404 {object} map[string]any
// @Router /api/v1/transactions/{id}/void [post]
func (h *Handler) voidTransaction(c *gin.Context) {
	wsCtx, ok := requirePermission(c, "money.void")
	if !ok {
		return
	}

	txnID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || txnID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid transaction ID"}})
		return
	}

	var req voidTransactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": "Void reason is required"}})
		return
	}

	detail, err := h.service.VoidTransaction(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, txnID, req.Reason)
	if err != nil {
		code := "VOID_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrNotFound) {
			code = "NOT_FOUND"
			status = http.StatusNotFound
		} else if errors.Is(err, ErrAlreadyVoided) {
			code = "ALREADY_VOIDED"
		} else if errors.Is(err, ErrCannotVoidNonPosted) {
			code = "CANNOT_VOID_NON_POSTED"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": detail})
}

func (h *Handler) RegisterReconciliationRoutes(protected *gin.RouterGroup) {
	reconHandler := NewBankReconciliationHandler(NewBankReconciliationService(h.service.pool, h.service.queries))
	reconHandler.RegisterReconciliationRoutes(protected)
}
