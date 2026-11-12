package finance

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterBlueprint17Routes(protected *gin.RouterGroup) {
	ops := protected.Group("/admin/ops")
	{
		ops.GET("/overview", h.getAdminOpsOverview)
		ops.GET("/jobs", h.listAdminOutboxJobs)
		ops.POST("/jobs/:jobId/commands/retry", h.retryAdminOutboxJob)
		ops.GET("/flags", h.listAdminFeatureFlags)
		ops.PUT("/flags/:flagKey", h.updateAdminFeatureFlag)
		ops.GET("/maintenance", h.getAdminMaintenanceMode)
		ops.PUT("/maintenance", h.updateAdminMaintenanceMode)
		ops.POST("/reconcile", h.runAdminReconciliation)
		ops.GET("/deployments", h.listAdminDeployments)
		ops.POST("/deployments", h.createAdminDeployment)
		ops.GET("/backups/rehearsals", h.listAdminBackupRehearsals)
		ops.POST("/backups/rehearse", h.runAdminBackupRehearsal)
		ops.GET("/beta-cohort", h.listAdminBetaCohort)
		ops.POST("/beta-cohort", h.upsertAdminBetaCohort)
	}
}

func requireAdminOps(c *gin.Context) (WorkspaceContext, bool) {
	wsCtx, err := GetWorkspaceContext(c)
	if err != nil || wsCtx.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "authentication required"}})
		return WorkspaceContext{}, false
	}
	if !wsCtx.HasPermission("admin.recovery") && !wsCtx.IsOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "admin operations permission required"}})
		return WorkspaceContext{}, false
	}
	return wsCtx, true
}

func (h *Handler) getAdminOpsOverview(c *gin.Context) {
	if _, ok := requireAdminOps(c); !ok {
		return
	}
	res, err := h.service.GetAdminOpsOverview(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (h *Handler) listAdminOutboxJobs(c *gin.Context) {
	if _, ok := requireAdminOps(c); !ok {
		return
	}
	limit64, _ := strconv.ParseInt(c.Query("limit"), 10, 32)
	items, err := h.service.ListAdminOutboxJobs(c.Request.Context(), int32(limit64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) retryAdminOutboxJob(c *gin.Context) {
	wsCtx, ok := requireAdminOps(c)
	if !ok {
		return
	}
	jid, _ := strconv.ParseInt(c.Param("jobId"), 10, 64)
	var in struct {
		Reason string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	row, err := h.service.RetryAdminOutboxJob(c.Request.Context(), wsCtx.UserID, jid, in.Reason)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "RETRY_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func (h *Handler) listAdminFeatureFlags(c *gin.Context) {
	if _, ok := requireAdminOps(c); !ok {
		return
	}
	flags, err := h.service.ListFeatureFlags(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": flags})
}

func (h *Handler) updateAdminFeatureFlag(c *gin.Context) {
	wsCtx, ok := requireAdminOps(c)
	if !ok {
		return
	}
	var in struct {
		EnabledInEnv     bool   `json:"enabled_in_env"`
		KillSwitchActive bool   `json:"kill_switch_active"`
		Reason           string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	flag, err := h.service.UpdateFeatureFlag(c.Request.Context(), wsCtx.UserID, c.Param("flagKey"), in.EnabledInEnv, in.KillSwitchActive, in.Reason)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "FLAG_UPDATE_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": flag})
}

func (h *Handler) getAdminMaintenanceMode(c *gin.Context) {
	if _, ok := requireAdminOps(c); !ok {
		return
	}
	mm, err := h.service.GetMaintenanceMode(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": mm})
}

func (h *Handler) updateAdminMaintenanceMode(c *gin.Context) {
	wsCtx, ok := requireAdminOps(c)
	if !ok {
		return
	}
	var in struct {
		Mode       string `json:"mode" binding:"required"`
		Scope      string `json:"scope"`
		Reason     string `json:"reason" binding:"required"`
		OwnerLabel string `json:"owner_label"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	mm, err := h.service.UpdateMaintenanceMode(c.Request.Context(), wsCtx.UserID, in.Mode, in.Scope, in.Reason, in.OwnerLabel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "MAINTENANCE_UPDATE_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": mm})
}

func (h *Handler) runAdminReconciliation(c *gin.Context) {
	wsCtx, ok := requireAdminOps(c)
	if !ok {
		return
	}
	var in struct {
		WorkspaceID *int64 `json:"workspace_id"`
		Reason      string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	rep, err := h.service.RunAdminReconciliation(c.Request.Context(), wsCtx.UserID, in.WorkspaceID, in.Reason)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "RECONCILE_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rep})
}

func (h *Handler) listAdminDeployments(c *gin.Context) {
	if _, ok := requireAdminOps(c); !ok {
		return
	}
	items, err := h.service.queries.ListDeploymentRecords(c.Request.Context(), 25)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) createAdminDeployment(c *gin.Context) {
	if _, ok := requireAdminOps(c); !ok {
		return
	}
	var in struct {
		Environment      string `json:"environment" binding:"required"`
		CommitSHA        string `json:"commit_sha" binding:"required"`
		ImageTag         string `json:"image_tag"`
		MigrationVersion string `json:"migration_version"`
		DeployedBy       string `json:"deployed_by"`
		Status           string `json:"status"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	rec, err := h.service.RecordDeployment(c.Request.Context(), in.Environment, in.CommitSHA, in.ImageTag, in.MigrationVersion, in.DeployedBy, in.Status)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "DEPLOYMENT_RECORD_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": rec})
}

func (h *Handler) listAdminBackupRehearsals(c *gin.Context) {
	if _, ok := requireAdminOps(c); !ok {
		return
	}
	items, err := h.service.queries.ListBackupRehearsalRecords(c.Request.Context(), 25)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) runAdminBackupRehearsal(c *gin.Context) {
	if _, ok := requireAdminOps(c); !ok {
		return
	}
	var in struct {
		Environment string `json:"environment" binding:"required"`
		BackupID    string `json:"backup_id" binding:"required"`
		Source      string `json:"backup_source"`
		Checksum    string `json:"checksum_sha256" binding:"required"`
		RPOSeconds  int32  `json:"rpo_seconds"`
		RTOSeconds  int32  `json:"rto_seconds"`
		WorkspaceID *int64 `json:"workspace_id"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	rec, err := h.service.RecordBackupRehearsal(c.Request.Context(), in.Environment, in.BackupID, in.Source, in.Checksum, in.RPOSeconds, in.RTOSeconds, in.WorkspaceID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "REHEARSAL_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": rec})
}

func (h *Handler) listAdminBetaCohort(c *gin.Context) {
	if _, ok := requireAdminOps(c); !ok {
		return
	}
	items, err := h.service.queries.ListBetaCohortEntries(c.Request.Context(), 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) upsertAdminBetaCohort(c *gin.Context) {
	if _, ok := requireAdminOps(c); !ok {
		return
	}
	var in struct {
		WorkspaceID     int64    `json:"workspace_id" binding:"required"`
		Segment         string   `json:"segment" binding:"required"`
		UseCase         string   `json:"use_case" binding:"required"`
		ConsentAccepted bool     `json:"consent_accepted"`
		EnabledModules  []string `json:"enabled_modules"`
		PlanIntent      string   `json:"plan_intent"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	rec, err := h.service.UpsertBetaCohort(c.Request.Context(), in.WorkspaceID, in.Segment, in.UseCase, in.ConsentAccepted, in.EnabledModules, in.PlanIntent)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "BETA_COHORT_FAILED", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rec})
}
