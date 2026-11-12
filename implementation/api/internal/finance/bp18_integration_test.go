package finance_test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/catalogue"
	"github.com/rekordly/rekordly-api/internal/db"
	"github.com/rekordly/rekordly-api/internal/finance"
	"github.com/stretchr/testify/require"
)

func TestBlueprint18_IdempotentEventConsumptionAndReviewItems(t *testing.T) {
	pool, _, businessWS, ownerID, _ := createBlueprint13Env(t, "bp18-cat")
	ctx := context.Background()
	svc := finance.NewService(pool)

	// 1. Project review item idempotently.
	item, err := svc.ProjectReviewItemIdempotently(
		ctx, businessWS, "payments.allocation_conflict", "payment", "pay_1", 1, "alloc_conflict:pay_1", "Invoice already paid",
	)
	require.NoError(t, err)
	require.Equal(t, "open", item.State)

	// Marking a notification read does NOT resolve the review item.
	var notifID int64
	_ = pool.QueryRow(ctx, `
		INSERT INTO notifications (user_id, workspace_id, category, title, body, dedupe_key)
		VALUES ($1, $2, 'payments', 'Allocation conflict', 'Review required', $3)
		RETURNING id
	`, ownerID, businessWS, fmt.Sprintf("bp18-notif-%d", time.Now().UnixNano())).Scan(&notifID)
	if notifID > 0 {
		_, _ = svc.MarkMeNotificationRead(ctx, ownerID, notifID)
	}
	reloaded, err := db.New(pool).GetReviewItemByID(ctx, db.GetReviewItemByIDParams{ID: item.ID, WorkspaceID: businessWS})
	require.NoError(t, err)
	require.Equal(t, "open", reloaded.State)

	// 2. Named transition succeeds; terminal resurrection fails with InvalidTransitionError.
	started, err := svc.TransitionReviewItem(ctx, businessWS, item.ID, "in_progress", "")
	require.NoError(t, err)
	require.Equal(t, "in_progress", started.State)

	resolved, err := svc.TransitionReviewItem(ctx, businessWS, item.ID, "resolved", "evt_fix_1")
	require.NoError(t, err)
	require.Equal(t, "resolved", resolved.State)

	_, err = svc.TransitionReviewItem(ctx, businessWS, item.ID, "open", "")
	var transErr *catalogue.InvalidTransitionError
	require.ErrorAs(t, err, &transErr)
	require.Equal(t, "resolved", transErr.CurrentState)

	// 3. Duplicate event consumer runs projection exactly once.
	eventID := fmt.Sprintf("evt_bp18_%d", time.Now().UnixNano())
	env := catalogue.EventEnvelope{
		EventID:      eventID,
		EventType:    "sales.invoice.issued",
		EventVersion: 1,
		OccurredAt:   time.Now().UTC(),
		RecordedAt:   time.Now().UTC(),
		Actor:        catalogue.ActorRef{Type: catalogue.ActorUser, ID: fmt.Sprintf("%d", ownerID)},
		Subject:      catalogue.SubjectRef{Type: "business", ID: fmt.Sprintf("%d", businessWS)},
		Aggregate:    catalogue.AggregateRef{Type: "sales_invoice", ID: "inv_1", Version: "1"},
		Payload:      json.RawMessage(`{"amount_minor":"10000","currency":"NGN"}`),
		Metadata:     catalogue.EventMetadata{Schema: 1},
	}

	calls := 0
	consumed1, err := svc.ConsumeEventIdempotently(ctx, "test_projector", env, businessWS, func(ctx context.Context) error {
		calls++
		return nil
	})
	require.NoError(t, err)
	require.True(t, consumed1)

	consumed2, err := svc.ConsumeEventIdempotently(ctx, "test_projector", env, businessWS, func(ctx context.Context) error {
		calls++
		return nil
	})
	require.NoError(t, err)
	require.False(t, consumed2)
	require.Equal(t, 1, calls)

	// Unsupported event version fails safely.
	envBad := env
	envBad.EventVersion = 99
	_, err = svc.ConsumeEventIdempotently(ctx, "test_projector", envBad, businessWS, nil)
	require.Error(t, err)
}
