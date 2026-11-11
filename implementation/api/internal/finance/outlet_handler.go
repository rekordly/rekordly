package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterOutletRoutes(protected *gin.RouterGroup) {
	protected.POST("/inventory/locations", h.createOutlet)
	protected.GET("/inventory/locations", h.listOutlets)
	protected.GET("/inventory/locations/:id", h.getOutlet)
	protected.PATCH("/inventory/locations/:id", h.updateOutlet)
}

func (h *Handler) createOutlet(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in CreateOutletInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	outlet, err := h.service.CreateOutlet(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		status := http.StatusBadRequest
		code := "OUTLET_CREATE_FAILED"
		if errors.Is(err, ErrOutletCodeConflict) {
			code = "CODE_CONFLICT"
		} else if errors.Is(err, ErrOutletNameConflict) {
			code = "NAME_CONFLICT"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"location": outlet}})
}

func (h *Handler) listOutlets(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	activeOnly := c.Query("active_only") == "true" || c.Query("active_only") == "1"
	outlets, err := h.service.ListOutlets(c.Request.Context(), ws.WorkspaceID, activeOnly)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list inventory locations"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"locations": outlets}})
}

func (h *Handler) getOutlet(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid location ID"}})
		return
	}
	outlet, err := h.service.GetOutlet(c.Request.Context(), ws.WorkspaceID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Inventory location not found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"location": outlet}})
}

func (h *Handler) updateOutlet(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid location ID"}})
		return
	}
	var in UpdateOutletInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	outlet, err := h.service.UpdateOutlet(c.Request.Context(), ws.WorkspaceID, id, in)
	if err != nil {
		status := http.StatusBadRequest
		code := "OUTLET_UPDATE_FAILED"
		if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		} else if errors.Is(err, ErrOutletCodeConflict) {
			code = "CODE_CONFLICT"
		} else if errors.Is(err, ErrOutletNameConflict) {
			code = "NAME_CONFLICT"
		} else if errors.Is(err, ErrCannotDeactivateDefaultLocation) || errors.Is(err, ErrCannotDeactivateLocationWithStock) {
			code = "DEACTIVATION_REJECTED"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"location": outlet}})
}
