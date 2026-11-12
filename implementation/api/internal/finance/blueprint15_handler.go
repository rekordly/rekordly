package finance

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterBlueprint15Routes(protected *gin.RouterGroup) {
	protected.GET("/offline/capabilities", h.getOfflineCapabilities)
	protected.POST("/sync/sessions", h.createSyncSession)
	protected.POST("/sync/sessions/:sessionId/commands/complete", h.completeSyncSession)
	protected.POST("/sync/commands:batch", h.processSyncCommandBatch)
	protected.GET("/sync/commands/:clientCommandId", h.getSyncCommandStatus)
	protected.GET("/idempotency/:key", h.getIdempotencyRecord)
}

func (h *Handler) getOfflineCapabilities(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 || wsCtx.WorkspaceID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "workspace context required"}})
		return
	}
	manifest, err := h.service.GetOfflineCapabilities(c.Request.Context(), wsCtx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": manifest})
}

func (h *Handler) createSyncSession(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 || wsCtx.WorkspaceID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "workspace context required"}})
		return
	}
	var in CreateSyncSessionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CreateSyncSession(c.Request.Context(), wsCtx, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "SYNC_SESSION_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (h *Handler) completeSyncSession(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 || wsCtx.WorkspaceID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "workspace context required"}})
		return
	}
	var in CompleteSyncSessionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.CompleteSyncSession(c.Request.Context(), wsCtx, c.Param("sessionId"), in)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "sync session not found"}})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "SYNC_SESSION_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) processSyncCommandBatch(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 || wsCtx.WorkspaceID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "workspace context required"}})
		return
	}
	var in SyncBatchInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	res, err := h.service.ProcessSyncCommandBatch(c.Request.Context(), wsCtx, in)
	if err != nil {
		code := "SYNC_BATCH_ERROR"
		status := http.StatusBadRequest
		if err.Error() == "SYNC_SESSION_EXPIRED" {
			code = "SYNC_SESSION_EXPIRED"
			status = http.StatusConflict
		} else if err.Error() == "DEPENDENCY_CYCLE" {
			code = "DEPENDENCY_CYCLE"
			status = http.StatusUnprocessableEntity
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getSyncCommandStatus(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 || wsCtx.WorkspaceID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "workspace context required"}})
		return
	}
	res, err := h.service.GetSyncCommandStatus(c.Request.Context(), wsCtx, c.Param("clientCommandId"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "command receipt not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) getIdempotencyRecord(c *gin.Context) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 || wsCtx.WorkspaceID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "workspace context required"}})
		return
	}
	res, err := h.service.GetIdempotencyRecordForSync(c.Request.Context(), wsCtx, c.Param("key"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "idempotency record not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}
