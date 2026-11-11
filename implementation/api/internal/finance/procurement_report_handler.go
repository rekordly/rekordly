package finance

import (
	"github.com/gin-gonic/gin"
	"net/http"
)

func (h *Handler) procurementReport(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	report, err := h.service.GetProcurementReport(c.Request.Context(), ws.WorkspaceID, c.Query("as_of"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "REPORT_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": report})
}
