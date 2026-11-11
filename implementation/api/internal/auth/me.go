package auth

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rekordly/rekordly-api/internal/db"
)

type CurrentUser struct {
	ID               int64                 `json:"id"`
	DisplayName      string                `json:"display_name,omitempty"`
	Locale           string                `json:"locale"`
	Timezone         string                `json:"timezone"`
	OnboardingStatus string                `json:"onboarding_status"`
	Session          CurrentSession        `json:"session"`
	Onboarding       OnboardingState       `json:"onboarding"`
	Workspaces       []AuthorizedWorkspace `json:"workspaces"`
	// CSRFToken is set only on the GET /me response, for the web app to send back.
	CSRFToken string `json:"csrf_token,omitempty"`
}

type CurrentSession struct {
	ID          int64     `json:"id"`
	Kind        string    `json:"kind"`
	DeviceLabel string    `json:"device_label,omitempty"`
	IssuedAt    time.Time `json:"issued_at"`
	ExpiresAt   time.Time `json:"expires_at"`
}

type OnboardingState struct {
	FlowVersion   int32          `json:"flow_version"`
	CurrentStep   string         `json:"current_step"`
	SelectedRoles []string       `json:"selected_roles"`
	SpaceChoice   string         `json:"space_choice,omitempty"`
	Preferences   map[string]any `json:"preferences"`
	Completed     bool           `json:"completed"`
}

type AuthorizedWorkspace struct {
	ID           int64          `json:"id"`
	Kind         string         `json:"kind"`
	Name         string         `json:"name"`
	Slug         string         `json:"slug"`
	BaseCurrency string         `json:"base_currency"`
	Timezone     string         `json:"timezone"`
	IsOwner      bool           `json:"is_owner"`
	RoleCode     string         `json:"role_code"`
	RoleName     string         `json:"role_name"`
	OutletScope  map[string]any `json:"outlet_scope"`
	Permissions  []string       `json:"permissions"`
}

func (service *Service) CurrentUser(ctx context.Context, rawSession string) (CurrentUser, error) {
	queries := db.New(service.pool)
	session, err := service.authenticateFullSession(ctx, queries, rawSession)
	if err != nil {
		return CurrentUser{}, err
	}
	user, err := queries.GetUserByID(ctx, session.UserID)
	if err != nil {
		return CurrentUser{}, ErrInvalidProof
	}
	result := CurrentUser{
		ID: user.ID, DisplayName: user.DisplayName.String, Locale: user.Locale, Timezone: user.Timezone, OnboardingStatus: user.OnboardingStatus,
		Session:    CurrentSession{ID: session.ID, Kind: session.SessionKind, DeviceLabel: session.DeviceLabel.String, IssuedAt: session.IssuedAt.Time, ExpiresAt: session.ExpiresAt.Time},
		Onboarding: OnboardingState{FlowVersion: 1, CurrentStep: "identity_verified", SelectedRoles: []string{}, Preferences: map[string]any{}},
		Workspaces: []AuthorizedWorkspace{},
	}
	var roles []string
	var choice *string
	var preferences []byte
	var completedAt *time.Time
	err = service.pool.QueryRow(ctx, `SELECT flow_version, current_step, selected_roles, selected_space_choice, preferences, completed_at FROM onboarding_progress WHERE user_id = $1`, user.ID).
		Scan(&result.Onboarding.FlowVersion, &result.Onboarding.CurrentStep, &roles, &choice, &preferences, &completedAt)
	if err == nil {
		result.Onboarding.SelectedRoles = roles
		if choice != nil {
			result.Onboarding.SpaceChoice = *choice
		}
		_ = json.Unmarshal(preferences, &result.Onboarding.Preferences)
		result.Onboarding.Completed = completedAt != nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return CurrentUser{}, err
	}
	rows, err := service.pool.Query(ctx, `
		SELECT w.id, w.kind, w.name, w.slug, w.base_currency, w.timezone, m.is_owner, m.role_id, r.code, r.name, m.outlet_scope
		FROM memberships m
		JOIN workspaces w ON w.id = m.workspace_id AND w.status = 'active'
		JOIN roles r ON r.id = m.role_id
		WHERE m.user_id = $1 AND m.status = 'active'
		ORDER BY m.is_owner DESC, w.kind, w.id`, user.ID)
	if err != nil {
		return CurrentUser{}, err
	}
	type wsWithRole struct {
		ws     AuthorizedWorkspace
		roleID int64
	}
	var loaded []wsWithRole
	for rows.Next() {
		var item wsWithRole
		var outlet []byte
		if err := rows.Scan(&item.ws.ID, &item.ws.Kind, &item.ws.Name, &item.ws.Slug, &item.ws.BaseCurrency, &item.ws.Timezone, &item.ws.IsOwner, &item.roleID, &item.ws.RoleCode, &item.ws.RoleName, &outlet); err != nil {
			rows.Close()
			return CurrentUser{}, err
		}
		item.ws.OutletScope = map[string]any{}
		_ = json.Unmarshal(outlet, &item.ws.OutletScope)
		loaded = append(loaded, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return CurrentUser{}, err
	}
	rows.Close()

	for _, item := range loaded {
		ws := item.ws
		if ws.IsOwner || ws.RoleCode == "owner" {
			ws.Permissions = []string{"*"}
		} else {
			perms, pErr := queries.ListRolePermissions(ctx, item.roleID)
			if pErr == nil && len(perms) > 0 {
				ws.Permissions = perms
			} else {
				ws.Permissions = defaultPermissionsForRoleCode(ws.RoleCode)
			}
		}
		result.Workspaces = append(result.Workspaces, ws)
	}
	return result, nil
}

func RoleTemplateDefinitions() map[string]struct {
	Name        string
	Permissions []string
} {
	return map[string]struct {
		Name        string
		Permissions []string
	}{
		"owner": {
			Name:        "Owner",
			Permissions: []string{"*"},
		},
		"admin": {
			Name:        "Admin",
			Permissions: []string{"money.view", "money.create", "money.void", "sales.view", "sales.create", "purchases.view", "purchases.create", "purchases.request", "purchases.approve_request", "purchases.create_po", "purchases.approve_po", "purchases.issue_po", "purchases.receive", "purchases.receive_unplanned", "purchases.create_bill", "purchases.approve_bill", "purchases.accept_variance", "purchases.pay_supplier", "purchases.manage_advance", "purchases.return", "purchases.close_po", "storefront.view", "storefront.manage_appearance", "storefront.manage_catalogue", "storefront.manage_checkout", "storefront.publish", "storefront.manage_domain", "orders.view", "orders.review", "orders.confirm", "orders.fulfil", "orders.cancel", "orders.export", "invoices.view", "invoices.create", "reconcile.manage", "contacts.view", "contacts.manage", "inventory.view_quantity", "reports.view_basic", "reports.tax", "settings.manage"},
		},
		"accountant": {
			Name:        "Accountant / Bookkeeper",
			Permissions: []string{"money.view", "money.create", "money.void", "sales.view", "purchases.view", "purchases.create_bill", "purchases.approve_bill", "purchases.accept_variance", "purchases.pay_supplier", "purchases.manage_advance", "purchases.return", "storefront.view", "orders.view", "orders.export", "invoices.view", "invoices.create", "reconcile.manage", "contacts.view", "contacts.manage", "reports.view_basic", "reports.tax"},
		},
		"sales": {
			Name:        "Sales",
			Permissions: []string{"sales.view", "sales.create", "storefront.view", "orders.view", "orders.review", "orders.confirm", "orders.fulfil", "orders.cancel", "invoices.view", "invoices.create", "contacts.view", "contacts.manage", "inventory.view_quantity"},
		},
		"cashier": {
			Name:        "Cashier",
			Permissions: []string{"money.view", "money.create", "sales.view", "sales.create", "invoices.view", "contacts.view"},
		},
		"inventory_manager": {
			Name:        "Inventory Manager",
			Permissions: []string{"inventory.view_quantity", "purchases.view", "purchases.request", "purchases.receive", "purchases.receive_unplanned", "purchases.return", "orders.view", "orders.fulfil", "orders.cancel", "sales.view", "contacts.view"},
		},
		"procurement": {
			Name:        "Procurement",
			Permissions: []string{"purchases.view", "purchases.create", "purchases.request", "purchases.approve_request", "purchases.create_po", "purchases.issue_po", "purchases.receive", "purchases.receive_unplanned", "purchases.create_bill", "purchases.return", "purchases.close_po", "contacts.view", "contacts.manage", "inventory.view_quantity"},
		},
		"viewer": {
			Name:        "Viewer / Auditor",
			Permissions: []string{"money.view", "sales.view", "purchases.view", "storefront.view", "orders.view", "invoices.view", "contacts.view", "inventory.view_quantity", "reports.view_basic"},
		},
	}
}

func defaultPermissionsForRoleCode(code string) []string {
	if def, ok := RoleTemplateDefinitions()[code]; ok {
		return def.Permissions
	}
	return []string{"money.view", "money.create", "sales.view", "sales.create", "purchases.view", "invoices.view", "invoices.create", "contacts.view", "inventory.view_quantity", "reports.view_basic"}
}
