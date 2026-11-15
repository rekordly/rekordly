package finance

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/shopspring/decimal"
)

// ProductStockChangeInput adds or removes stock for one product, by hand.
type ProductStockChangeInput struct {
	VariantID      *int64 `json:"variant_id"`
	Direction      string `json:"direction" binding:"required"` // add | remove
	Quantity       string `json:"quantity" binding:"required"`
	Reason         string `json:"reason" binding:"required"`
	UnitCost       string `json:"unit_cost"` // what each one cost, when adding new stock
	OutletID       int64  `json:"outlet_id"`
	Note           string `json:"note"`
	OccurredOn     string `json:"occurred_on"`
	IdempotencyKey string `json:"idempotency_key"`
}

var stockAddReasons = map[string]bool{"restock": true, "found": true, "correction": true}
var stockRemoveReasons = map[string]bool{"damage": true, "lost": true, "expired": true, "internal_use": true, "correction": true, "other": true}

func (s *Service) ChangeProductStock(ctx context.Context, workspaceID, userID, productID int64, in ProductStockChangeInput) (StockAdjustmentView, error) {
	product, err := s.queries.GetProductByID(ctx, db.GetProductByIDParams{WorkspaceID: workspaceID, ID: productID})
	if errors.Is(err, pgx.ErrNoRows) {
		return StockAdjustmentView{}, ErrProductNotFound
	}
	if err != nil {
		return StockAdjustmentView{}, err
	}
	if product.Kind != "stock_tracked" {
		return StockAdjustmentView{}, errors.New("this product does not count stock. Change its type to “Product with stock” first")
	}
	direction := strings.ToLower(strings.TrimSpace(in.Direction))
	reason := strings.ToLower(strings.TrimSpace(in.Reason))
	if reason == "opening_stock" {
		reason = "restock"
	}
	switch direction {
	case "add":
		if !stockAddReasons[reason] {
			return StockAdjustmentView{}, errors.New("choose why you are adding stock")
		}
	case "remove":
		if !stockRemoveReasons[reason] {
			return StockAdjustmentView{}, errors.New("choose why you are removing stock")
		}
	default:
		return StockAdjustmentView{}, errors.New("direction must be add or remove")
	}
	qty, _, err := parseRequestQuantity(in.Quantity)
	if err != nil || !qty.GreaterThan(decimal.Zero) {
		return StockAdjustmentView{}, errors.New("quantity must be a number above zero")
	}
	delta := qty
	if direction == "remove" {
		delta = qty.Neg()
	}
	var unitCost *string
	if cost := strings.TrimSpace(in.UnitCost); cost != "" && direction == "add" {
		unitCost = &cost
	} else if direction == "add" && reason == "restock" {
		return StockAdjustmentView{}, errors.New("enter what each one cost, so the stock can be valued")
	}
	location, err := inventoryLocationFor(ctx, s.queries, workspaceID, in.OutletID)
	if err != nil {
		return StockAdjustmentView{}, err
	}
	occurred := strings.TrimSpace(in.OccurredOn)
	if occurred == "" {
		occurred = time.Now().UTC().Format("2006-01-02")
	}
	return s.CreateStockAdjustment(ctx, workspaceID, userID, CreateStockAdjustmentInput{
		LocationID: location.ID, ReasonCode: reason, Notes: strings.TrimSpace(in.Note), OccurredOn: occurred,
		IdempotencyKey: in.IdempotencyKey,
		Lines:          []CreateAdjustmentLineInput{{ProductID: product.ID, VariantID: in.VariantID, QuantityDelta: delta.String(), UnitCost: unitCost}},
	})
}

func (h *Handler) productStockMovements(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	before, _ := strconv.ParseInt(c.Query("before_id"), 10, 64)
	limit, _ := strconv.ParseInt(c.Query("limit"), 10, 32)
	movements, err := h.service.ListProductStockMovements(c.Request.Context(), wsCtx.WorkspaceID, id, before, int32(limit))
	if err != nil {
		productError(c, err, "STOCK_HISTORY_FAILED")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"movements": movements}})
}

func (h *Handler) changeProductStock(c *gin.Context) {
	wsCtx, ok := businessWorkspace(c)
	if !ok {
		return
	}
	id, ok := productID(c)
	if !ok {
		return
	}
	var in ProductStockChangeInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_REQUEST", "message": err.Error()}})
		return
	}
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	result, err := h.service.ChangeProductStock(c.Request.Context(), wsCtx.WorkspaceID, wsCtx.UserID, id, in)
	if err != nil {
		productError(c, err, "STOCK_CHANGE_FAILED")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"adjustment": result}})
}
