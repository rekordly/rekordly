package finance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

func formatPGUUID(b [16]byte) string {
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func parsePGUUID(s string) (pgtype.UUID, error) {
	cleaned := strings.ReplaceAll(strings.TrimSpace(s), "-", "")
	if len(cleaned) != 32 {
		return pgtype.UUID{}, errors.New("invalid uuid")
	}
	raw, err := hex.DecodeString(cleaned)
	if err != nil || len(raw) != 16 {
		return pgtype.UUID{}, errors.New("invalid uuid")
	}
	var out [16]byte
	copy(out[:], raw)
	return pgtype.UUID{Bytes: out, Valid: true}, nil
}

const (
	OfflineManifestVersion = "2026-11-12.1"
	OfflineSchemaVersionV1 = int32(1)
)

type OfflineMode string

const (
	OfflineModeNone           OfflineMode = "none"
	OfflineModeReadOnly       OfflineMode = "read_only"
	OfflineModeDraftOnly      OfflineMode = "draft_only"
	OfflineModeQueuedCommands OfflineMode = "queued_commands"
)

type OfflineQueueLimits struct {
	MaxActiveQueueItems       int `json:"max_active_queue_items"`
	MaxAggregatePayloadBytes  int `json:"max_aggregate_payload_bytes"`
	MaxAttachmentStagingBytes int `json:"max_attachment_staging_bytes"`
	MaxItemAgeHours           int `json:"max_item_age_hours"`
	MaxDependencyDepth        int `json:"max_dependency_depth"`
	MaxAttempts               int `json:"max_attempts"`
	MaxOfflineDurationHours   int `json:"max_offline_duration_hours"`
}

type OfflineCommandPolicy struct {
	Mode               string  `json:"mode"`
	SchemaVersions     []int32 `json:"schema_versions"`
	MaxAgeHours        int     `json:"max_age_hours"`
	RequiredPermission string  `json:"required_permission,omitempty"`
}

type OfflineCapabilityManifest struct {
	ManifestVersion     string                          `json:"manifest_version"`
	OfflineMode         OfflineMode                     `json:"offline_mode"`
	PlanOfflineMode     OfflineMode                     `json:"plan_offline_mode"`
	LaunchGateCapped    bool                            `json:"launch_gate_capped"`
	EntitlementRevision string                          `json:"entitlement_revision"`
	PermissionRevision  string                          `json:"permission_revision"`
	ExpiresAt           time.Time                       `json:"expires_at"`
	ServerTime          time.Time                       `json:"server_time"`
	Limits              OfflineQueueLimits              `json:"limits"`
	Commands            map[string]OfflineCommandPolicy `json:"commands"`
}

type CreateSyncSessionInput struct {
	InstallationID      string `json:"installation_id"`
	ClientAppVersion    string `json:"client_app_version"`
	ClientSchemaVersion int32  `json:"client_schema_version"`
	ManifestVersion     string `json:"manifest_version"`
	ClientTimezone      string `json:"client_timezone"`
}

type SyncSessionResponse struct {
	SyncSessionID       string                    `json:"sync_session_id"`
	Status              string                    `json:"status"`
	ExpiresAt           time.Time                 `json:"expires_at"`
	ServerTime          time.Time                 `json:"server_time"`
	EntitlementRevision string                    `json:"entitlement_revision"`
	PermissionRevision  string                    `json:"permission_revision"`
	Manifest            OfflineCapabilityManifest `json:"manifest"`
}

type CompleteSyncSessionInput struct {
	CommandCount   int32 `json:"command_count"`
	ConfirmedCount int32 `json:"confirmed_count"`
	ConflictCount  int32 `json:"conflict_count"`
	FailedCount    int32 `json:"failed_count"`
}

type SyncCommandEnvelope struct {
	ClientCommandID           string            `json:"client_command_id"`
	IdempotencyKey            string            `json:"idempotency_key"`
	SupersedesClientCommandID string            `json:"supersedes_client_command_id,omitempty"`
	CommandType               string            `json:"command_type"`
	SchemaVersion             int32             `json:"schema_version"`
	PayloadHash               string            `json:"payload_hash"`
	BaseVersions              map[string]string `json:"base_versions,omitempty"`
	Dependencies              []string          `json:"dependencies,omitempty"`
	CreatedAtLocal            *time.Time        `json:"created_at_local,omitempty"`
	Payload                   json.RawMessage   `json:"payload"`
}

type SyncBatchInput struct {
	InstallationID string                `json:"installation_id"`
	SyncSessionID  string                `json:"sync_session_id,omitempty"`
	Commands       []SyncCommandEnvelope `json:"commands"`
}

type SyncCommandResult struct {
	ClientCommandID       string            `json:"client_command_id"`
	IdempotencyKey        string            `json:"idempotency_key"`
	CommandType           string            `json:"command_type"`
	Status                string            `json:"status"`
	Replayed              bool              `json:"replayed"`
	ConflictCode          string            `json:"conflict_code,omitempty"`
	SafeMessage           string            `json:"safe_message,omitempty"`
	ConflictFields        []string          `json:"conflict_fields,omitempty"`
	AllowedResolutions    []string          `json:"allowed_resolutions,omitempty"`
	CurrentSnapshot       json.RawMessage   `json:"current_snapshot,omitempty"`
	ServerResourceType    string            `json:"server_resource_type,omitempty"`
	ServerResourceID      string            `json:"server_resource_id,omitempty"`
	ServerResourceVersion string            `json:"server_resource_version,omitempty"`
	LocalIDMappings       map[string]string `json:"local_id_mappings,omitempty"`
	Result                json.RawMessage   `json:"result,omitempty"`
	ServerTime            time.Time         `json:"server_time"`
}

type SyncBatchResponse struct {
	SyncSessionID string              `json:"sync_session_id,omitempty"`
	ServerTime    time.Time           `json:"server_time"`
	Results       []SyncCommandResult `json:"results"`
}

func offlineMaxModeGate() OfflineMode {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv("REKORDLY_OFFLINE_MAX_MODE")))
	switch OfflineMode(raw) {
	case OfflineModeNone, OfflineModeReadOnly, OfflineModeDraftOnly, OfflineModeQueuedCommands:
		return OfflineMode(raw)
	default:
		// Blueprint 15 §71 launch gate: default to draft_only until all 10 launch gates are verified.
		return OfflineModeDraftOnly
	}
}

func modeRank(m OfflineMode) int {
	switch m {
	case OfflineModeNone:
		return 0
	case OfflineModeReadOnly:
		return 1
	case OfflineModeDraftOnly:
		return 2
	case OfflineModeQueuedCommands:
		return 3
	default:
		return 1
	}
}

func computePermissionRevision(perms []string) string {
	keys := make([]string, len(perms))
	copy(keys, perms)
	sort.Strings(keys)
	sum := sha256.Sum256([]byte(strings.Join(keys, ",")))
	return "perm_" + hex.EncodeToString(sum[:8])
}

func (s *Service) GetOfflineCapabilities(ctx context.Context, wsCtx WorkspaceContext) (OfflineCapabilityManifest, error) {
	now := time.Now().UTC()
	subj, _, err := s.ResolveSubjectForWorkspace(ctx, wsCtx.WorkspaceID)
	if err != nil {
		return OfflineCapabilityManifest{}, err
	}
	snap, err := s.ResolveEntitlements(ctx, subj.ID)
	if err != nil {
		return OfflineCapabilityManifest{}, err
	}

	planMode := OfflineModeReadOnly
	if def, ok := snap.Features[FeatOfflineMode]; ok {
		raw := strings.TrimSpace(strings.ToLower(def.TextValue))
		switch raw {
		case string(OfflineModeNone):
			planMode = OfflineModeNone
		case string(OfflineModeReadOnly):
			planMode = OfflineModeReadOnly
		case string(OfflineModeDraftOnly), "draft_sync":
			planMode = OfflineModeDraftOnly
		case string(OfflineModeQueuedCommands), "queued_sync":
			planMode = OfflineModeQueuedCommands
		default:
			if def.BoolValue {
				planMode = OfflineModeDraftOnly
			}
		}
	}

	maxGate := offlineMaxModeGate()
	effectiveMode := planMode
	capped := false
	if modeRank(effectiveMode) > modeRank(maxGate) {
		effectiveMode = maxGate
		capped = true
	}

	confirmMode := "draft_review_only"
	if effectiveMode == OfflineModeQueuedCommands {
		confirmMode = "queue"
	}
	draftMode := "draft_only"
	if effectiveMode == OfflineModeNone || effectiveMode == OfflineModeReadOnly {
		draftMode = "online_only"
	}

	commands := map[string]OfflineCommandPolicy{
		"money_draft.create": {
			Mode:               draftMode,
			SchemaVersions:     []int32{1},
			MaxAgeHours:        168,
			RequiredPermission: "money.create",
		},
		"money_entry.confirm": {
			Mode:               confirmMode,
			SchemaVersions:     []int32{1},
			MaxAgeHours:        72,
			RequiredPermission: "money.confirm",
		},
		"personal_budget.draft": {
			Mode:               draftMode,
			SchemaVersions:     []int32{1},
			MaxAgeHours:        168,
			RequiredPermission: "budgets.manage",
		},
		"notification.mark_read": {
			Mode:           "queue",
			SchemaVersions: []int32{1},
			MaxAgeHours:    168,
		},
		"payment.allocate": {
			Mode:           "draft_review_only",
			SchemaVersions: []int32{1},
			MaxAgeHours:    24,
		},
		"invoice.issue": {
			Mode:           "draft_review_only",
			SchemaVersions: []int32{1},
			MaxAgeHours:    24,
		},
		"stock.adjust": {
			Mode:           "draft_review_only",
			SchemaVersions: []int32{1},
			MaxAgeHours:    24,
		},
		"loan.repayment": {
			Mode:           "draft_review_only",
			SchemaVersions: []int32{1},
			MaxAgeHours:    24,
		},
		"period.close": {
			Mode:           "online_only",
			SchemaVersions: []int32{1},
			MaxAgeHours:    0,
		},
		"billing.checkout": {
			Mode:           "online_only",
			SchemaVersions: []int32{1},
			MaxAgeHours:    0,
		},
	}

	return OfflineCapabilityManifest{
		ManifestVersion:     OfflineManifestVersion,
		OfflineMode:         effectiveMode,
		PlanOfflineMode:     planMode,
		LaunchGateCapped:    capped,
		EntitlementRevision: fmt.Sprintf("ent_rev_%d", snap.EntitlementRevision),
		PermissionRevision:  computePermissionRevision(wsCtx.Permissions),
		ExpiresAt:           now.Add(24 * time.Hour),
		ServerTime:          now,
		Limits: OfflineQueueLimits{
			MaxActiveQueueItems:       100,
			MaxAggregatePayloadBytes:  5 * 1024 * 1024,
			MaxAttachmentStagingBytes: 25 * 1024 * 1024,
			MaxItemAgeHours:           168,
			MaxDependencyDepth:        5,
			MaxAttempts:               8,
			MaxOfflineDurationHours:   168,
		},
		Commands: commands,
	}, nil
}

func (s *Service) CreateSyncSession(ctx context.Context, wsCtx WorkspaceContext, in CreateSyncSessionInput) (SyncSessionResponse, error) {
	installID := strings.TrimSpace(in.InstallationID)
	if installID == "" {
		return SyncSessionResponse{}, fmt.Errorf("installation_id is required")
	}
	manifest, err := s.GetOfflineCapabilities(ctx, wsCtx)
	if err != nil {
		return SyncSessionResponse{}, err
	}
	schemaVer := in.ClientSchemaVersion
	if schemaVer <= 0 {
		schemaVer = 1
	}
	var entRev int64
	if strings.HasPrefix(manifest.EntitlementRevision, "ent_rev_") {
		entRev, _ = strconv.ParseInt(strings.TrimPrefix(manifest.EntitlementRevision, "ent_rev_"), 10, 64)
	}
	expiresAt := time.Now().UTC().Add(30 * time.Minute)
	row, err := s.queries.CreateOfflineSyncSession(ctx, db.CreateOfflineSyncSessionParams{
		UserID:              wsCtx.UserID,
		WorkspaceID:         wsCtx.WorkspaceID,
		InstallationID:      installID,
		ClientAppVersion:    strings.TrimSpace(in.ClientAppVersion),
		ClientSchemaVersion: schemaVer,
		ManifestVersion:     strings.TrimSpace(in.ManifestVersion),
		EntitlementRevision: entRev,
		PermissionRevision:  manifest.PermissionRevision,
		ClientTimezone:      strings.TrimSpace(in.ClientTimezone),
		ExpiresAt:           pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return SyncSessionResponse{}, err
	}
	return SyncSessionResponse{
		SyncSessionID:       formatPGUUID(row.SessionUuid.Bytes),
		Status:              row.Status,
		ExpiresAt:           expiresAt,
		ServerTime:          time.Now().UTC(),
		EntitlementRevision: manifest.EntitlementRevision,
		PermissionRevision:  manifest.PermissionRevision,
		Manifest:            manifest,
	}, nil
}

func (s *Service) CompleteSyncSession(ctx context.Context, wsCtx WorkspaceContext, sessionUUIDStr string, in CompleteSyncSessionInput) (db.OfflineSyncSession, error) {
	parsed, err := parsePGUUID(sessionUUIDStr)
	if err != nil {
		return db.OfflineSyncSession{}, ErrNotFound
	}
	row, err := s.queries.CompleteOfflineSyncSession(ctx, db.CompleteOfflineSyncSessionParams{
		SessionUuid:    parsed,
		UserID:         wsCtx.UserID,
		WorkspaceID:    wsCtx.WorkspaceID,
		CommandCount:   in.CommandCount,
		ConfirmedCount: in.ConfirmedCount,
		ConflictCount:  in.ConflictCount,
		FailedCount:    in.FailedCount,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.OfflineSyncSession{}, ErrNotFound
	}
	return row, err
}

func canonicalHashBytes(raw json.RawMessage) string {
	var normalized any
	if err := json.Unmarshal(raw, &normalized); err != nil {
		sum := sha256.Sum256(raw)
		return "sha256:" + hex.EncodeToString(sum[:])
	}
	canon, err := json.Marshal(normalized)
	if err != nil {
		sum := sha256.Sum256(raw)
		return "sha256:" + hex.EncodeToString(sum[:])
	}
	sum := sha256.Sum256(canon)
	return "sha256:" + hex.EncodeToString(sum[:])
}

// topologicalSortBatch validates that commands in the batch form a DAG (rejecting cycles)
// and returns them in deterministic dependency-first order.
func topologicalSortBatch(commands []SyncCommandEnvelope) ([]SyncCommandEnvelope, error) {
	byID := make(map[string]int, len(commands))
	for i, cmd := range commands {
		byID[cmd.ClientCommandID] = i
	}
	state := make([]int, len(commands)) // 0=unvisited, 1=visiting, 2=visited
	ordered := make([]SyncCommandEnvelope, 0, len(commands))

	var visit func(idx int) error
	visit = func(idx int) error {
		if state[idx] == 2 {
			return nil
		}
		if state[idx] == 1 {
			return errors.New("DEPENDENCY_CYCLE")
		}
		state[idx] = 1
		for _, depID := range commands[idx].Dependencies {
			if depIdx, exists := byID[depID]; exists {
				if err := visit(depIdx); err != nil {
					return err
				}
			}
		}
		state[idx] = 2
		ordered = append(ordered, commands[idx])
		return nil
	}

	for i := range commands {
		if err := visit(i); err != nil {
			return nil, err
		}
	}
	return ordered, nil
}

func (s *Service) ProcessSyncCommandBatch(ctx context.Context, wsCtx WorkspaceContext, in SyncBatchInput) (SyncBatchResponse, error) {
	now := time.Now().UTC()
	installID := strings.TrimSpace(in.InstallationID)
	if installID == "" {
		return SyncBatchResponse{}, fmt.Errorf("installation_id is required")
	}
	if len(in.Commands) == 0 || len(in.Commands) > 50 {
		return SyncBatchResponse{}, fmt.Errorf("commands must contain between 1 and 50 items")
	}

	var syncSessionDBID pgtype.Int8
	if strings.TrimSpace(in.SyncSessionID) != "" {
		parsed, err := parsePGUUID(in.SyncSessionID)
		if err != nil {
			return SyncBatchResponse{}, fmt.Errorf("SYNC_SESSION_EXPIRED")
		}
		sess, err := s.queries.GetOfflineSyncSessionByUUID(ctx, db.GetOfflineSyncSessionByUUIDParams{
			SessionUuid: parsed,
			UserID:      wsCtx.UserID,
			WorkspaceID: wsCtx.WorkspaceID,
		})
		if err != nil || sess.Status != "active" || (sess.ExpiresAt.Valid && sess.ExpiresAt.Time.Before(now)) {
			return SyncBatchResponse{}, fmt.Errorf("SYNC_SESSION_EXPIRED")
		}
		syncSessionDBID = pgtype.Int8{Int64: sess.ID, Valid: true}
	}

	ordered, err := topologicalSortBatch(in.Commands)
	if err != nil {
		return SyncBatchResponse{}, fmt.Errorf("DEPENDENCY_CYCLE")
	}

	manifest, err := s.GetOfflineCapabilities(ctx, wsCtx)
	if err != nil {
		return SyncBatchResponse{}, err
	}

	batchStatuses := make(map[string]string, len(ordered))
	results := make([]SyncCommandResult, 0, len(ordered))

	for _, cmd := range ordered {
		res := s.processSingleSyncCommand(ctx, wsCtx, installID, syncSessionDBID, manifest, cmd, batchStatuses)
		batchStatuses[cmd.ClientCommandID] = res.Status
		results = append(results, res)
	}

	return SyncBatchResponse{
		SyncSessionID: in.SyncSessionID,
		ServerTime:    time.Now().UTC(),
		Results:       results,
	}, nil
}

func (s *Service) processSingleSyncCommand(
	ctx context.Context,
	wsCtx WorkspaceContext,
	installID string,
	syncSessionDBID pgtype.Int8,
	manifest OfflineCapabilityManifest,
	cmd SyncCommandEnvelope,
	batchStatuses map[string]string,
) SyncCommandResult {
	started := time.Now()
	now := started.UTC()

	clientCmdID := strings.TrimSpace(cmd.ClientCommandID)
	idempKey := strings.TrimSpace(cmd.IdempotencyKey)
	cmdType := strings.TrimSpace(cmd.CommandType)
	payloadHash := strings.TrimSpace(cmd.PayloadHash)
	if payloadHash == "" {
		payloadHash = canonicalHashBytes(cmd.Payload)
	}

	if clientCmdID == "" || idempKey == "" || cmdType == "" {
		return SyncCommandResult{
			ClientCommandID: clientCmdID,
			IdempotencyKey:  idempKey,
			CommandType:     cmdType,
			Status:          "failed_permanent",
			ConflictCode:    "INVALID_COMMAND_ENVELOPE",
			SafeMessage:     "client_command_id, idempotency_key, and command_type are required.",
			ServerTime:      now,
		}
	}

	// 1. Check idempotency record scoped strictly by (user_id, workspace_id, idempotency_key).
	existing, err := s.queries.GetClientCommandReceiptByIdempotencyKey(ctx, db.GetClientCommandReceiptByIdempotencyKeyParams{
		UserID:         wsCtx.UserID,
		WorkspaceID:    wsCtx.WorkspaceID,
		IdempotencyKey: idempKey,
	})
	if err == nil {
		if existing.PayloadHash != payloadHash {
			s.recordSyncEvent(ctx, wsCtx, installID, clientCmdID, cmdType, cmd.SchemaVersion, "idempotency_conflict", "IDEMPOTENCY_CONFLICT", started)
			return SyncCommandResult{
				ClientCommandID:    clientCmdID,
				IdempotencyKey:     idempKey,
				CommandType:        cmdType,
				Status:             "failed_permanent",
				ConflictCode:       "IDEMPOTENCY_CONFLICT",
				SafeMessage:        "This idempotency key was already used for a different payload. Create a revised command with a new key.",
				AllowedResolutions: []string{"edit_and_resubmit", "discard_local_intent"},
				ServerTime:         now,
			}
		}
		s.recordSyncEvent(ctx, wsCtx, installID, clientCmdID, cmdType, cmd.SchemaVersion, "replayed", existing.ConflictCode, started)
		return receiptToSyncResult(existing, true, now)
	}

	// 2. Check dependency readiness.
	for _, depID := range cmd.Dependencies {
		if st, ok := batchStatuses[depID]; ok {
			if st != "confirmed" {
				return SyncCommandResult{
					ClientCommandID:    clientCmdID,
					IdempotencyKey:     idempKey,
					CommandType:        cmdType,
					Status:             "dependency_blocked",
					ConflictCode:       "DEPENDENCY_UNRESOLVED",
					SafeMessage:        fmt.Sprintf("Waiting for prerequisite command %s (status: %s).", depID, st),
					AllowedResolutions: []string{"retry_after_dependency", "save_draft"},
					ServerTime:         now,
				}
			}
		} else {
			depReceipt, depErr := s.queries.GetClientCommandReceiptByCommandID(ctx, db.GetClientCommandReceiptByCommandIDParams{
				UserID:          wsCtx.UserID,
				WorkspaceID:     wsCtx.WorkspaceID,
				ClientCommandID: depID,
			})
			if depErr != nil || depReceipt.Status != "confirmed" {
				return SyncCommandResult{
					ClientCommandID:    clientCmdID,
					IdempotencyKey:     idempKey,
					CommandType:        cmdType,
					Status:             "dependency_blocked",
					ConflictCode:       "DEPENDENCY_UNRESOLVED",
					SafeMessage:        fmt.Sprintf("Prerequisite command %s is not confirmed yet.", depID),
					AllowedResolutions: []string{"retry_after_dependency", "save_draft"},
					ServerTime:         now,
				}
			}
		}
	}

	// 3. Insert processing receipt.
	baseVersionsJSON, _ := json.Marshal(cmd.BaseVersions)
	if len(baseVersionsJSON) == 0 {
		baseVersionsJSON = []byte("{}")
	}
	depsJSON, _ := json.Marshal(cmd.Dependencies)
	if len(depsJSON) == 0 {
		depsJSON = []byte("[]")
	}
	var clientCreatedAt pgtype.Timestamptz
	if cmd.CreatedAtLocal != nil {
		clientCreatedAt = pgtype.Timestamptz{Time: *cmd.CreatedAtLocal, Valid: true}
	}

	receipt, err := s.queries.InsertProcessingClientCommandReceipt(ctx, db.InsertProcessingClientCommandReceiptParams{
		UserID:                    wsCtx.UserID,
		WorkspaceID:               wsCtx.WorkspaceID,
		SyncSessionID:             syncSessionDBID,
		InstallationID:            installID,
		ClientCommandID:           clientCmdID,
		IdempotencyKey:            idempKey,
		SupersedesClientCommandID: strings.TrimSpace(cmd.SupersedesClientCommandID),
		CommandType:               cmdType,
		SchemaVersion:             cmd.SchemaVersion,
		PayloadHash:               payloadHash,
		BaseVersionsJson:          baseVersionsJSON,
		DependenciesJson:          depsJSON,
		ClientCreatedAt:           clientCreatedAt,
	})
	if err != nil {
		return SyncCommandResult{
			ClientCommandID: clientCmdID,
			IdempotencyKey:  idempKey,
			CommandType:     cmdType,
			Status:          "retry_later",
			ConflictCode:    "TRANSIENT_PERSISTENCE_ERROR",
			SafeMessage:     fmt.Sprintf("Temporary server error recording sync receipt (%v); retry with the same key.", err),
			ServerTime:      now,
		}
	}

	// 4. Schema version check.
	if cmd.SchemaVersion != OfflineSchemaVersionV1 {
		return s.finalizeReceiptConflict(ctx, wsCtx, receipt, installID, started,
			"unsupported_version", "COMMAND_SCHEMA_UNSUPPORTED",
			"This offline command schema version is no longer supported. Export or edit into a new draft.",
			nil, []string{"save_draft", "export_intent", "discard_local_intent"}, nil, 422)
	}

	// 5. Manifest & entitlement check.
	policy, knownCmd := manifest.Commands[cmdType]
	if !knownCmd || policy.Mode == "online_only" {
		return s.finalizeReceiptConflict(ctx, wsCtx, receipt, installID, started,
			"needs_review", "OFFLINE_COMMAND_NOT_ALLOWED",
			"This action is online-only or currently disabled by offline policy. Review and submit online.",
			nil, []string{"save_draft", "export_intent", "discard_local_intent"}, nil, 403)
	}
	if policy.Mode == "draft_review_only" {
		return s.finalizeReceiptConflict(ctx, wsCtx, receipt, installID, started,
			"needs_review", "OFFLINE_COMMAND_NOT_ALLOWED",
			"This action requires live online review before posting.",
			nil, []string{"review_online", "save_draft", "discard_local_intent"}, nil, 409)
	}

	// 6. Permission check.
	if policy.RequiredPermission != "" && !wsCtx.HasPermission(policy.RequiredPermission) {
		return s.finalizeReceiptConflict(ctx, wsCtx, receipt, installID, started,
			"needs_review", "PERMISSION_CHANGED",
			"Your workspace permissions no longer allow this action. You can export your local intent or contact an admin.",
			nil, []string{"export_intent", "discard_local_intent"}, nil, 403)
	}

	// 7. Execute allowlisted domain command.
	switch cmdType {
	case "money_draft.create":
		var in MoneyRecordDraftInput
		if err := json.Unmarshal(cmd.Payload, &in); err != nil {
			return s.finalizeReceiptConflict(ctx, wsCtx, receipt, installID, started,
				"failed_permanent", "INVALID_PAYLOAD",
				"Invalid money draft payload.", nil, []string{"save_draft", "discard_local_intent"}, nil, 400)
		}
		in.ClientCommandID = clientCmdID
		in.EntryMethod = "offline"
		draft, err := s.CreateMoneyRecordDraft(ctx, wsCtx.WorkspaceID, wsCtx.UserID, wsCtx.Kind, in)
		if err != nil {
			return s.mapDomainErrorToReceipt(ctx, wsCtx, receipt, installID, started, err)
		}
		resBytes, _ := json.Marshal(draft)
		mappings := map[string]string{clientCmdID: strconv.FormatInt(draft.ID, 10)}
		return s.finalizeReceiptConfirmed(ctx, wsCtx, receipt, installID, started,
			"money_record_draft", strconv.FormatInt(draft.ID, 10), strconv.FormatInt(int64(draft.Version), 10), mappings, resBytes)

	case "money_entry.confirm":
		var in ConfirmMoneyRecordInput
		if err := json.Unmarshal(cmd.Payload, &in); err != nil {
			return s.finalizeReceiptConflict(ctx, wsCtx, receipt, installID, started,
				"failed_permanent", "INVALID_PAYLOAD",
				"Invalid money entry confirmation payload.", nil, []string{"save_draft", "discard_local_intent"}, nil, 400)
		}
		confirmed, err := s.ConfirmMoneyRecord(ctx, wsCtx.WorkspaceID, wsCtx.UserID, wsCtx.Kind, idempKey, in)
		if err != nil {
			return s.mapDomainErrorToReceipt(ctx, wsCtx, receipt, installID, started, err)
		}
		resBytes, _ := json.Marshal(confirmed)
		mappings := map[string]string{clientCmdID: strconv.FormatInt(confirmed.Record.ID, 10)}
		return s.finalizeReceiptConfirmed(ctx, wsCtx, receipt, installID, started,
			"money_record", strconv.FormatInt(confirmed.Record.ID, 10), strconv.FormatInt(confirmed.Record.SyncVersion, 10), mappings, resBytes)

	case "notification.mark_read":
		var in struct {
			NotificationID int64 `json:"notification_id"`
		}
		if err := json.Unmarshal(cmd.Payload, &in); err != nil || in.NotificationID <= 0 {
			return s.finalizeReceiptConflict(ctx, wsCtx, receipt, installID, started,
				"failed_permanent", "INVALID_PAYLOAD",
				"notification_id is required.", nil, []string{"discard_local_intent"}, nil, 400)
		}
		n, err := s.MarkMeNotificationRead(ctx, wsCtx.UserID, in.NotificationID)
		if err != nil {
			return s.mapDomainErrorToReceipt(ctx, wsCtx, receipt, installID, started, err)
		}
		resBytes, _ := json.Marshal(n)
		return s.finalizeReceiptConfirmed(ctx, wsCtx, receipt, installID, started,
			"notification", strconv.FormatInt(n.ID, 10), "1", nil, resBytes)

	default:
		return s.finalizeReceiptConflict(ctx, wsCtx, receipt, installID, started,
			"needs_review", "OFFLINE_COMMAND_NOT_ALLOWED",
			"Unsupported offline command type.", nil, []string{"export_intent", "discard_local_intent"}, nil, 400)
	}
}

func (s *Service) mapDomainErrorToReceipt(
	ctx context.Context,
	wsCtx WorkspaceContext,
	receipt db.ClientCommandReceipt,
	installID string,
	started time.Time,
	err error,
) SyncCommandResult {
	code := "BUSINESS_RULE_CONFLICT"
	msg := err.Error()
	resolutions := []string{"edit_and_resubmit", "save_draft", "discard_local_intent"}
	status := "needs_review"
	httpStatus := int32(409)

	switch {
	case errors.Is(err, ErrIdempotencyConflict):
		code = "IDEMPOTENCY_CONFLICT"
		status = "failed_permanent"
	case errors.Is(err, ErrDraftVersionConflict):
		code = "RESOURCE_VERSION_CONFLICT"
		msg = "This record changed on the server while you were offline. Review the current state before resubmitting."
	case errors.Is(err, ErrPeriodClosed) || strings.Contains(strings.ToUpper(msg), "PERIOD"):
		code = "PERIOD_LOCKED"
		msg = "The accounting period for this date is locked."
	case errors.Is(err, ErrPlanLimitReached) || errors.Is(err, ErrFeatureNotIncluded):
		code = "ENTITLEMENT_STALE"
		httpStatus = 403
	case errors.Is(err, ErrNotFound):
		code = "RESOURCE_NOT_FOUND"
		httpStatus = 404
	}

	return s.finalizeReceiptConflict(ctx, wsCtx, receipt, installID, started, status, code, msg, nil, resolutions, nil, httpStatus)
}

func (s *Service) finalizeReceiptConfirmed(
	ctx context.Context,
	wsCtx WorkspaceContext,
	receipt db.ClientCommandReceipt,
	installID string,
	started time.Time,
	resType, resID, resVer string,
	mappings map[string]string,
	resultBytes []byte,
) SyncCommandResult {
	mappingsBytes, _ := json.Marshal(mappings)
	if len(mappingsBytes) == 0 {
		mappingsBytes = []byte("{}")
	}
	updated, err := s.queries.UpdateClientCommandReceiptOutcome(ctx, db.UpdateClientCommandReceiptOutcomeParams{
		ID:                     receipt.ID,
		UserID:                 wsCtx.UserID,
		WorkspaceID:            wsCtx.WorkspaceID,
		Status:                 "confirmed",
		ConflictCode:           "",
		SafeMessage:            "",
		ConflictFieldsJson:     []byte("[]"),
		AllowedResolutionsJson: []byte("[]"),
		CurrentSnapshotJson:    nil,
		ServerResourceType:     resType,
		ServerResourceID:       resID,
		ServerResourceVersion:  resVer,
		LocalIDMappingsJson:    mappingsBytes,
		ResultJson:             resultBytes,
		HttpStatus:             200,
	})
	if err != nil {
		return SyncCommandResult{
			ClientCommandID: receipt.ClientCommandID,
			IdempotencyKey:  receipt.IdempotencyKey,
			CommandType:     receipt.CommandType,
			Status:          "confirmed",
			ServerTime:      time.Now().UTC(),
		}
	}
	s.recordSyncEvent(ctx, wsCtx, installID, receipt.ClientCommandID, receipt.CommandType, receipt.SchemaVersion, "confirmed", "", started)
	return receiptToSyncResult(updated, false, time.Now().UTC())
}

func (s *Service) finalizeReceiptConflict(
	ctx context.Context,
	wsCtx WorkspaceContext,
	receipt db.ClientCommandReceipt,
	installID string,
	started time.Time,
	status, conflictCode, safeMsg string,
	conflictFields, allowedResolutions []string,
	currentSnapshot []byte,
	httpStatus int32,
) SyncCommandResult {
	cfBytes, _ := json.Marshal(conflictFields)
	if len(cfBytes) == 0 {
		cfBytes = []byte("[]")
	}
	arBytes, _ := json.Marshal(allowedResolutions)
	if len(arBytes) == 0 {
		arBytes = []byte("[]")
	}
	updated, err := s.queries.UpdateClientCommandReceiptOutcome(ctx, db.UpdateClientCommandReceiptOutcomeParams{
		ID:                     receipt.ID,
		UserID:                 wsCtx.UserID,
		WorkspaceID:            wsCtx.WorkspaceID,
		Status:                 status,
		ConflictCode:           conflictCode,
		SafeMessage:            safeMsg,
		ConflictFieldsJson:     cfBytes,
		AllowedResolutionsJson: arBytes,
		CurrentSnapshotJson:    currentSnapshot,
		LocalIDMappingsJson:    []byte("{}"),
		HttpStatus:             httpStatus,
	})
	if err != nil {
		return SyncCommandResult{
			ClientCommandID:    receipt.ClientCommandID,
			IdempotencyKey:     receipt.IdempotencyKey,
			CommandType:        receipt.CommandType,
			Status:             status,
			ConflictCode:       conflictCode,
			SafeMessage:        safeMsg,
			AllowedResolutions: allowedResolutions,
			ServerTime:         time.Now().UTC(),
		}
	}
	s.recordSyncEvent(ctx, wsCtx, installID, receipt.ClientCommandID, receipt.CommandType, receipt.SchemaVersion, status, conflictCode, started)
	return receiptToSyncResult(updated, false, time.Now().UTC())
}

func (s *Service) recordSyncEvent(ctx context.Context, wsCtx WorkspaceContext, installID, clientCmdID, cmdType string, schemaVer int32, outcome, conflictCode string, started time.Time) {
	durMs := int32(time.Since(started).Milliseconds())
	_, _ = s.queries.InsertOfflineSyncEvent(ctx, db.InsertOfflineSyncEventParams{
		UserID:          wsCtx.UserID,
		WorkspaceID:     wsCtx.WorkspaceID,
		InstallationID:  installID,
		ClientCommandID: clientCmdID,
		CommandType:     cmdType,
		SchemaVersion:   schemaVer,
		Outcome:         outcome,
		ConflictCode:    conflictCode,
		DurationMs:      durMs,
	})
}

func receiptToSyncResult(r db.ClientCommandReceipt, replayed bool, now time.Time) SyncCommandResult {
	var conflictFields []string
	_ = json.Unmarshal(r.ConflictFieldsJson, &conflictFields)
	var allowedResolutions []string
	_ = json.Unmarshal(r.AllowedResolutionsJson, &allowedResolutions)
	var mappings map[string]string
	_ = json.Unmarshal(r.LocalIDMappingsJson, &mappings)

	return SyncCommandResult{
		ClientCommandID:       r.ClientCommandID,
		IdempotencyKey:        r.IdempotencyKey,
		CommandType:           r.CommandType,
		Status:                r.Status,
		Replayed:              replayed,
		ConflictCode:          r.ConflictCode,
		SafeMessage:           r.SafeMessage,
		ConflictFields:        conflictFields,
		AllowedResolutions:    allowedResolutions,
		CurrentSnapshot:       r.CurrentSnapshotJson,
		ServerResourceType:    r.ServerResourceType,
		ServerResourceID:      r.ServerResourceID,
		ServerResourceVersion: r.ServerResourceVersion,
		LocalIDMappings:       mappings,
		Result:                r.ResultJson,
		ServerTime:            now,
	}
}

func (s *Service) GetSyncCommandStatus(ctx context.Context, wsCtx WorkspaceContext, clientCommandID string) (SyncCommandResult, error) {
	r, err := s.queries.GetClientCommandReceiptByCommandID(ctx, db.GetClientCommandReceiptByCommandIDParams{
		UserID:          wsCtx.UserID,
		WorkspaceID:     wsCtx.WorkspaceID,
		ClientCommandID: strings.TrimSpace(clientCommandID),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return SyncCommandResult{}, ErrNotFound
	}
	if err != nil {
		return SyncCommandResult{}, err
	}
	return receiptToSyncResult(r, true, time.Now().UTC()), nil
}

func (s *Service) GetIdempotencyRecordForSync(ctx context.Context, wsCtx WorkspaceContext, key string) (SyncCommandResult, error) {
	r, err := s.queries.GetClientCommandReceiptByIdempotencyKey(ctx, db.GetClientCommandReceiptByIdempotencyKeyParams{
		UserID:         wsCtx.UserID,
		WorkspaceID:    wsCtx.WorkspaceID,
		IdempotencyKey: strings.TrimSpace(key),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return SyncCommandResult{}, ErrNotFound
	}
	if err != nil {
		return SyncCommandResult{}, err
	}
	return receiptToSyncResult(r, true, time.Now().UTC()), nil
}
