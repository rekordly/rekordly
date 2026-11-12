package finance

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/rekordly/rekordly-api/internal/catalogue"
	"github.com/rekordly/rekordly-api/internal/db"
)

func (s *Service) ProjectReviewItemIdempotently(
	ctx context.Context,
	workspaceID int64,
	reviewType, sourceAggType, sourceAggID string,
	sourceVersion int64,
	dedupeKey, safeSummary string,
) (db.ReviewItem, error) {
	validType := false
	for _, rt := range catalogue.ReviewItemTypes {
		if rt == reviewType {
			validType = true
			break
		}
	}
	if !validType {
		return db.ReviewItem{}, fmt.Errorf("UNSUPPORTED_REVIEW_TYPE: %s", reviewType)
	}
	return s.queries.UpsertReviewItem(ctx, db.UpsertReviewItemParams{
		WorkspaceID:         workspaceID,
		ReviewType:          reviewType,
		SourceAggregateType: sourceAggType,
		SourceAggregateID:   sourceAggID,
		SourceVersion:       sourceVersion,
		DedupeKey:           dedupeKey,
		SafeSummary:         safeSummary,
	})
}

func (s *Service) TransitionReviewItem(
	ctx context.Context,
	workspaceID, reviewID int64,
	targetState, resolvedByEventID string,
) (db.ReviewItem, error) {
	cur, err := s.queries.GetReviewItemByID(ctx, db.GetReviewItemByIDParams{
		ID:          reviewID,
		WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.ReviewItem{}, ErrNotFound
	}
	if err != nil {
		return db.ReviewItem{}, err
	}
	if err := catalogue.ValidateTransition("review.item", cur.State, targetState, fmt.Sprintf("%d", cur.Version)); err != nil {
		return db.ReviewItem{}, err
	}
	updated, err := s.queries.TransitionReviewItemState(ctx, db.TransitionReviewItemStateParams{
		ID:                reviewID,
		WorkspaceID:       workspaceID,
		State:             cur.State,
		State_2:           targetState,
		ResolvedByEventID: resolvedByEventID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.ReviewItem{}, ErrSettingsVersionConflict
	}
	return updated, err
}

func (s *Service) ConsumeEventIdempotently(
	ctx context.Context,
	consumerName string,
	env catalogue.EventEnvelope,
	workspaceID int64,
	fn func(ctx context.Context) error,
) (bool, error) {
	if _, err := catalogue.ValidateEvent(env.EventType, env.EventVersion); err != nil {
		return false, err
	}
	rows, err := s.queries.RecordEventConsumption(ctx, db.RecordEventConsumptionParams{
		ConsumerName: consumerName,
		EventID:      env.EventID,
		WorkspaceID:  workspaceID,
		EventType:    env.EventType,
		EventVersion: int32(env.EventVersion),
	})
	if err != nil {
		return false, err
	}
	if rows == 0 {
		// Duplicate delivery: already consumed idempotently.
		return false, nil
	}
	if fn != nil {
		if err := fn(ctx); err != nil {
			return false, err
		}
	}
	return true, nil
}
