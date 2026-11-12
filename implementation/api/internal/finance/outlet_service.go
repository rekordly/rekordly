package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrOutletCodeConflict                = errors.New("an outlet with this code already exists in this workspace")
	ErrOutletNameConflict                = errors.New("an outlet with this name already exists in this workspace")
	ErrCannotDeactivateDefaultLocation   = errors.New("cannot deactivate the default location; set another default location first")
	ErrCannotDeactivateLocationWithStock = errors.New("cannot deactivate location with active stock on hand")
)

type CreateOutletInput struct {
	Name         string `json:"name" binding:"required"`
	LocationType string `json:"location_type"` // outlet, warehouse, store, other
	Code         string `json:"code"`
	Address      string `json:"address"`
	Phone        string `json:"phone"`
	IsDefault    bool   `json:"is_default"`
}

type UpdateOutletInput struct {
	Name         *string `json:"name"`
	LocationType *string `json:"location_type"`
	Code         *string `json:"code"`
	Address      *string `json:"address"`
	Phone        *string `json:"phone"`
	IsDefault    *bool   `json:"is_default"`
	IsActive     *bool   `json:"is_active"`
}

type OutletView struct {
	ID           int64   `json:"id"`
	WorkspaceID  int64   `json:"workspace_id"`
	Name         string  `json:"name"`
	LocationType string  `json:"location_type"`
	Code         *string `json:"code,omitempty"`
	Address      *string `json:"address,omitempty"`
	Phone        *string `json:"phone,omitempty"`
	IsDefault    bool    `json:"is_default"`
	IsActive     bool    `json:"is_active"`
}

func outletViewFromDB(l db.InventoryLocation) OutletView {
	var code, address, phone *string
	if l.Code.Valid && l.Code.String != "" {
		c := l.Code.String
		code = &c
	}
	if l.Address.Valid && l.Address.String != "" {
		a := l.Address.String
		address = &a
	}
	if l.Phone.Valid && l.Phone.String != "" {
		p := l.Phone.String
		phone = &p
	}
	return OutletView{
		ID:           l.ID,
		WorkspaceID:  l.WorkspaceID,
		Name:         l.Name,
		LocationType: l.LocationType,
		Code:         code,
		Address:      address,
		Phone:        phone,
		IsDefault:    l.IsDefault,
		IsActive:     l.IsActive,
	}
}

func (s *Service) CreateOutlet(ctx context.Context, workspaceID, userID int64, in CreateOutletInput) (OutletView, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" || len(name) > 200 {
		return OutletView{}, errors.New("outlet name must be between 1 and 200 characters")
	}

	locType := strings.ToLower(strings.TrimSpace(in.LocationType))
	if locType == "" {
		locType = "outlet"
	}
	switch locType {
	case "outlet", "warehouse", "store", "other":
	default:
		return OutletView{}, fmt.Errorf("invalid location type: %s", locType)
	}

	codeStr := strings.TrimSpace(in.Code)
	var codeParam pgtype.Text
	if codeStr != "" {
		if len(codeStr) > 50 {
			return OutletView{}, errors.New("outlet code must be at most 50 characters")
		}
		// Check uniqueness of code
		if _, err := s.queries.GetInventoryLocationByCode(ctx, db.GetInventoryLocationByCodeParams{
			WorkspaceID: workspaceID,
			Lower:       codeStr,
		}); err == nil {
			return OutletView{}, ErrOutletCodeConflict
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return OutletView{}, err
		}
		codeParam = pgtype.Text{String: codeStr, Valid: true}
	}

	var addressParam, phoneParam pgtype.Text
	if addr := strings.TrimSpace(in.Address); addr != "" {
		addressParam = pgtype.Text{String: addr, Valid: true}
	}
	if phone := strings.TrimSpace(in.Phone); phone != "" {
		phoneParam = pgtype.Text{String: phone, Valid: true}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return OutletView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	isDefault := in.IsDefault
	// If this is the very first location in the workspace, it must be default
	existing, err := qtx.ListInventoryLocations(ctx, db.ListInventoryLocationsParams{
		WorkspaceID: workspaceID,
		IsActive:    pgtype.Bool{Valid: false},
	})
	if err != nil {
		return OutletView{}, err
	}
	if len(existing) == 0 {
		isDefault = true
	} else if isDefault {
		if err := qtx.ClearDefaultInventoryLocation(ctx, workspaceID); err != nil {
			return OutletView{}, err
		}
	}

	loc, err := qtx.CreateInventoryLocation(ctx, db.CreateInventoryLocationParams{
		WorkspaceID:  workspaceID,
		Name:         name,
		LocationType: locType,
		Code:         codeParam,
		Address:      addressParam,
		Phone:        phoneParam,
		IsDefault:    isDefault,
		IsActive:     true,
	})
	if err != nil {
		if strings.Contains(err.Error(), "inventory_locations_workspace_name_uidx") {
			return OutletView{}, ErrOutletNameConflict
		}
		if strings.Contains(err.Error(), "inventory_locations_workspace_code_uidx") {
			return OutletView{}, ErrOutletCodeConflict
		}
		return OutletView{}, fmt.Errorf("create inventory location: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return OutletView{}, err
	}

	return outletViewFromDB(loc), nil
}

func (s *Service) ListOutlets(ctx context.Context, workspaceID int64, activeOnly bool) ([]OutletView, error) {
	var activeParam pgtype.Bool
	if activeOnly {
		activeParam = pgtype.Bool{Bool: true, Valid: true}
	}
	locs, err := s.queries.ListInventoryLocations(ctx, db.ListInventoryLocationsParams{
		WorkspaceID: workspaceID,
		IsActive:    activeParam,
	})
	if err != nil {
		return nil, err
	}
	out := make([]OutletView, 0, len(locs))
	for _, l := range locs {
		out = append(out, outletViewFromDB(l))
	}
	return out, nil
}

func (s *Service) GetOutlet(ctx context.Context, workspaceID, outletID int64) (OutletView, error) {
	loc, err := s.queries.GetInventoryLocationByID(ctx, db.GetInventoryLocationByIDParams{
		WorkspaceID: workspaceID,
		ID:          outletID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return OutletView{}, ErrNotFound
	}
	if err != nil {
		return OutletView{}, err
	}
	return outletViewFromDB(loc), nil
}

func (s *Service) UpdateOutlet(ctx context.Context, workspaceID, outletID int64, in UpdateOutletInput) (OutletView, error) {
	orig, err := s.queries.GetInventoryLocationByID(ctx, db.GetInventoryLocationByIDParams{
		WorkspaceID: workspaceID,
		ID:          outletID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return OutletView{}, ErrNotFound
	}
	if err != nil {
		return OutletView{}, err
	}

	name := orig.Name
	if in.Name != nil {
		n := strings.TrimSpace(*in.Name)
		if n == "" || len(n) > 200 {
			return OutletView{}, errors.New("outlet name must be between 1 and 200 characters")
		}
		name = n
	}

	locType := orig.LocationType
	if in.LocationType != nil {
		lt := strings.ToLower(strings.TrimSpace(*in.LocationType))
		switch lt {
		case "outlet", "warehouse", "store", "other":
			locType = lt
		default:
			return OutletView{}, fmt.Errorf("invalid location type: %s", lt)
		}
	}

	codeParam := orig.Code
	if in.Code != nil {
		c := strings.TrimSpace(*in.Code)
		if c != "" {
			if len(c) > 50 {
				return OutletView{}, errors.New("outlet code must be at most 50 characters")
			}
			existing, err := s.queries.GetInventoryLocationByCode(ctx, db.GetInventoryLocationByCodeParams{
				WorkspaceID: workspaceID,
				Lower:       c,
			})
			if err == nil && existing.ID != outletID {
				return OutletView{}, ErrOutletCodeConflict
			}
			codeParam = pgtype.Text{String: c, Valid: true}
		} else {
			codeParam = pgtype.Text{Valid: false}
		}
	}

	addressParam := orig.Address
	if in.Address != nil {
		addr := strings.TrimSpace(*in.Address)
		if addr != "" {
			addressParam = pgtype.Text{String: addr, Valid: true}
		} else {
			addressParam = pgtype.Text{Valid: false}
		}
	}

	phoneParam := orig.Phone
	if in.Phone != nil {
		ph := strings.TrimSpace(*in.Phone)
		if ph != "" {
			phoneParam = pgtype.Text{String: ph, Valid: true}
		} else {
			phoneParam = pgtype.Text{Valid: false}
		}
	}

	isActive := orig.IsActive
	if in.IsActive != nil {
		isActive = *in.IsActive
		if !isActive && orig.IsDefault {
			return OutletView{}, ErrCannotDeactivateDefaultLocation
		}
		if !isActive {
			// Check if any stock exists on hand
			var stockCount int64
			err := s.pool.QueryRow(ctx, `SELECT count(*) FROM inventory_balances WHERE workspace_id = $1 AND location_id = $2 AND quantity_on_hand > 0`, workspaceID, outletID).Scan(&stockCount)
			if err == nil && stockCount > 0 {
				return OutletView{}, ErrCannotDeactivateLocationWithStock
			}
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return OutletView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	if in.IsDefault != nil && *in.IsDefault && !orig.IsDefault {
		if !isActive {
			return OutletView{}, errors.New("cannot set an inactive outlet as default")
		}
		if err := qtx.ClearDefaultInventoryLocation(ctx, workspaceID); err != nil {
			return OutletView{}, err
		}
		if _, err := qtx.SetDefaultInventoryLocation(ctx, db.SetDefaultInventoryLocationParams{
			WorkspaceID: workspaceID,
			ID:          outletID,
		}); err != nil {
			return OutletView{}, err
		}
	}

	updated, err := qtx.UpdateInventoryLocation(ctx, db.UpdateInventoryLocationParams{
		WorkspaceID:  workspaceID,
		ID:           outletID,
		Name:         name,
		LocationType: locType,
		Code:         codeParam,
		Address:      addressParam,
		Phone:        phoneParam,
		IsActive:     isActive,
	})
	if err != nil {
		if strings.Contains(err.Error(), "inventory_locations_workspace_name_uidx") {
			return OutletView{}, ErrOutletNameConflict
		}
		if strings.Contains(err.Error(), "inventory_locations_workspace_code_uidx") {
			return OutletView{}, ErrOutletCodeConflict
		}
		return OutletView{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return OutletView{}, err
	}

	return outletViewFromDB(updated), nil
}
