-- name: CreateMixedMoneyGroup :one
INSERT INTO mixed_money_groups (
    actor_user_id, personal_workspace_id, business_workspace_id, paying_workspace_id,
    paying_money_account_id, currency, currency_exponent, total_amount_minor,
    personal_amount_minor, business_amount_minor, effective_date, description, reference
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: GetMixedMoneyGroup :one
SELECT * FROM mixed_money_groups
WHERE id = $1
  AND ($2 = personal_workspace_id OR $2 = business_workspace_id);

-- name: GetMixedMoneyGroupForUpdate :one
SELECT * FROM mixed_money_groups
WHERE id = $1
  AND ($2 = personal_workspace_id OR $2 = business_workspace_id)
FOR UPDATE;

-- name: CompleteMixedMoneyGroup :one
UPDATE mixed_money_groups
SET personal_money_record_id = $2,
    business_money_record_id = $3,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: CreateMixedMoneyReimbursement :one
INSERT INTO mixed_money_reimbursements (
    mixed_money_group_id, from_workspace_id, to_workspace_id, from_money_account_id,
    to_money_account_id, from_money_record_id, to_money_record_id, amount_minor,
    currency, effective_date, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: GetMixedMoneyReimbursementByID :one
SELECT r.*
FROM mixed_money_reimbursements r
JOIN mixed_money_groups g ON g.id = r.mixed_money_group_id
WHERE r.id = $1
  AND ($2 = g.personal_workspace_id OR $2 = g.business_workspace_id);

-- name: ApplyMixedMoneyReimbursement :one
UPDATE mixed_money_groups
SET reimbursed_amount_minor = reimbursed_amount_minor + $2,
    settlement_version = settlement_version + 1,
    status = CASE
        WHEN reimbursed_amount_minor + $2 = CASE
            WHEN paying_workspace_id = personal_workspace_id THEN business_amount_minor
            ELSE personal_amount_minor
        END THEN 'settled'
        ELSE 'open'
    END,
    updated_at = now()
WHERE id = $1
  AND status = 'open'
  AND settlement_version = $3
  AND reimbursed_amount_minor + $2 <= CASE
      WHEN paying_workspace_id = personal_workspace_id THEN business_amount_minor
      ELSE personal_amount_minor
  END
RETURNING *;

-- name: ListMixedMoneyReimbursements :many
SELECT * FROM mixed_money_reimbursements
WHERE mixed_money_group_id = $1
ORDER BY id ASC;
