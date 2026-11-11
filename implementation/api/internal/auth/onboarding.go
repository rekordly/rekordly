package auth

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
	"golang.org/x/text/currency"
)

var currencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)
var countryPattern = regexp.MustCompile(`^[A-Z]{2}$`)

var allowedOnboardingRoles = map[string]struct{}{
	"personal": {}, "freelancer": {}, "small_business": {}, "general_business": {},
}

type OnboardingPreferencesInput struct {
	FlowVersion   int32          `json:"flow_version"`
	SelectedRoles []string       `json:"selected_roles"`
	SpaceChoice   string         `json:"space_choice"`
	Preferences   map[string]any `json:"preferences"`
}

type WorkspaceSetup struct {
	Name         string `json:"name"`
	BaseCurrency string `json:"base_currency"`
	Timezone     string `json:"timezone"`
	BusinessType string `json:"business_type,omitempty"`
	Country      string `json:"country,omitempty"`
}

type CreateWorkspacesInput struct {
	SpaceChoice string          `json:"space_choice"`
	Personal    *WorkspaceSetup `json:"personal,omitempty"`
	Business    *WorkspaceSetup `json:"business,omitempty"`
}

type CreatedWorkspace struct {
	ID   int64  `json:"id"`
	Kind string `json:"kind"`
	Name string `json:"name"`
}

type CreateWorkspacesResult struct {
	Workspaces       []CreatedWorkspace `json:"workspaces"`
	RecommendedRoute string             `json:"recommended_route"`
}

func validatePreferences(input OnboardingPreferencesInput) error {
	if input.FlowVersion != 1 || !validSpaceChoice(input.SpaceChoice) || len(input.SelectedRoles) == 0 || len(input.SelectedRoles) > 4 {
		return ErrInvalidProof
	}
	seen := map[string]struct{}{}
	for _, role := range input.SelectedRoles {
		if _, ok := allowedOnboardingRoles[role]; !ok {
			return ErrInvalidProof
		}
		if _, duplicate := seen[role]; duplicate {
			return ErrInvalidProof
		}
		seen[role] = struct{}{}
	}
	encoded, err := json.Marshal(input.Preferences)
	if err != nil || len(encoded) > 8<<10 {
		return ErrInvalidProof
	}
	return nil
}

func validSpaceChoice(choice string) bool {
	return choice == "personal" || choice == "business" || choice == "all"
}

func (service *Service) SaveOnboardingPreferences(ctx context.Context, rawSession, csrfToken string, input OnboardingPreferencesInput) (OnboardingState, error) {
	if err := validatePreferences(input); err != nil {
		return OnboardingState{}, err
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return OnboardingState{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	session, err := service.authenticateFullSession(ctx, queries, rawSession)
	if err != nil {
		return OnboardingState{}, err
	}
	if err := verifyCSRF(session, csrfToken); err != nil {
		return OnboardingState{}, err
	}
	var onboardingStatus string
	if err := tx.QueryRow(ctx, `SELECT onboarding_status FROM users WHERE id = $1 FOR UPDATE`, session.UserID).Scan(&onboardingStatus); err != nil {
		return OnboardingState{}, ErrInvalidProof
	}
	if onboardingStatus == "core_complete" || onboardingStatus == "activated" {
		return OnboardingState{}, ErrOnboardingConflict
	}
	preferences, _ := json.Marshal(input.Preferences)
	step := "space_choice_saved"
	record, err := queries.UpsertOnboardingProgress(ctx, db.UpsertOnboardingProgressParams{
		UserID: session.UserID, FlowVersion: input.FlowVersion, CurrentStep: step, SelectedRoles: input.SelectedRoles,
		SelectedSpaceChoice: pgtype.Text{String: input.SpaceChoice, Valid: true}, Preferences: preferences,
	})
	if err != nil {
		return OnboardingState{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return OnboardingState{}, err
	}
	return OnboardingState{FlowVersion: record.FlowVersion, CurrentStep: record.CurrentStep, SelectedRoles: record.SelectedRoles, SpaceChoice: record.SelectedSpaceChoice.String, Preferences: input.Preferences}, nil
}

func validateWorkspaceSetup(setup *WorkspaceSetup, kind string) error {
	if setup == nil {
		return ErrInvalidProof
	}
	setup.Name = strings.TrimSpace(setup.Name)
	setup.BaseCurrency = strings.ToUpper(strings.TrimSpace(setup.BaseCurrency))
	setup.Timezone = strings.TrimSpace(setup.Timezone)
	setup.BusinessType = strings.TrimSpace(setup.BusinessType)
	setup.Country = strings.ToUpper(strings.TrimSpace(setup.Country))
	if len([]rune(setup.Name)) < 2 || len([]rune(setup.Name)) > 100 || !currencyPattern.MatchString(setup.BaseCurrency) {
		return ErrInvalidProof
	}
	if _, err := currency.ParseISO(setup.BaseCurrency); err != nil {
		return ErrInvalidProof
	}
	if _, err := time.LoadLocation(setup.Timezone); err != nil {
		return ErrInvalidProof
	}
	if kind == "business" && (len([]rune(setup.BusinessType)) < 2 || len([]rune(setup.BusinessType)) > 80 || !countryPattern.MatchString(setup.Country)) {
		return ErrInvalidProof
	}
	return nil
}

func validateWorkspaceInput(input *CreateWorkspacesInput) error {
	if !validSpaceChoice(input.SpaceChoice) {
		return ErrInvalidProof
	}
	if (input.SpaceChoice == "personal" || input.SpaceChoice == "all") && validateWorkspaceSetup(input.Personal, "personal") != nil {
		return ErrInvalidProof
	}
	if (input.SpaceChoice == "business" || input.SpaceChoice == "all") && validateWorkspaceSetup(input.Business, "business") != nil {
		return ErrInvalidProof
	}
	return nil
}

func (service *Service) CreateInitialWorkspaces(ctx context.Context, rawSession, csrfToken, idempotencyKey string, input CreateWorkspacesInput) (CreateWorkspacesResult, error) {
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	if len(idempotencyKey) < 8 || len(idempotencyKey) > 128 || validateWorkspaceInput(&input) != nil {
		return CreateWorkspacesResult{}, ErrInvalidProof
	}
	requestJSON, _ := json.Marshal(input)
	requestDigest := sha256.Sum256(requestJSON)
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return CreateWorkspacesResult{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	session, err := service.authenticateFullSession(ctx, queries, rawSession)
	if err != nil {
		return CreateWorkspacesResult{}, err
	}
	if err := verifyCSRF(session, csrfToken); err != nil {
		return CreateWorkspacesResult{}, err
	}
	var onboardingStatus string
	if err := tx.QueryRow(ctx, `SELECT onboarding_status FROM users WHERE id = $1 AND status = 'active' FOR UPDATE`, session.UserID).Scan(&onboardingStatus); err != nil {
		return CreateWorkspacesResult{}, ErrInvalidProof
	}
	keyDigest := digest(idempotencyKey)
	var existingRequest, existingResponse []byte
	var existingStatus string
	err = tx.QueryRow(ctx, `SELECT request_digest, status, response_body FROM idempotency_records WHERE actor_user_id = $1 AND operation = 'create_initial_workspaces' AND key_digest = $2 FOR UPDATE`, session.UserID, keyDigest).Scan(&existingRequest, &existingStatus, &existingResponse)
	if err == nil {
		if subtleDigestCompare(existingRequest, requestDigest[:]) == false {
			return CreateWorkspacesResult{}, ErrIdempotencyConflict
		}
		if existingStatus == "completed" {
			var result CreateWorkspacesResult
			if json.Unmarshal(existingResponse, &result) != nil {
				return CreateWorkspacesResult{}, ErrOnboardingConflict
			}
			return result, nil
		}
		return CreateWorkspacesResult{}, ErrOnboardingConflict
	}
	if err != pgx.ErrNoRows {
		return CreateWorkspacesResult{}, err
	}
	if onboardingStatus == "core_complete" || onboardingStatus == "activated" {
		return CreateWorkspacesResult{}, ErrOnboardingConflict
	}
	_, err = tx.Exec(ctx, `INSERT INTO idempotency_records (actor_user_id, operation, key_digest, request_digest, expires_at) VALUES ($1, 'create_initial_workspaces', $2, $3, now() + interval '24 hours')`, session.UserID, keyDigest, requestDigest[:])
	if err != nil {
		return CreateWorkspacesResult{}, err
	}
	result := CreateWorkspacesResult{Workspaces: []CreatedWorkspace{}, RecommendedRoute: "/dashboard"}
	if input.SpaceChoice == "personal" || input.SpaceChoice == "all" {
		workspace, err := ensureOwnedWorkspace(ctx, tx, session.UserID, "personal", *input.Personal)
		if err != nil {
			return CreateWorkspacesResult{}, err
		}
		result.Workspaces = append(result.Workspaces, workspace)
	}
	if input.SpaceChoice == "business" || input.SpaceChoice == "all" {
		workspace, err := ensureOwnedWorkspace(ctx, tx, session.UserID, "business", *input.Business)
		if err != nil {
			return CreateWorkspacesResult{}, err
		}
		result.Workspaces = append(result.Workspaces, workspace)
	}
	responseJSON, _ := json.Marshal(result)
	_, err = tx.Exec(ctx, `
		INSERT INTO onboarding_progress (user_id, flow_version, current_step, selected_space_choice, completed_at)
		VALUES ($1, 1, 'core_complete', $2, now())
		ON CONFLICT (user_id) DO UPDATE SET current_step = 'core_complete', selected_space_choice = EXCLUDED.selected_space_choice, completed_at = now(), updated_at = now()`, session.UserID, input.SpaceChoice)
	if err != nil {
		return CreateWorkspacesResult{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE users SET onboarding_status = 'core_complete', updated_at = now() WHERE id = $1`, session.UserID); err != nil {
		return CreateWorkspacesResult{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, metadata) VALUES ($1::bigint, 'onboarding_core_completed', 'user', $1::bigint::text, jsonb_build_object('space_choice', $2::text))`, session.UserID, input.SpaceChoice); err != nil {
		return CreateWorkspacesResult{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO outbox_jobs (job_type, aggregate_type, aggregate_id, payload) VALUES ('onboarding_welcome', 'user', $1::bigint::text, jsonb_build_object('user_id', $1::bigint, 'space_choice', $2::text))`, session.UserID, input.SpaceChoice); err != nil {
		return CreateWorkspacesResult{}, err
	}
	_, err = tx.Exec(ctx, `UPDATE idempotency_records SET status = 'completed', response_code = 200, response_body = $2, resource_type = 'onboarding', resource_id = $1::text, updated_at = now() WHERE actor_user_id = $1 AND operation = 'create_initial_workspaces' AND key_digest = $3`, session.UserID, responseJSON, keyDigest)
	if err != nil {
		return CreateWorkspacesResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return CreateWorkspacesResult{}, err
	}
	return result, nil
}

func ensureOwnedWorkspace(ctx context.Context, tx pgx.Tx, userID int64, kind string, setup WorkspaceSetup) (CreatedWorkspace, error) {
	var existing CreatedWorkspace
	err := tx.QueryRow(ctx, `SELECT id, kind, name FROM workspaces WHERE owner_user_id = $1 AND kind = $2 AND status = 'active' ORDER BY id LIMIT 1`, userID, kind).Scan(&existing.ID, &existing.Kind, &existing.Name)
	if err == nil {
		return existing, nil
	}
	if err != pgx.ErrNoRows {
		return CreatedWorkspace{}, err
	}
	slug := fmt.Sprintf("%s-%s-%d", slugify(setup.Name), kind, userID)
	var workspaceID int64
	if err := tx.QueryRow(ctx, `INSERT INTO workspaces (kind, name, slug, base_currency, timezone, owner_user_id, business_type, country_code) VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), NULLIF($8, '')) RETURNING id`, kind, setup.Name, slug, setup.BaseCurrency, setup.Timezone, userID, setup.BusinessType, setup.Country).Scan(&workspaceID); err != nil {
		return CreatedWorkspace{}, err
	}
	var ownerRoleID int64
	if err := tx.QueryRow(ctx, `INSERT INTO roles (workspace_id, code, name) VALUES ($1, 'owner', 'Owner') RETURNING id`, workspaceID).Scan(&ownerRoleID); err != nil {
		return CreatedWorkspace{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, '*') ON CONFLICT DO NOTHING`, ownerRoleID); err != nil {
		return CreatedWorkspace{}, err
	}
	// Seed prebuilt Blueprint 02 role templates for the workspace
	for code, def := range RoleTemplateDefinitions() {
		if code == "owner" {
			continue
		}
		var rID int64
		if err := tx.QueryRow(ctx, `INSERT INTO roles (workspace_id, code, name) VALUES ($1, $2, $3) ON CONFLICT (workspace_id, code) WHERE NOT is_system DO UPDATE SET name = EXCLUDED.name RETURNING id`, workspaceID, code, def.Name).Scan(&rID); err != nil {
			return CreatedWorkspace{}, err
		}
		for _, pCode := range def.Permissions {
			if _, err := tx.Exec(ctx, `INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`, rID, pCode); err != nil {
				return CreatedWorkspace{}, err
			}
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO memberships (workspace_id, user_id, role_id, is_owner) VALUES ($1, $2, $3, true)`, workspaceID, userID, ownerRoleID); err != nil {
		return CreatedWorkspace{}, err
	}
	return CreatedWorkspace{ID: workspaceID, Kind: kind, Name: setup.Name}, nil
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var builder strings.Builder
	dash := false
	for _, char := range value {
		if char >= 'a' && char <= 'z' || char >= '0' && char <= '9' {
			builder.WriteRune(char)
			dash = false
		} else if builder.Len() > 0 && !dash {
			builder.WriteByte('-')
			dash = true
		}
	}
	result := strings.Trim(builder.String(), "-")
	if result == "" {
		return "workspace"
	}
	if len(result) > 50 {
		result = strings.Trim(result[:50], "-")
	}
	return result
}

func subtleDigestCompare(left, right []byte) bool {
	if len(left) != len(right) {
		return false
	}
	var difference byte
	for index := range left {
		difference |= left[index] ^ right[index]
	}
	return difference == 0
}
