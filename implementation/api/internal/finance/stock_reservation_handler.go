package finance

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterStockReservationRoutes(protected *gin.RouterGroup) {
	protected.POST("/inventory/reservations", h.reserveStock)
	protected.POST("/inventory/reservations/:id/release", h.releaseStockReservation)
	protected.GET("/inventory/reservations", h.listStockReservations)
}

func (h *Handler) reserveStock(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var in ReserveStockInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	res, err := h.service.ReserveStock(c.Request.Context(), ws.WorkspaceID, ws.UserID, in)
	if err != nil {
		status := http.StatusBadRequest
		code := "RESERVATION_FAILED"
		if errors.Is(err, ErrInsufficientStock) {
			code = "INSUFFICIENT_STOCK"
		} else if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"reservation": res}})
}

func (h *Handler) releaseStockReservation(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "Invalid reservation ID"}})
		return
	}
	res, err := h.service.ReleaseStockReservation(c.Request.Context(), ws.WorkspaceID, ws.UserID, id)
	if err != nil {
		status := http.StatusBadRequest
		code := "RELEASE_FAILED"
		if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
			code = "NOT_FOUND"
		} else if errors.Is(err, ErrReservationNotActive) {
			code = "RESERVATION_NOT_ACTIVE"
		}
		c.JSON(status, gin.H{"error": gin.H{"code": code, "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"reservation": res}})
}

func (h *Handler) listStockReservations(c *gin.Context) {
	ws, ok := businessWorkspace(c)
	if !ok {
		return
	}
	var filter ListStockReservationsFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_FILTER", "message": err.Error()}})
		return
	}
	resList, err := h.service.ListStockReservations(c.Request.Context(), ws.WorkspaceID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Failed to list stock reservations"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"reservations": resList}})
}
