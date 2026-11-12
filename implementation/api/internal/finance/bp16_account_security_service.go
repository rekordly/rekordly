package finance

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

// Stable Blueprint 16 error codes.
var (
	ErrRecentAuthRequired          = errors.New("RECENT_AUTH_REQUIRED")
	ErrContactAlreadyInUse         = errors.New("CONTACT_ALREADY_IN_USE")
	ErrContactVerificationRequired = errors.New("CONTACT_VERIFICATION_REQUIRED")
	ErrLastLoginMethod             = errors.New("LAST_LOGIN_METHOD")
	ErrSessionAlreadyRevoked       = errors.New("SESSION_ALREADY_REVOKED")
	ErrSettingsVersionConflict     = errors.New("SETTINGS_VERSION_CONFLICT")
	ErrSettingLockedAfterPosting   = errors.New("SETTING_LOCKED_AFTER_POSTING")
	ErrLastOwnerRequired           = errors.New("LAST_OWNER_REQUIRED")
	ErrOwnershipTransferPending    = errors.New("OWNERSHIP_TRANSFER_PENDING")
	ErrInvitationExpired           = errors.New("INVITATION_EXPIRED")
	ErrExportNotReady              = errors.New("EXPORT_NOT_READY")
	ErrExportReconciliationFailed  = errors.New("EXPORT_RECONCILIATION_FAILED")
	ErrDeletionDependencyUnres     = errors.New("DELETION_DEPENDENCY_UNRESOLVED")
	ErrDeletionAlreadyRequested    = errors.New("DELETION_ALREADY_REQUESTED")
	ErrDeletionGraceExpired        = errors.New("DELETION_GRACE_EXPIRED")
	ErrDeletionPurgeStarted        = errors.New("DELETION_PURGE_STARTED")
	ErrRetentionHoldActive         = errors.New("RETENTION_HOLD_ACTIVE")
	ErrSupportVerificationRequired = errors.New("SUPPORT_VERIFICATION_REQUIRED")
	ErrSupportAccessExpired        = errors.New("SUPPORT_ACCESS_EXPIRED")
)

func hashSecretString(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func maskContactValue(methodType, normalized string) string {
	if methodType == "email" {
		parts := strings.SplitN(normalized, "@", 2)
		if len(parts) != 2 || len(parts[0]) == 0 {
			return "***"
		}
		local := parts[0]
		if len(local) <= 2 {
			return local[:1] + "***@" + parts[1]
		}
		return local[:2] + "***@" + parts[1]
	}
	if len(normalized) <= 4 {
		return "****"
	}
	return strings.Repeat("*", len(normalized)-4) + normalized[len(normalized)-4:]
}

func generateSixDigitOTP() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// --- Recent Auth ---

func (s *Service) GrantRecentAuth(ctx context.Context, userID int64, sessionID *int64, purpose, strength string, ttl time.Duration) (db.RecentAuthGrant, error) {
	if strings.TrimSpace(purpose) == "" {
		return db.RecentAuthGrant{}, fmt.Errorf("purpose is required")
	}
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	if strings.TrimSpace(strength) == "" {
		strength = "otp"
	}
	var sess pgtype.Int8
	if sessionID != nil && *sessionID > 0 {
		sess = pgtype.Int8{Int64: *sessionID, Valid: true}
	}
	return s.queries.InsertRecentAuthGrant(ctx, db.InsertRecentAuthGrantParams{
		UserID:    userID,
		SessionID: sess,
		Purpose:   strings.TrimSpace(purpose),
		Strength:  strength,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().UTC().Add(ttl), Valid: true},
	})
}

func (s *Service) RequireRecentAuth(ctx context.Context, userID int64, purpose string) error {
	_, err := s.queries.GetValidRecentAuthGrant(ctx, db.GetValidRecentAuthGrantParams{
		UserID:  userID,
		Purpose: strings.TrimSpace(purpose),
	})
	if err != nil {
		return ErrRecentAuthRequired
	}
	return nil
}

// --- Security Events ---

func (s *Service) RecordSecurityEvent(ctx context.Context, userID int64, sessionID *int64, eventType, actorType, deviceSummary string, safeCtx map[string]any) {
	var sess pgtype.Int8
	if sessionID != nil && *sessionID > 0 {
		sess = pgtype.Int8{Int64: *sessionID, Valid: true}
	}
	ctxBytes, _ := json.Marshal(safeCtx)
	if len(ctxBytes) == 0 {
		ctxBytes = []byte("{}")
	}
	_, _ = s.queries.InsertSecurityEvent(ctx, db.InsertSecurityEventParams{
		UserID:          userID,
		SessionID:       sess,
		EventType:       eventType,
		ActorType:       actorType,
		DeviceSummary:   deviceSummary,
		SafeContextJson: ctxBytes,
	})
}

func (s *Service) ListSecurityEvents(ctx context.Context, userID int64, limit int32) ([]db.SecurityEvent, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	return s.queries.ListSecurityEvents(ctx, db.ListSecurityEventsParams{
		UserID: userID,
		Limit:  limit,
	})
}

// --- Profile ---

type UpdateProfileInput struct {
	ExpectedVersion     int64   `json:"expected_version"`
	DisplayName         *string `json:"display_name"`
	Locale              *string `json:"locale"`
	Timezone            *string `json:"timezone"`
	DateFormat          *string `json:"date_format"`
	TimeFormat          *string `json:"time_format"`
	Theme               *string `json:"theme"`
	Density             *string `json:"density"`
	ReducedMotion       *bool   `json:"reduced_motion"`
	HighContrast        *bool   `json:"high_contrast"`
	DefaultLandingPage  *string `json:"default_landing_page"`
	CurrencyDisplayMode *string `json:"currency_display_mode"`
	OccupationLabel     *string `json:"occupation_label"`
}

func (s *Service) GetMeProfile(ctx context.Context, userID int64) (db.UserProfile, error) {
	return s.queries.GetOrCreateUserProfile(ctx, userID)
}

func (s *Service) UpdateMeProfile(ctx context.Context, userID int64, in UpdateProfileInput) (db.UserProfile, error) {
	cur, err := s.queries.GetOrCreateUserProfile(ctx, userID)
	if err != nil {
		return db.UserProfile{}, err
	}
	if in.ExpectedVersion <= 0 {
		return db.UserProfile{}, fmt.Errorf("expected_version is required")
	}
	if cur.Version != in.ExpectedVersion {
		return cur, ErrSettingsVersionConflict
	}

	pickStr := func(p *string, def string) string {
		if p == nil {
			return def
		}
		return strings.TrimSpace(*p)
	}
	pickBool := func(p *bool, def bool) bool {
		if p == nil {
			return def
		}
		return *p
	}

	updated, err := s.queries.UpdateUserProfileVersioned(ctx, db.UpdateUserProfileVersionedParams{
		UserID:              userID,
		Version:             in.ExpectedVersion,
		DisplayName:         pickStr(in.DisplayName, cur.DisplayName),
		Locale:              pickStr(in.Locale, cur.Locale),
		Timezone:            pickStr(in.Timezone, cur.Timezone),
		DateFormat:          pickStr(in.DateFormat, cur.DateFormat),
		TimeFormat:          pickStr(in.TimeFormat, cur.TimeFormat),
		Theme:               pickStr(in.Theme, cur.Theme),
		Density:             pickStr(in.Density, cur.Density),
		ReducedMotion:       pickBool(in.ReducedMotion, cur.ReducedMotion),
		HighContrast:        pickBool(in.HighContrast, cur.HighContrast),
		DefaultLandingPage:  pickStr(in.DefaultLandingPage, cur.DefaultLandingPage),
		CurrencyDisplayMode: pickStr(in.CurrencyDisplayMode, cur.CurrencyDisplayMode),
		OccupationLabel:     pickStr(in.OccupationLabel, cur.OccupationLabel),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return cur, ErrSettingsVersionConflict
	}
	if err != nil {
		return db.UserProfile{}, err
	}
	s.RecordSecurityEvent(ctx, userID, nil, "profile_updated", "user", "", map[string]any{"version": updated.Version})
	return updated, nil
}

// --- Verified Contact Methods ---

type AddContactMethodInput struct {
	MethodType string `json:"method_type"` // email | phone
	Value      string `json:"value"`
	IsLogin    bool   `json:"is_login"`
	IsRecovery bool   `json:"is_recovery"`
}

type AddContactMethodResult struct {
	ContactMethod db.ContactMethod `json:"contact_method"`
	ChallengeID   int64            `json:"challenge_id"`
	ExpiresAt     time.Time        `json:"expires_at"`
	// Returned only in non-production/test environments when mail/SMS adapter is local.
	DebugOTP string `json:"debug_otp,omitempty"`
}

func (s *Service) ListContactMethods(ctx context.Context, userID int64) ([]db.ContactMethod, error) {
	return s.queries.ListUserContactMethods(ctx, userID)
}

func (s *Service) AddContactMethod(ctx context.Context, userID int64, in AddContactMethodInput) (AddContactMethodResult, error) {
	if err := s.RequireRecentAuth(ctx, userID, "manage_contacts"); err != nil {
		return AddContactMethodResult{}, err
	}
	mType := strings.ToLower(strings.TrimSpace(in.MethodType))
	if mType != "email" && mType != "phone" {
		return AddContactMethodResult{}, fmt.Errorf("method_type must be email or phone")
	}
	norm := strings.ToLower(strings.TrimSpace(in.Value))
	if norm == "" {
		return AddContactMethodResult{}, fmt.Errorf("value is required")
	}

	// Check if already verified & active anywhere.
	var exists bool
	_ = s.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM contact_methods
			WHERE method_type = $1 AND normalized_value = $2 AND removed_at IS NULL AND verified_at IS NOT NULL
		)
	`, mType, norm).Scan(&exists)
	if exists {
		return AddContactMethodResult{}, ErrContactAlreadyInUse
	}

	cm, err := s.queries.CreateContactMethod(ctx, db.CreateContactMethodParams{
		UserID:          userID,
		MethodType:      mType,
		NormalizedValue: norm,
		MaskedValue:     maskContactValue(mType, norm),
		IsLogin:         in.IsLogin,
		IsRecovery:      in.IsRecovery,
	})
	if err != nil {
		return AddContactMethodResult{}, err
	}

	code, err := generateSixDigitOTP()
	if err != nil {
		return AddContactMethodResult{}, err
	}
	expiresAt := time.Now().UTC().Add(15 * time.Minute)
	ch, err := s.queries.CreateContactVerificationChallenge(ctx, db.CreateContactVerificationChallengeParams{
		UserID:                userID,
		ContactMethodID:       cm.ID,
		Purpose:               "verify_contact",
		DestinationNormalized: norm,
		CodeHash:              hashSecretString(code),
		ExpiresAt:             pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return AddContactMethodResult{}, err
	}

	s.RecordSecurityEvent(ctx, userID, nil, "contact_method_added_pending", "user", "", map[string]any{"method_type": mType, "masked": cm.MaskedValue})
	return AddContactMethodResult{
		ContactMethod: cm,
		ChallengeID:   ch.ID,
		ExpiresAt:     expiresAt,
		DebugOTP:      code,
	}, nil
}

func (s *Service) VerifyContactMethod(ctx context.Context, userID, contactID int64, code string) (db.ContactMethod, error) {
	ch, err := s.queries.GetLatestActiveContactChallenge(ctx, db.GetLatestActiveContactChallengeParams{
		ContactMethodID: contactID,
		UserID:          userID,
	})
	if err != nil {
		return db.ContactMethod{}, ErrContactVerificationRequired
	}
	if ch.ExpiresAt.Valid && ch.ExpiresAt.Time.Before(time.Now().UTC()) {
		return db.ContactMethod{}, ErrContactVerificationRequired
	}
	if ch.Attempts >= ch.MaxAttempts {
		return db.ContactMethod{}, ErrContactVerificationRequired
	}

	_ = s.queries.IncrementContactChallengeAttempts(ctx, ch.ID)
	if hashSecretString(strings.TrimSpace(code)) != ch.CodeHash {
		return db.ContactMethod{}, ErrContactVerificationRequired
	}
	_ = s.queries.ConsumeContactChallenge(ctx, ch.ID)

	cm, err := s.queries.MarkContactMethodVerified(ctx, db.MarkContactMethodVerifiedParams{
		ID:     contactID,
		UserID: userID,
	})
	if err != nil {
		return db.ContactMethod{}, ErrContactAlreadyInUse
	}
	s.RecordSecurityEvent(ctx, userID, nil, "contact_method_verified", "user", "", map[string]any{"contact_id": cm.ID, "masked": cm.MaskedValue})
	return cm, nil
}

func (s *Service) MakePrimaryContactMethod(ctx context.Context, userID, contactID int64) (db.ContactMethod, error) {
	if err := s.RequireRecentAuth(ctx, userID, "manage_contacts"); err != nil {
		return db.ContactMethod{}, err
	}
	cm, err := s.queries.GetUserContactMethodByID(ctx, db.GetUserContactMethodByIDParams{ID: contactID, UserID: userID})
	if err != nil {
		return db.ContactMethod{}, ErrNotFound
	}
	if !cm.VerifiedAt.Valid {
		return db.ContactMethod{}, ErrContactVerificationRequired
	}
	if err := s.queries.ClearPrimaryContactMethods(ctx, db.ClearPrimaryContactMethodsParams{
		UserID:     userID,
		MethodType: cm.MethodType,
	}); err != nil {
		return db.ContactMethod{}, err
	}
	updated, err := s.queries.SetPrimaryContactMethod(ctx, db.SetPrimaryContactMethodParams{
		ID:     contactID,
		UserID: userID,
	})
	if err != nil {
		return db.ContactMethod{}, err
	}
	s.RecordSecurityEvent(ctx, userID, nil, "contact_method_primary_changed", "user", "", map[string]any{"contact_id": updated.ID, "masked": updated.MaskedValue})
	return updated, nil
}

func (s *Service) RemoveContactMethod(ctx context.Context, userID, contactID int64) (db.ContactMethod, error) {
	if err := s.RequireRecentAuth(ctx, userID, "manage_contacts"); err != nil {
		return db.ContactMethod{}, err
	}
	methods, err := s.queries.ListUserContactMethods(ctx, userID)
	if err != nil {
		return db.ContactMethod{}, err
	}
	var target *db.ContactMethod
	verifiedLoginOrRecoveryCount := 0
	for i := range methods {
		m := &methods[i]
		if m.ID == contactID {
			target = m
		}
		if m.VerifiedAt.Valid && (m.IsLogin || m.IsRecovery) {
			verifiedLoginOrRecoveryCount++
		}
	}
	if target == nil {
		return db.ContactMethod{}, ErrNotFound
	}
	if target.VerifiedAt.Valid && (target.IsLogin || target.IsRecovery) && verifiedLoginOrRecoveryCount <= 1 {
		return db.ContactMethod{}, ErrLastLoginMethod
	}
	removed, err := s.queries.SoftRemoveContactMethod(ctx, db.SoftRemoveContactMethodParams{
		ID:     contactID,
		UserID: userID,
	})
	if err != nil {
		return db.ContactMethod{}, err
	}
	s.RecordSecurityEvent(ctx, userID, nil, "contact_method_removed", "user", "", map[string]any{"contact_id": removed.ID, "masked": removed.MaskedValue})
	return removed, nil
}

// --- Sessions Revocation ---

func (s *Service) RevokeUserSession(ctx context.Context, userID, targetSessionID int64) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE sessions
		SET revoked_at = now(), revocation_reason = 'user_revoked'
		WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
	`, targetSessionID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrSessionAlreadyRevoked
	}
	s.RecordSecurityEvent(ctx, userID, &targetSessionID, "session_revoked", "user", "", map[string]any{"revoked_session_id": targetSessionID})
	return nil
}

func (s *Service) RevokeOtherUserSessions(ctx context.Context, userID, currentSessionID int64) (int64, error) {
	if err := s.RequireRecentAuth(ctx, userID, "revoke_sessions"); err != nil {
		return 0, err
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE sessions
		SET revoked_at = now(), revocation_reason = 'user_revoked_others'
		WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL
	`, userID, currentSessionID)
	if err != nil {
		return 0, err
	}
	s.RecordSecurityEvent(ctx, userID, &currentSessionID, "other_sessions_revoked", "user", "", map[string]any{"revoked_count": tag.RowsAffected()})
	return tag.RowsAffected(), nil
}

// --- Versioned Scoped Workspace Settings ---

type ScopedSettingsResponse struct {
	WorkspaceID             int64           `json:"workspace_id"`
	WorkspaceKind           string          `json:"workspace_kind"`
	WorkspaceName           string          `json:"workspace_name"`
	BaseCurrency            string          `json:"base_currency"`
	ActorRole               string          `json:"actor_role"`
	Version                 int64           `json:"version"`
	AccountingLocked        bool            `json:"accounting_locked"`
	PersonalSettings        json.RawMessage `json:"personal_settings,omitempty"`
	BusinessSettings        json.RawMessage `json:"business_settings,omitempty"`
	LastSignificantChangeAt *time.Time      `json:"last_significant_change_at,omitempty"`
}

func (s *Service) GetScopedWorkspaceSettings(ctx context.Context, wsCtx WorkspaceContext, expectedKind string) (ScopedSettingsResponse, error) {
	if expectedKind != "" && wsCtx.Kind != expectedKind {
		return ScopedSettingsResponse{}, ErrNotFound
	}
	var name, baseCurrency string
	err := s.pool.QueryRow(ctx, `SELECT name, base_currency FROM workspaces WHERE id = $1`, wsCtx.WorkspaceID).Scan(&name, &baseCurrency)
	if err != nil {
		return ScopedSettingsResponse{}, err
	}
	sv, err := s.queries.GetOrCreateWorkspaceSettingsVersion(ctx, wsCtx.WorkspaceID)
	if err != nil {
		return ScopedSettingsResponse{}, err
	}
	var hasPosted bool
	_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM journal_entries WHERE workspace_id = $1 AND status = 'posted')`, wsCtx.WorkspaceID).Scan(&hasPosted)

	var lastChg *time.Time
	if sv.LastSignificantChangeAt.Valid {
		t := sv.LastSignificantChangeAt.Time
		lastChg = &t
	}

	resp := ScopedSettingsResponse{
		WorkspaceID:             wsCtx.WorkspaceID,
		WorkspaceKind:           wsCtx.Kind,
		WorkspaceName:           name,
		BaseCurrency:            baseCurrency,
		ActorRole:               wsCtx.RoleCode,
		Version:                 sv.Version,
		AccountingLocked:        hasPosted,
		LastSignificantChangeAt: lastChg,
	}
	if wsCtx.Kind == "personal" {
		resp.PersonalSettings = sv.PersonalSettingsJson
	} else {
		resp.BusinessSettings = sv.BusinessSettingsJson
	}
	return resp, nil
}

type UpdateScopedSettingsInput struct {
	ExpectedVersion int64          `json:"expected_version"`
	Changes         map[string]any `json:"changes"`
}

func (s *Service) UpdateScopedWorkspaceSettings(ctx context.Context, wsCtx WorkspaceContext, expectedKind, section string, in UpdateScopedSettingsInput) (ScopedSettingsResponse, error) {
	if expectedKind != "" && wsCtx.Kind != expectedKind {
		return ScopedSettingsResponse{}, ErrNotFound
	}
	if !wsCtx.HasPermission("settings.manage") && wsCtx.Kind == "business" {
		return ScopedSettingsResponse{}, fmt.Errorf("FORBIDDEN")
	}
	if in.ExpectedVersion <= 0 {
		return ScopedSettingsResponse{}, fmt.Errorf("expected_version is required")
	}

	cur, err := s.GetScopedWorkspaceSettings(ctx, wsCtx, expectedKind)
	if err != nil {
		return ScopedSettingsResponse{}, err
	}
	if cur.Version != in.ExpectedVersion {
		return cur, ErrSettingsVersionConflict
	}

	// Accounting-sensitive lock check after posted activity.
	if cur.AccountingLocked {
		for _, lockedKey := range []string{"base_currency", "currency", "costing_method", "accounting_start_date"} {
			if _, attempted := in.Changes[lockedKey]; attempted {
				return cur, ErrSettingLockedAfterPosting
			}
		}
	}

	persMap := map[string]any{}
	bizMap := map[string]any{}
	_ = json.Unmarshal(cur.PersonalSettings, &persMap)
	_ = json.Unmarshal(cur.BusinessSettings, &bizMap)

	if wsCtx.Kind == "personal" {
		for k, v := range in.Changes {
			persMap[k] = v
		}
	} else {
		target := bizMap
		if section != "" {
			secMap, ok := bizMap[section].(map[string]any)
			if !ok {
				secMap = map[string]any{}
			}
			for k, v := range in.Changes {
				secMap[k] = v
			}
			bizMap[section] = secMap
		} else {
			for k, v := range in.Changes {
				target[k] = v
			}
		}
	}

	persBytes, _ := json.Marshal(persMap)
	bizBytes, _ := json.Marshal(bizMap)
	updated, err := s.queries.UpdateWorkspaceSettingsVersioned(ctx, db.UpdateWorkspaceSettingsVersionedParams{
		WorkspaceID:          wsCtx.WorkspaceID,
		Version:              in.ExpectedVersion,
		PersonalSettingsJson: persBytes,
		BusinessSettingsJson: bizBytes,
		UpdatedByUserID:      pgtype.Int8{Int64: wsCtx.UserID, Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return cur, ErrSettingsVersionConflict
	}
	if err != nil {
		return ScopedSettingsResponse{}, err
	}

	cur.Version = updated.Version
	if wsCtx.Kind == "personal" {
		cur.PersonalSettings = updated.PersonalSettingsJson
	} else {
		cur.BusinessSettings = updated.BusinessSettingsJson
	}
	return cur, nil
}

// --- Business Membership & Ownership Transfer ---

func (s *Service) ChangeBusinessMemberAccess(ctx context.Context, wsCtx WorkspaceContext, memberUserID, roleID int64, outletIDs []int64, reason string) error {
	if wsCtx.Kind != "business" || (!wsCtx.IsOwner && !wsCtx.HasPermission("settings.manage")) {
		return fmt.Errorf("FORBIDDEN")
	}
	if memberUserID == wsCtx.UserID && wsCtx.IsOwner {
		return ErrLastOwnerRequired
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	outletJSON, _ := json.Marshal(map[string]any{"outlet_ids": outletIDs})
	tag, err := tx.Exec(ctx, `
		UPDATE memberships
		SET role_id = $3, outlet_scope = $4, updated_at = now()
		WHERE workspace_id = $1 AND user_id = $2 AND status <> 'removed'
	`, wsCtx.WorkspaceID, memberUserID, roleID, outletJSON)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	_, _ = tx.Exec(ctx, `
		INSERT INTO audit_events (workspace_id, actor_user_id, event_type, subject_type, subject_id, metadata)
		VALUES ($1, $2, 'member_access_changed', 'workspace_membership', $3, jsonb_build_object('role_id', $4::bigint, 'reason', $5::text))
	`, wsCtx.WorkspaceID, wsCtx.UserID, fmt.Sprintf("%d", memberUserID), roleID, reason)

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	s.RecordSecurityEvent(ctx, memberUserID, nil, "workspace_access_changed", "admin", "", map[string]any{"workspace_id": wsCtx.WorkspaceID, "role_id": roleID})
	return nil
}

func (s *Service) SuspendBusinessMember(ctx context.Context, wsCtx WorkspaceContext, memberUserID int64) error {
	if wsCtx.Kind != "business" || (!wsCtx.IsOwner && !wsCtx.HasPermission("settings.manage")) {
		return fmt.Errorf("FORBIDDEN")
	}
	var ownerID int64
	_ = s.pool.QueryRow(ctx, `SELECT owner_user_id FROM workspaces WHERE id = $1`, wsCtx.WorkspaceID).Scan(&ownerID)
	if memberUserID == ownerID {
		return ErrLastOwnerRequired
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE memberships SET status = 'suspended', suspended_at = now(), updated_at = now()
		WHERE workspace_id = $1 AND user_id = $2 AND status = 'active'
	`, wsCtx.WorkspaceID, memberUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	s.RecordSecurityEvent(ctx, memberUserID, nil, "workspace_membership_suspended", "admin", "", map[string]any{"workspace_id": wsCtx.WorkspaceID})
	return nil
}

func (s *Service) RemoveBusinessMember(ctx context.Context, wsCtx WorkspaceContext, memberUserID int64) error {
	if wsCtx.Kind != "business" || (!wsCtx.IsOwner && !wsCtx.HasPermission("settings.manage")) {
		return fmt.Errorf("FORBIDDEN")
	}
	var ownerID int64
	_ = s.pool.QueryRow(ctx, `SELECT owner_user_id FROM workspaces WHERE id = $1`, wsCtx.WorkspaceID).Scan(&ownerID)
	if memberUserID == ownerID {
		return ErrLastOwnerRequired
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE memberships SET status = 'removed', removed_at = now(), updated_at = now()
		WHERE workspace_id = $1 AND user_id = $2 AND status <> 'removed'
	`, wsCtx.WorkspaceID, memberUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	s.RecordSecurityEvent(ctx, memberUserID, nil, "workspace_membership_removed", "admin", "", map[string]any{"workspace_id": wsCtx.WorkspaceID})
	return nil
}

func (s *Service) InitiateBusinessOwnershipTransfer(ctx context.Context, wsCtx WorkspaceContext, toUserID int64) (db.OwnershipTransferRequest, error) {
	if wsCtx.Kind != "business" || !wsCtx.IsOwner {
		return db.OwnershipTransferRequest{}, fmt.Errorf("FORBIDDEN")
	}
	if err := s.RequireRecentAuth(ctx, wsCtx.UserID, "ownership_transfer"); err != nil {
		return db.OwnershipTransferRequest{}, err
	}
	if toUserID <= 0 || toUserID == wsCtx.UserID {
		return db.OwnershipTransferRequest{}, fmt.Errorf("invalid recipient user")
	}
	var activeMember bool
	_ = s.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND status = 'active')
	`, wsCtx.WorkspaceID, toUserID).Scan(&activeMember)
	if !activeMember {
		return db.OwnershipTransferRequest{}, fmt.Errorf("recipient must be an active member of this business")
	}
	var pendingExists bool
	_ = s.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM ownership_transfer_requests WHERE workspace_id = $1 AND status = 'pending' AND expires_at > now())
	`, wsCtx.WorkspaceID).Scan(&pendingExists)
	if pendingExists {
		return db.OwnershipTransferRequest{}, ErrOwnershipTransferPending
	}

	req, err := s.queries.CreateOwnershipTransferRequest(ctx, db.CreateOwnershipTransferRequestParams{
		WorkspaceID: wsCtx.WorkspaceID,
		FromUserID:  wsCtx.UserID,
		ToUserID:    toUserID,
		ExpiresAt:   pgtype.Timestamptz{Time: time.Now().UTC().Add(48 * time.Hour), Valid: true},
	})
	if err != nil {
		return db.OwnershipTransferRequest{}, err
	}
	s.RecordSecurityEvent(ctx, wsCtx.UserID, nil, "ownership_transfer_initiated", "user", "", map[string]any{"workspace_id": wsCtx.WorkspaceID, "to_user_id": toUserID})
	return req, nil
}

func (s *Service) AcceptBusinessOwnershipTransfer(ctx context.Context, recipientUserID, transferID int64) (db.OwnershipTransferRequest, error) {
	if err := s.RequireRecentAuth(ctx, recipientUserID, "ownership_transfer"); err != nil {
		return db.OwnershipTransferRequest{}, err
	}
	req, err := s.queries.GetOwnershipTransferRequestByID(ctx, transferID)
	if err != nil {
		return db.OwnershipTransferRequest{}, ErrNotFound
	}
	if req.ToUserID != recipientUserID || req.Status != "pending" || (req.ExpiresAt.Valid && req.ExpiresAt.Time.Before(time.Now().UTC())) {
		return db.OwnershipTransferRequest{}, ErrInvitationExpired
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.OwnershipTransferRequest{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := s.queries.WithTx(tx)

	accepted, err := qtx.AcceptOwnershipTransferRequest(ctx, transferID)
	if err != nil {
		return db.OwnershipTransferRequest{}, ErrInvitationExpired
	}
	// Transfer Business workspace ownership ONLY (Personal workspace never transfers).
	_, err = tx.Exec(ctx, `UPDATE workspaces SET owner_user_id = $2, updated_at = now() WHERE id = $1 AND kind = 'business'`, req.WorkspaceID, recipientUserID)
	if err != nil {
		return db.OwnershipTransferRequest{}, err
	}
	_, _ = tx.Exec(ctx, `UPDATE billing_subjects SET owner_user_id = $2 WHERE workspace_id = $1 AND subject_type = 'business'`, req.WorkspaceID, recipientUserID)
	_, _ = tx.Exec(ctx, `
		INSERT INTO audit_events (workspace_id, actor_user_id, event_type, subject_type, subject_id, metadata)
		VALUES ($1, $2, 'business_ownership_transferred', 'workspace', $1::bigint::text, jsonb_build_object('from_user_id', $3::bigint, 'to_user_id', $2::bigint))
	`, req.WorkspaceID, recipientUserID, req.FromUserID)

	if err := tx.Commit(ctx); err != nil {
		return db.OwnershipTransferRequest{}, err
	}
	s.RecordSecurityEvent(ctx, req.FromUserID, nil, "ownership_transferred_out", "user", "", map[string]any{"workspace_id": req.WorkspaceID, "to_user_id": recipientUserID})
	s.RecordSecurityEvent(ctx, recipientUserID, nil, "ownership_transferred_in", "user", "", map[string]any{"workspace_id": req.WorkspaceID, "from_user_id": req.FromUserID})
	return accepted, nil
}
