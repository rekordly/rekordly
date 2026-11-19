package finance

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) registerStorefrontPaymentRoutes(g *gin.RouterGroup) {
	g.GET("/storefront/payments/banks", h.listStorefrontPaymentBanks)
	g.POST("/storefront/payments/resolve-account", h.resolveStorefrontBankAccount)
	g.POST("/storefront/payments/payout-account", h.saveStorefrontPayoutAccount)
	g.GET("/storefront/payments", h.getStorefrontPayments)
	g.PATCH("/storefront/payments/settings", h.updateStorefrontPaymentSettings)
	g.POST("/storefront/payments/record-payout", h.recordStorefrontPayout)
}

func (h *Handler) RegisterStorefrontPaymentWebhookRoutes(g *gin.RouterGroup) {
	g.POST("/webhooks/payments/paystack", h.paystackStorefrontPaymentWebhook)
	g.POST("/webhooks/payments/squad", h.squadStorefrontPaymentWebhook)
}

func (h *Handler) listStorefrontPaymentBanks(c *gin.Context) {
	provider := c.Query("provider")
	banks, err := h.service.ListPaymentBanks(c.Request.Context(), provider)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"banks": banks}})
}

func (h *Handler) resolveStorefrontBankAccount(c *gin.Context) {
	var in struct {
		Provider      string `json:"provider"`
		BankCode      string `json:"bank_code" binding:"required"`
		AccountNumber string `json:"account_number" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": err.Error()}})
		return
	}
	name, err := h.service.ResolveBankAccount(c.Request.Context(), in.Provider, in.BankCode, in.AccountNumber)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"account_name":   name,
		"account_number": in.AccountNumber,
		"bank_code":      in.BankCode,
	}})
}

func (h *Handler) saveStorefrontPayoutAccount(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_checkout")
	if !ok {
		return
	}
	var in SavePayoutAccountInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.SavePayoutAccount(c.Request.Context(), ws.WorkspaceID, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"payout_account": res}})
}

func (h *Handler) getStorefrontPayments(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_checkout", "storefront.view")
	if !ok {
		return
	}
	settings, err := h.service.GetStorefrontPaymentSettings(c.Request.Context(), ws.WorkspaceID)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": settings})
}

func (h *Handler) updateStorefrontPaymentSettings(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_checkout")
	if !ok {
		return
	}
	var in UpdateStorefrontPaymentSettingsInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.UpdateStorefrontPaymentSettings(c.Request.Context(), ws.WorkspaceID, in)
	if err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) recordStorefrontPayout(c *gin.Context) {
	ws, ok := businessPermission(c, "storefront.manage_checkout")
	if !ok {
		return
	}
	var in RecordPayoutInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BAD_REQUEST", "message": err.Error()}})
		return
	}
	if err := h.service.RecordPayoutFromProvider(c.Request.Context(), ws.WorkspaceID, in); err != nil {
		h.storefrontError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"status": "recorded"}})
}

func (h *Handler) paystackStorefrontPaymentWebhook(c *gin.Context) {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unable to read body"})
		return
	}
	if err := h.service.HandlePaymentWebhook(c.Request.Context(), "paystack", raw, c.Request.Header); err != nil {
		if err == ErrInvalidWebhookSignature {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "received"})
}

func (h *Handler) squadStorefrontPaymentWebhook(c *gin.Context) {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unable to read body"})
		return
	}
	if err := h.service.HandlePaymentWebhook(c.Request.Context(), "squad", raw, c.Request.Header); err != nil {
		if err == ErrInvalidWebhookSignature {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "received"})
}
