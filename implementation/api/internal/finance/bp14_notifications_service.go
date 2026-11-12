package finance

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

type OutboxNotificationEvent struct {
	WorkspaceID      int64
	EventType        string
	Category         string
	TemplateKey      string
	TemplateVersion  string
	Severity         string
	ResourceType     string
	ResourceID       int64
	ActionKey        string
	ActionURL        string
	Title            string
	Body             string
	RecipientUserIDs []int64
	SafeMetadata     map[string]any
	DedupeKey        string
}

type UpdateNotificationPrefInput struct {
	WorkspaceID *int64 `json:"workspace_id"`
	Category    string `json:"category" binding:"required"`
	Channel     string `json:"channel" binding:"required"`
	Enabled     bool   `json:"enabled"`
}

// EnqueueNotificationOutboxTx writes an outbox event atomically inside the caller's DB transaction.
func (s *Service) EnqueueNotificationOutboxTx(ctx context.Context, qtx *db.Queries, ev OutboxNotificationEvent) (db.NotificationOutbox, error) {
	recJSON, _ := json.Marshal(ev.RecipientUserIDs)
	metaJSON, _ := json.Marshal(ev.SafeMetadata)
	if len(metaJSON) == 0 {
		metaJSON = []byte("{}")
	}
	if ev.TemplateVersion == "" {
		ev.TemplateVersion = "v1"
	}
	if ev.Severity == "" {
		ev.Severity = "info"
	}
	return qtx.CreateNotificationOutbox(ctx, db.CreateNotificationOutboxParams{
		WorkspaceID:      ev.WorkspaceID,
		EventType:        ev.EventType,
		Category:         ev.Category,
		TemplateKey:      ev.TemplateKey,
		TemplateVersion:  ev.TemplateVersion,
		Severity:         ev.Severity,
		ResourceType:     ev.ResourceType,
		ResourceID:       ev.ResourceID,
		ActionKey:        ev.ActionKey,
		ActionUrl:        ev.ActionURL,
		Title:            ev.Title,
		Body:             ev.Body,
		RecipientUserIds: recJSON,
		SafeMetadata:     metaJSON,
		DedupeKey:        ev.DedupeKey,
	})
}

// ProjectPendingNotificationOutbox projects committed outbox events into user notifications.
func (s *Service) ProjectPendingNotificationOutbox(ctx context.Context) (int, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	items, err := qtx.ClaimPendingNotificationOutbox(ctx)
	if err != nil {
		return 0, err
	}

	projected := 0
	for _, ob := range items {
		var recipients []int64
		_ = json.Unmarshal(ob.RecipientUserIds, &recipients)
		for _, uid := range recipients {
			// Check user preference; security/legal/billing safety notices cannot be disabled
			if ob.Category != "security" && ob.Category != "billing" {
				var disabled bool
				_ = s.pool.QueryRow(ctx, `
					SELECT EXISTS(
						SELECT 1 FROM notification_preferences
						WHERE user_id = $1 AND (workspace_id = $2 OR workspace_id IS NULL)
						  AND category = $3 AND channel = 'in_app' AND enabled = false
					)`, uid, ob.WorkspaceID, ob.Category).Scan(&disabled)
				if disabled {
					continue
				}
			}
			_ = qtx.InsertProjectedNotification(ctx, db.InsertProjectedNotificationParams{
				WorkspaceID:     pgtype.Int8{Int64: ob.WorkspaceID, Valid: true},
				UserID:          uid,
				Category:        ob.Category,
				TemplateKey:     ob.TemplateKey,
				TemplateVersion: ob.TemplateVersion,
				Severity:        ob.Severity,
				ResourceType:    ob.ResourceType,
				ResourceID:      ob.ResourceID,
				ActionKey:       ob.ActionKey,
				ActionUrl:       pgtype.Text{String: ob.ActionUrl, Valid: ob.ActionUrl != ""},
				Title:           ob.Title,
				Body:            ob.Body,
				DedupeKey:       pgtype.Text{String: ob.DedupeKey, Valid: ob.DedupeKey != ""},
				Metadata:        ob.SafeMetadata,
			})
		}
		_ = qtx.MarkNotificationOutboxProjected(ctx, ob.ID)
		projected++
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return projected, nil
}

func (s *Service) ListMeNotifications(ctx context.Context, userID int64, workspaceID *int64, category string, includeArchived bool, cursorID int64, limit int32) ([]db.Notification, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	var wsParam pgtype.Int8
	if workspaceID != nil && *workspaceID > 0 {
		wsParam = pgtype.Int8{Int64: *workspaceID, Valid: true}
	}
	var catParam pgtype.Text
	if strings.TrimSpace(category) != "" {
		catParam = pgtype.Text{String: strings.TrimSpace(category), Valid: true}
	}
	return s.queries.ListUserNotifications(ctx, db.ListUserNotificationsParams{
		UserID:          userID,
		Column2:         cursorID,
		Limit:           limit,
		WorkspaceID:     wsParam,
		Category:        catParam,
		IncludeArchived: includeArchived,
	})
}

func (s *Service) CountMeUnreadNotifications(ctx context.Context, userID int64, workspaceID *int64) (int64, error) {
	var wsParam pgtype.Int8
	if workspaceID != nil && *workspaceID > 0 {
		wsParam = pgtype.Int8{Int64: *workspaceID, Valid: true}
	}
	return s.queries.CountUserUnreadNotifications(ctx, db.CountUserUnreadNotificationsParams{
		UserID:      userID,
		WorkspaceID: wsParam,
	})
}

func (s *Service) MarkMeNotificationRead(ctx context.Context, userID, notifID int64) (db.Notification, error) {
	n, err := s.queries.MarkNotificationReadByID(ctx, db.MarkNotificationReadByIDParams{ID: notifID, UserID: userID})
	if isNoRows(err) {
		return db.Notification{}, ErrNotFound
	}
	return n, err
}

func (s *Service) MarkMeNotificationUnread(ctx context.Context, userID, notifID int64) (db.Notification, error) {
	n, err := s.queries.MarkNotificationUnreadByID(ctx, db.MarkNotificationUnreadByIDParams{ID: notifID, UserID: userID})
	if isNoRows(err) {
		return db.Notification{}, ErrNotFound
	}
	return n, err
}

func (s *Service) ArchiveMeNotification(ctx context.Context, userID, notifID int64) (db.Notification, error) {
	n, err := s.queries.ArchiveNotificationByID(ctx, db.ArchiveNotificationByIDParams{ID: notifID, UserID: userID})
	if isNoRows(err) {
		return db.Notification{}, ErrNotFound
	}
	return n, err
}

func (s *Service) MarkMeNotificationsReadBulk(ctx context.Context, userID int64, workspaceID *int64) error {
	var wsParam pgtype.Int8
	if workspaceID != nil && *workspaceID > 0 {
		wsParam = pgtype.Int8{Int64: *workspaceID, Valid: true}
	}
	return s.queries.MarkAllNotificationsReadForUser(ctx, db.MarkAllNotificationsReadForUserParams{
		UserID:      userID,
		WorkspaceID: wsParam,
	})
}

func (s *Service) ListMeNotificationPreferences(ctx context.Context, userID int64, workspaceID *int64) ([]db.NotificationPreference, error) {
	var wsParam pgtype.Int8
	if workspaceID != nil && *workspaceID > 0 {
		wsParam = pgtype.Int8{Int64: *workspaceID, Valid: true}
	}
	return s.queries.ListNotificationPreferences(ctx, db.ListNotificationPreferencesParams{
		UserID:      userID,
		WorkspaceID: wsParam,
	})
}

func (s *Service) UpsertMeNotificationPreference(ctx context.Context, userID int64, in UpdateNotificationPrefInput) (db.NotificationPreference, error) {
	cat := strings.ToLower(strings.TrimSpace(in.Category))
	if cat == "security" && !in.Enabled {
		return db.NotificationPreference{}, errors.New("security notifications cannot be disabled")
	}
	var wsParam pgtype.Int8
	if in.WorkspaceID != nil && *in.WorkspaceID > 0 {
		wsParam = pgtype.Int8{Int64: *in.WorkspaceID, Valid: true}
	}
	return s.queries.UpsertNotificationPreference(ctx, db.UpsertNotificationPreferenceParams{
		UserID:      userID,
		WorkspaceID: wsParam,
		Category:    cat,
		Channel:     strings.ToLower(strings.TrimSpace(in.Channel)),
		Enabled:     in.Enabled,
	})
}
