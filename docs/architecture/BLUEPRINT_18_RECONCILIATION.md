# Blueprint 18 Implementation Reconciliation

This document records mismatches discovered between Blueprints 00–17 and the implemented codebase, and how they were reconciled without silently altering business semantics:

1. **Offline Mode Entitlement Token (`draft_sync` vs `draft_only`)**:
   - Blueprint 13 seeded `plan_entitlement_definitions.text_value = 'draft_sync'` for paid plans, whereas Blueprint 15 & 18 specify `draft_only`.
   - **Resolution**: `bp15_offline_sync_service.go` normalizes `"draft_sync"` to `OfflineModeDraftOnly` (`"draft_only"`), preserving backward compatibility with existing plan rows while enforcing the canonical Blueprint 15/18 manifest mode.

2. **Email Webhook Deduplication in Integration Fixtures**:
   - `email_webhook_events` deduplicates by `(provider, event_id)` globally across workspaces.
   - **Resolution**: Reconciled `bp14_integration_test.go` to generate unique per-run provider message IDs and clean up `email_webhook_events`, preserving strict production webhook idempotency.

3. **Review Items vs Notifications**:
   - Marking a notification read (`notifications`) does not resolve actionable product review conditions (`review_items`).
   - **Resolution**: Added dedicated `review_items` table and `TransitionReviewItem` validator enforcing `review.item` terminal states (`resolved`, `dismissed`, `superseded`) via named commands (`/review-items/:reviewId/commands/start`, `/dismiss`).
