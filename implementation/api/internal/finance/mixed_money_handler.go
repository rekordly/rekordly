package finance

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/rekordly/rekordly-api/internal/db"
)

func (h *Handler) RegisterMixedMoneyRoutes(protected *gin.RouterGroup) {
	protected.POST("/owner/commands/confirm-mixed-record", h.confirmMixedMoneyRecord)
	protected.POST("/owner/mixed-money-groups/:id/commands/reimburse", h.reimburseMixedMoney)
}

func (h *Handler) confirmMixedMoneyRecord(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	var in ConfirmMixedMoneyRecordInput
	if err := c.ShouldBindJSON(&in); err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_REQUEST", err)
		return
	}
	result, err := h.service.ConfirmMixedMoneyRecord(c.Request.Context(), wsCtx.UserID, wsCtx.WorkspaceID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	status := http.StatusCreated
	if result.WasDuplicate {
		status = http.StatusOK
	}
	c.JSON(status, gin.H{"data": gin.H{"group": mixedMoneyGroupView(result.Group), "personal_record": moneyRecordView(result.PersonalRecord), "business_record": moneyRecordView(result.BusinessRecord), "was_duplicate": result.WasDuplicate}})
}

func (h *Handler) reimburseMixedMoney(c *gin.Context) {
	wsCtx, ok := moneyCaptureWorkspace(c)
	if !ok {
		return
	}
	groupID, err := requiredPositiveParam(c, "id")
	if err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_ID", err)
		return
	}
	var in ReimburseMixedMoneyInput
	if err := c.ShouldBindJSON(&in); err != nil {
		moneyCaptureError(c, http.StatusBadRequest, "INVALID_REQUEST", err)
		return
	}
	result, err := h.service.ReimburseMixedMoney(c.Request.Context(), wsCtx.UserID, wsCtx.WorkspaceID, groupID, c.GetHeader("Idempotency-Key"), in)
	if err != nil {
		moneyCaptureServiceError(c, err)
		return
	}
	status := http.StatusCreated
	if result.WasDuplicate {
		status = http.StatusOK
	}
	c.JSON(status, gin.H{"data": gin.H{"group": mixedMoneyGroupView(result.Group), "reimbursement": mixedMoneyReimbursementView(result.Reimbursement), "from_record": moneyRecordView(result.FromRecord), "to_record": moneyRecordView(result.ToRecord), "was_duplicate": result.WasDuplicate}})
}

func mixedMoneyGroupView(group db.MixedMoneyGroup) gin.H {
	return gin.H{
		"id": strconv.FormatInt(group.ID, 10), "personal_workspace_id": strconv.FormatInt(group.PersonalWorkspaceID, 10), "business_workspace_id": strconv.FormatInt(group.BusinessWorkspaceID, 10), "paying_workspace_id": strconv.FormatInt(group.PayingWorkspaceID, 10), "paying_money_account_id": strconv.FormatInt(group.PayingMoneyAccountID, 10), "personal_money_record_id": pgInt8View(group.PersonalMoneyRecordID), "business_money_record_id": pgInt8View(group.BusinessMoneyRecordID), "currency": group.Currency, "currency_exponent": group.CurrencyExponent, "total_amount_minor": strconv.FormatInt(group.TotalAmountMinor, 10), "personal_amount_minor": strconv.FormatInt(group.PersonalAmountMinor, 10), "business_amount_minor": strconv.FormatInt(group.BusinessAmountMinor, 10), "reimbursed_amount_minor": strconv.FormatInt(group.ReimbursedAmountMinor, 10), "outstanding_amount_minor": strconv.FormatInt(mixedOutstandingMinor(group), 10), "effective_date": group.EffectiveDate.Time.Format("2006-01-02"), "status": group.Status, "settlement_version": group.SettlementVersion,
	}
}

func mixedMoneyReimbursementView(reimbursement db.MixedMoneyReimbursement) gin.H {
	return gin.H{"id": strconv.FormatInt(reimbursement.ID, 10), "mixed_money_group_id": strconv.FormatInt(reimbursement.MixedMoneyGroupID, 10), "from_workspace_id": strconv.FormatInt(reimbursement.FromWorkspaceID, 10), "to_workspace_id": strconv.FormatInt(reimbursement.ToWorkspaceID, 10), "amount_minor": strconv.FormatInt(reimbursement.AmountMinor, 10), "currency": reimbursement.Currency, "effective_date": reimbursement.EffectiveDate.Time.Format("2006-01-02"), "from_money_record_id": pgInt8View(reimbursement.FromMoneyRecordID), "to_money_record_id": pgInt8View(reimbursement.ToMoneyRecordID)}
}

func mixedOutstandingMinor(group db.MixedMoneyGroup) int64 {
	owed := group.BusinessAmountMinor
	if group.PayingWorkspaceID == group.BusinessWorkspaceID {
		owed = group.PersonalAmountMinor
	}
	return owed - group.ReimbursedAmountMinor
}
