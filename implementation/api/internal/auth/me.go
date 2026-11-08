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
		SELECT w.id, w.kind, w.name, w.slug, w.base_currency, w.timezone, m.is_owner, r.code, r.name, m.outlet_scope
		FROM memberships m
		JOIN workspaces w ON w.id = m.workspace_id AND w.status = 'active'
		JOIN roles r ON r.id = m.role_id
		WHERE m.user_id = $1 AND m.status = 'active'
		ORDER BY m.is_owner DESC, w.kind, w.id`, user.ID)
	if err != nil {
		return CurrentUser{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var workspace AuthorizedWorkspace
		var outlet []byte
		if err := rows.Scan(&workspace.ID, &workspace.Kind, &workspace.Name, &workspace.Slug, &workspace.BaseCurrency, &workspace.Timezone, &workspace.IsOwner, &workspace.RoleCode, &workspace.RoleName, &outlet); err != nil {
			return CurrentUser{}, err
		}
		workspace.OutletScope = map[string]any{}
		_ = json.Unmarshal(outlet, &workspace.OutletScope)
		result.Workspaces = append(result.Workspaces, workspace)
	}
	return result, rows.Err()
}
