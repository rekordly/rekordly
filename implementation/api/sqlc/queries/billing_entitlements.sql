-- Blueprint 13: Plans, Billing, Entitlements & Downgrades

-- name: GetCommercialModeConfig :one
SELECT * FROM commercial_mode_config WHERE id = 1;

-- name: UpdateCommercialModeConfig :one
UPDATE commercial_mode_config
SET mode = $1,
    updated_by_user_id = $2,
    updated_at = now()
WHERE id = 1
RETURNING *;

-- name: ListPlanVersions :many
SELECT *
FROM plan_versions
WHERE is_available = true
  AND (sqlc.narg('subject_type')::text IS NULL OR subject_type = sqlc.narg('subject_type')::text)
  AND (sqlc.narg('is_addon')::boolean IS NULL OR is_addon = sqlc.narg('is_addon')::boolean)
ORDER BY is_addon ASC, price_minor ASC, id ASC;

-- name: GetPlanVersionByID :one
SELECT * FROM plan_versions WHERE id = $1;

-- name: GetPlanVersionByCodeAndVersion :one
SELECT * FROM plan_versions WHERE plan_code = $1 AND version = $2;

-- name: ListPlanEntitlementDefinitions :many
SELECT *
FROM plan_entitlement_definitions
WHERE plan_version_id = $1
ORDER BY feature_key ASC;

-- name: GetBillingSubjectByWorkspace :one
SELECT * FROM billing_subjects WHERE workspace_id = $1;

-- name: GetBillingSubjectByID :one
SELECT * FROM billing_subjects WHERE id = $1;

-- name: UpsertBillingSubject :one
INSERT INTO billing_subjects (subject_type, workspace_id, owner_user_id, billing_name, billing_email)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (workspace_id) DO UPDATE SET updated_at = billing_subjects.updated_at
RETURNING *;

-- name: TransferBillingSubjectOwner :one
UPDATE billing_subjects
SET owner_user_id = $2,
    billing_name = $3,
    billing_email = $4,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: GetSubscriptionBySubject :one
SELECT * FROM subscriptions WHERE billing_subject_id = $1;

-- name: GetSubscriptionForUpdate :one
SELECT * FROM subscriptions WHERE billing_subject_id = $1 FOR UPDATE;

-- name: CreateSubscription :one
INSERT INTO subscriptions (
    billing_subject_id, plan_version_id, state, billing_interval, paid_through_at, state_reason
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateSubscriptionState :one
UPDATE subscriptions
SET plan_version_id = $2,
    state = $3,
    billing_interval = $4,
    paid_through_at = $5,
    grace_ends_at = $6,
    cancel_at_period_end = $7,
    cancelled_at = $8,
    provider_sub_ref = $9,
    entitlement_revision = entitlement_revision + 1,
    state_reason = $10,
    last_event_at = COALESCE($11, last_event_at),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ListActiveAddonsBySubject :many
SELECT a.*, pv.plan_code, pv.addon_type, pv.display_name
FROM add_on_instances a
JOIN plan_versions pv ON pv.id = a.addon_plan_version_id
WHERE a.billing_subject_id = $1
  AND a.state = 'active'
  AND (a.expires_at IS NULL OR a.expires_at > now())
ORDER BY a.id ASC;

-- name: CreateAddonInstance :one
INSERT INTO add_on_instances (
    billing_subject_id, addon_plan_version_id, quantity, is_recurring, state, expires_at, idempotency_key
) VALUES ($1, $2, $3, $4, 'active', $5, $6)
ON CONFLICT (billing_subject_id, idempotency_key) DO UPDATE SET quantity = add_on_instances.quantity
RETURNING *;

-- name: ListActiveEntitlementOverrides :many
SELECT *
FROM entitlement_overrides
WHERE billing_subject_id = $1
  AND effective_from <= now()
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY priority ASC, id ASC;

-- name: CreateEntitlementOverride :one
INSERT INTO entitlement_overrides (
    billing_subject_id, feature_key, grant_source, grant_version, cohort,
    bool_value, int_value, text_value, priority, reason, issuer_user_id, audit_ref, expires_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: CreateSubscriptionChange :one
INSERT INTO subscription_changes (
    billing_subject_id, subscription_id, source_plan_version_id, target_plan_version_id,
    quote_snapshot, status, effective_at, actor_user_id, idempotency_key
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (billing_subject_id, idempotency_key) DO UPDATE SET status = subscription_changes.status
RETURNING *;

-- name: UpsertAndLockUsageCounter :one
INSERT INTO usage_counters (billing_subject_id, feature_key, period_start, period_end)
VALUES ($1, $2, $3, $4)
ON CONFLICT (billing_subject_id, feature_key, period_start) DO UPDATE SET updated_at = now()
RETURNING *;

-- name: GetUsageCounterForUpdate :one
SELECT * FROM usage_counters
WHERE billing_subject_id = $1 AND feature_key = $2 AND period_start = $3
FOR UPDATE;

-- name: ListUsageCountersBySubject :many
SELECT * FROM usage_counters
WHERE billing_subject_id = $1 AND period_end >= now()
ORDER BY feature_key ASC;

-- name: AddUsageReservationUnits :one
UPDATE usage_counters
SET reserved = reserved + $2,
    revision = revision + 1,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ConsumeUsageCounterUnits :one
UPDATE usage_counters
SET reserved = GREATEST(reserved - $2, 0),
    consumed = consumed + $2,
    revision = revision + 1,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ReleaseUsageCounterUnits :one
UPDATE usage_counters
SET reserved = GREATEST(reserved - $2, 0),
    revision = revision + 1,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: GetUsageReservationByIdemp :one
SELECT * FROM usage_reservations WHERE billing_subject_id = $1 AND idempotency_key = $2;

-- name: CreateUsageReservation :one
INSERT INTO usage_reservations (
    usage_counter_id, billing_subject_id, feature_key, command_type, idempotency_key, units, status, expires_at
) VALUES ($1, $2, $3, $4, $5, $6, 'reserved', $7)
RETURNING *;

-- name: SettleUsageReservation :one
UPDATE usage_reservations
SET status = $3,
    settled_at = now(),
    terminal_reason = $4
WHERE id = $1 AND billing_subject_id = $2 AND status = 'reserved'
RETURNING *;

-- name: ListExpiredUsageReservations :many
SELECT * FROM usage_reservations
WHERE status = 'reserved' AND expires_at < now()
ORDER BY id ASC
LIMIT 100;

-- name: GetCheckoutIntentByIdemp :one
SELECT * FROM checkout_intents WHERE billing_subject_id = $1 AND idempotency_key = $2;

-- name: GetCheckoutIntentByID :one
SELECT * FROM checkout_intents WHERE id = $1;

-- name: GetCheckoutIntentByReference :one
SELECT * FROM checkout_intents WHERE reference = $1;

-- name: CreateCheckoutIntent :one
INSERT INTO checkout_intents (
    billing_subject_id, plan_version_id, reference, amount_minor, currency,
    status, provider, provider_access_code, authorization_url, idempotency_key, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, 'paystack', $7, $8, $9, $10)
RETURNING *;

-- name: UpdateCheckoutIntentStatus :one
UPDATE checkout_intents
SET status = $2,
    verified_at = COALESCE($3, verified_at)
WHERE id = $1
RETURNING *;

-- name: CreateBillingTransaction :one
INSERT INTO billing_transactions (
    billing_subject_id, subscription_id, checkout_intent_id, tx_type, amount_minor, tax_minor, currency, status, provider_ref, idempotency_key
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (billing_subject_id, idempotency_key) DO UPDATE SET status = billing_transactions.status
RETURNING *;

-- name: GetBillingTransactionByID :one
SELECT * FROM billing_transactions WHERE id = $1 AND billing_subject_id = $2;

-- name: ListBillingTransactionsBySubject :many
SELECT * FROM billing_transactions
WHERE billing_subject_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: CreateProviderEvent :one
INSERT INTO provider_events (
    provider, event_id, event_type, provider_ref, signature_valid, event_occurred_at, processing_state, redacted_summary
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (provider, event_id) DO NOTHING
RETURNING *;

-- name: UpdateProviderEventState :exec
UPDATE provider_events
SET processing_state = $2,
    error_message = $3,
    processed_at = now()
WHERE id = $1;

-- name: CreateBillingDocument :one
INSERT INTO billing_documents (
    billing_subject_id, billing_transaction_id, document_number, document_type, currency,
    subtotal_minor, tax_minor, total_minor, service_period, status, content_text
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'issued', $10)
RETURNING *;

-- name: ListBillingDocumentsBySubject :many
SELECT * FROM billing_documents
WHERE billing_subject_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: GetBillingDocumentByID :one
SELECT * FROM billing_documents WHERE id = $1;

-- name: SumSucceededRefundsForTx :one
SELECT COALESCE(SUM(amount_minor), 0)::bigint
FROM refunds
WHERE billing_transaction_id = $1 AND status IN ('pending', 'succeeded');

-- name: CreateRefund :one
INSERT INTO refunds (
    billing_transaction_id, billing_subject_id, amount_minor, currency, reason, status, provider_refund_ref, idempotency_key, requested_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (billing_subject_id, idempotency_key) DO UPDATE SET status = refunds.status
RETURNING *;

-- name: UpsertChargebackReview :one
INSERT INTO chargeback_reviews (
    billing_transaction_id, billing_subject_id, provider_dispute_ref, amount_minor, currency, status, evidence_due_at
) VALUES ($1, $2, $3, $4, $5, 'open', $6)
ON CONFLICT (provider_dispute_ref) DO UPDATE SET updated_at = now()
RETURNING *;

-- name: ResolveChargebackReview :one
UPDATE chargeback_reviews
SET status = $2,
    resolution_notes = $3,
    resolved_by_user_id = $4,
    updated_at = now()
WHERE id = $1 AND billing_subject_id = $5
RETURNING *;

-- name: CreateBillingReconciliationRun :one
INSERT INTO billing_reconciliation_runs (status, checked_count, mismatch_count, summary)
VALUES ($1, $2, $3, $4)
RETURNING *;
