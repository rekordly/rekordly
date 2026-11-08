package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterSalesPurchasesRoutes(protected *gin.RouterGroup) {
	// Counterparties (Customers & Suppliers)
	protected.POST("/customers", h.createCustomer)
	protected.GET("/customers", h.listCustomers)
	protected.POST("/suppliers", h.createSupplier)
	protected.GET("/suppliers", h.listSuppliers)

	// Sales
	protected.POST("/sales", h.createSale)
	protected.GET("/sales", h.listSales)
	protected.GET("/sales/:id", h.getSale)

	// Purchases
	protected.POST("/purchases", h.createPurchase)
	protected.GET("/purchases", h.listPurchases)
	protected.GET("/purchases/:id", h.getPurchase)

	// Payments & Split Payments
	protected.POST("/payments", h.createPayment)
	protected.GET("/payments", h.listPayments)
	protected.GET("/payments/:id", h.getPayment)
}

// @Summary Create customer counterparty
// @Description Creates an external customer record for the active workspace.
// @Tags counterparties
// @Accept json
// @Produce json
// @Param request body CreateCounterpartyInput true "Customer details"
// @Success 201 {object} map[string]any
// @Router /api/v1/customers [post]
func (h *Handler) createCustomer(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var in CreateCounterpartyInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	in.PartyType = "customer"

	cp, err := h.service.CreateCounterparty(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CREATE_CUSTOMER_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": cp})
}

// @Summary List customer counterparties
// @Description Lists external customer records for the active workspace.
// @Tags counterparties
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/customers [get]
func (h *Handler) listCustomers(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	customers, err := h.service.ListCounterparties(c.Request.Context(), wsCtx.WorkspaceID, "customer")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list customers"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"customers": customers}})
}

// @Summary Create supplier counterparty
// @Description Creates an external supplier record for the active workspace.
// @Tags counterparties
// @Accept json
// @Produce json
// @Param request body CreateCounterpartyInput true "Supplier details"
// @Success 201 {object} map[string]any
// @Router /api/v1/suppliers [post]
func (h *Handler) createSupplier(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var in CreateCounterpartyInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	in.PartyType = "supplier"

	cp, err := h.service.CreateCounterparty(c.Request.Context(), wsCtx.WorkspaceID, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "CREATE_SUPPLIER_FAILED", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": cp})
}

// @Summary List supplier counterparties
// @Description Lists external supplier records for the active workspace.
// @Tags counterparties
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/suppliers [get]
func (h *Handler) listSuppliers(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	suppliers, err := h.service.ListCounterparties(c.Request.Context(), wsCtx.WorkspaceID, "supplier")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list suppliers"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"suppliers": suppliers}})
}

// @Summary Create a sale
// @Description Creates a sale record with optional immediate settlement and split payments.
// @Tags sales
// @Accept json
// @Produce json
// @Param request body CreateSaleInput true "Sale payload"
// @Success 201 {object} map[string]any
// @Router /api/v1/sales [post]
func (h *Handler) createSale(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var in CreateSaleInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}

	detail, err := h.service.CreateSale(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		code := "SALE_FAILED"
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

// @Summary List sales
// @Description Lists sales for the active workspace.
// @Tags sales
// @Produce json
// @Param from query string false "From date (YYYY-MM-DD)"
// @Param to query string false "To date (YYYY-MM-DD)"
// @Param status query string false "Status: unpaid, partially_paid, paid, voided"
// @Param customer_id query int false "Customer ID"
// @Param before_id query int false "Cursor before_id"
// @Param limit query int false "Limit"
// @Success 200 {object} map[string]any
// @Router /api/v1/sales [get]
func (h *Handler) listSales(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var filter ListSalesFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}

	sales, err := h.service.ListSales(c.Request.Context(), wsCtx.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list sales"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"sales": sales}})
}

// @Summary Get sale by ID
// @Description Fetches sale detail and linked payments by ID.
// @Tags sales
// @Produce json
// @Param id path int true "Sale ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/sales/{id} [get]
func (h *Handler) getSale(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	saleID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || saleID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid sale ID"}})
		return
	}

	detail, err := h.service.GetSale(c.Request.Context(), wsCtx.WorkspaceID, saleID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Sale not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": detail})
}

// @Summary Create a purchase
// @Description Creates a purchase record with optional immediate settlement and split payments.
// @Tags purchases
// @Accept json
// @Produce json
// @Param request body CreatePurchaseInput true "Purchase payload"
// @Success 201 {object} map[string]any
// @Router /api/v1/purchases [post]
func (h *Handler) createPurchase(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var in CreatePurchaseInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}

	detail, err := h.service.CreatePurchase(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		code := "PURCHASE_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrForbiddenParty) || errors.Is(err, ErrForbiddenCategory) {
			code = "FORBIDDEN_ENTITY"
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": detail})
}

// @Summary List purchases
// @Description Lists purchases for the active workspace.
// @Tags purchases
// @Produce json
// @Param from query string false "From date (YYYY-MM-DD)"
// @Param to query string false "To date (YYYY-MM-DD)"
// @Param status query string false "Status: unpaid, partially_paid, paid, voided"
// @Param supplier_id query int false "Supplier ID"
// @Param before_id query int false "Cursor before_id"
// @Param limit query int false "Limit"
// @Success 200 {object} map[string]any
// @Router /api/v1/purchases [get]
func (h *Handler) listPurchases(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var filter ListPurchasesFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}

	purchases, err := h.service.ListPurchases(c.Request.Context(), wsCtx.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list purchases"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"purchases": purchases}})
}

// @Summary Get purchase by ID
// @Description Fetches purchase detail and linked payments by ID.
// @Tags purchases
// @Produce json
// @Param id path int true "Purchase ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/purchases/{id} [get]
func (h *Handler) getPurchase(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	purchaseID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || purchaseID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid purchase ID"}})
		return
	}

	detail, err := h.service.GetPurchase(c.Request.Context(), wsCtx.WorkspaceID, purchaseID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Purchase not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": detail})
}

// @Summary Record a payment or split payment
// @Description Records a customer or supplier payment, optionally linked to a sale or purchase, with strict overpayment protection and balanced ledger entries.
// @Tags payments
// @Accept json
// @Produce json
// @Param Idempotency-Key header string false "Idempotency key"
// @Param request body CreatePaymentInput true "Payment payload"
// @Success 201 {object} map[string]any
// @Failure 400 {object} map[string]any
// @Router /api/v1/payments [post]
func (h *Handler) createPayment(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var in CreatePaymentInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}

	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}

	detail, err := h.service.CreatePayment(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, in)
	if err != nil {
		code := "PAYMENT_FAILED"
		status := http.StatusBadRequest
		if errors.Is(err, ErrOverpayment) {
			code = "OVERPAYMENT_PROHIBITED"
		} else if errors.Is(err, ErrForbiddenRecord) || errors.Is(err, ErrForbiddenParty) || errors.Is(err, ErrForbiddenAccount) {
			code = "FORBIDDEN_ENTITY"
			status = http.StatusForbidden
		} else if errors.Is(err, ErrLegsSumMismatch) || errors.Is(err, ErrNoPaymentLegs) {
			code = "INVALID_PAYMENT_LEGS"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": detail})
}

// @Summary List payments
// @Description Lists payments for the active workspace.
// @Tags payments
// @Produce json
// @Param from query string false "From date (YYYY-MM-DD)"
// @Param to query string false "To date (YYYY-MM-DD)"
// @Param direction query string false "Direction: incoming, outgoing"
// @Param status query string false "Status: posted, voided"
// @Param linked_record_type query string false "Linked record type: sale, purchase, invoice"
// @Param linked_record_id query int false "Linked record ID"
// @Param before_id query int false "Cursor before_id"
// @Param limit query int false "Limit"
// @Success 200 {object} map[string]any
// @Router /api/v1/payments [get]
func (h *Handler) listPayments(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	var filter ListPaymentsFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}

	payments, err := h.service.ListPayments(c.Request.Context(), wsCtx.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list payments"}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"payments": payments}})
}

// @Summary Get payment by ID
// @Description Fetches payment detail and payment legs by ID.
// @Tags payments
// @Produce json
// @Param id path int true "Payment ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/payments/{id} [get]
func (h *Handler) getPayment(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_WORKSPACE", "message": err.Error()}})
		return
	}

	paymentID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || paymentID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid payment ID"}})
		return
	}

	detail, err := h.service.GetPayment(c.Request.Context(), wsCtx.WorkspaceID, paymentID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Payment not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": detail})
}
