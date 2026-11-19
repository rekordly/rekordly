-- name: GetMerchantPayoutAccount :one
SELECT * FROM merchant_payout_accounts
WHERE workspace_id = $1 AND provider = $2;

-- name: ListMerchantPayoutAccounts :many
SELECT * FROM merchant_payout_accounts
WHERE workspace_id = $1
ORDER BY provider;

-- name: UpsertMerchantPayoutAccount :one
INSERT INTO merchant_payout_accounts (
    workspace_id, provider, bank_code, account_number_last4, account_name, subaccount_ref, status, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
ON CONFLICT (workspace_id, provider) DO UPDATE
SET bank_code = EXCLUDED.bank_code,
    account_number_last4 = EXCLUDED.account_number_last4,
    account_name = EXCLUDED.account_name,
    subaccount_ref = EXCLUDED.subaccount_ref,
    status = EXCLUDED.status,
    updated_at = now()
RETURNING *;

-- name: CreateStorefrontPaymentAttempt :one
INSERT INTO storefront_payment_attempts (
    workspace_id, order_id, provider, method, reference, amount_minor, fee_minor, commission_minor,
    virtual_account_number, bank_name, expires_at, status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
RETURNING *;

-- name: GetStorefrontPaymentAttemptByReference :one
SELECT * FROM storefront_payment_attempts
WHERE reference = $1;

-- name: GetStorefrontPaymentAttemptByReferenceForUpdate :one
SELECT * FROM storefront_payment_attempts
WHERE reference = $1
FOR UPDATE;

-- name: GetLatestPaymentAttemptByOrder :one
SELECT * FROM storefront_payment_attempts
WHERE workspace_id = $1 AND order_id = $2
ORDER BY id DESC
LIMIT 1;

-- name: GetPublicPaymentAttemptByOrder :one
SELECT * FROM storefront_payment_attempts
WHERE order_id = $1
ORDER BY id DESC
LIMIT 1;

-- name: UpdatePaymentAttemptStatus :one
UPDATE storefront_payment_attempts
SET status = $2,
    raw_event = COALESCE($3, raw_event),
    paid_at = CASE WHEN $2 = 'paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: InsertPaymentWebhookEvent :one
INSERT INTO payment_webhook_events (provider, event_id, outcome)
VALUES ($1, $2, $3)
ON CONFLICT (provider, event_id) DO NOTHING
RETURNING *;

-- name: GetPaymentWebhookEvent :one
SELECT * FROM payment_webhook_events
WHERE provider = $1 AND event_id = $2;

-- name: UpdateStorefrontPaymentSettings :one
UPDATE storefront_settings
SET payment_bank_transfer_enabled = $3,
    payment_card_enabled = $4,
    payment_manual_transfer_enabled = $5,
    payment_cod_enabled = $6,
    fee_bearer = $7,
    hold_payment_minutes = $8,
    hold_manual_transfer_hours = $9,
    hold_confirmation_hours = $10,
    hold_pickup_hours = $11,
    version = version + 1,
    updated_at = now()
WHERE workspace_id = $1 AND storefront_id = $2
RETURNING *;

-- name: UpdateStorefrontShipbubbleSettings :one
UPDATE storefront_settings
SET shipbubble_api_key = $3,
    shipbubble_strategy = $4,
    shipbubble_couriers = $5,
    default_weight_grams = $6,
    version = version + 1,
    updated_at = now()
WHERE workspace_id = $1 AND storefront_id = $2
RETURNING *;

-- name: UpdateStorefrontOrderHold :one
UPDATE storefront_orders
SET hold_type = $3,
    reservation_expires_at = $4,
    processing_fee_minor = $5,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: UpdateStorefrontOrderPaymentStatus :one
UPDATE storefront_orders
SET payment_status = $3,
    linked_sale_id = COALESCE($4, linked_sale_id),
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: UpdateStorefrontOrderPickupCode :one
UPDATE storefront_orders
SET pickup_code = $3,
    pickup_point_id = $4,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: UpdateStorefrontOrderCourier :one
UPDATE storefront_orders
SET courier_name = $3,
    courier_tracking_number = $4,
    courier_status = $5,
    courier_booking_error = $6,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: ListStorefrontPickupPoints :many
SELECT id, workspace_id, name, location_type, code, address, phone, is_default, is_active, is_pickup_point, pickup_note
FROM inventory_locations
WHERE workspace_id = $1 AND is_active = true AND is_pickup_point = true
ORDER BY name;

-- name: SetLocationPickupPoint :one
UPDATE inventory_locations
SET is_pickup_point = $3,
    pickup_note = $4,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: UpsertShopper :one
INSERT INTO shoppers (email, name, phone, last_seen_at)
VALUES (lower(btrim($1)), $2, $3, now())
ON CONFLICT (email) DO UPDATE
SET last_seen_at = now(),
    name = COALESCE(EXCLUDED.name, shoppers.name),
    phone = COALESCE(EXCLUDED.phone, shoppers.phone)
RETURNING *;

-- name: GetShopperByEmail :one
SELECT * FROM shoppers
WHERE lower(btrim(email)) = lower(btrim($1));

-- name: GetShopperByID :one
SELECT * FROM shoppers
WHERE id = $1;

-- name: CreateShopperLoginCode :one
INSERT INTO shopper_login_codes (shopper_email, code_hash, expires_at, ip_hash)
VALUES (lower(btrim($1)), $2, $3, $4)
RETURNING *;

-- name: GetLatestShopperLoginCode :one
SELECT * FROM shopper_login_codes
WHERE lower(btrim(shopper_email)) = lower(btrim($1))
ORDER BY expires_at DESC
LIMIT 1;

-- name: IncrementShopperLoginCodeAttempts :one
UPDATE shopper_login_codes
SET attempts = attempts + 1
WHERE id = $1
RETURNING *;

-- name: MarkShopperLoginCodeUsed :one
UPDATE shopper_login_codes
SET used_at = now()
WHERE id = $1
RETURNING *;

-- name: CreateShopperSession :one
INSERT INTO shopper_sessions (token_hash, shopper_id, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetShopperSession :one
SELECT s.*, sh.email AS shopper_email, sh.name AS shopper_name, sh.phone AS shopper_phone
FROM shopper_sessions s
JOIN shoppers sh ON sh.id = s.shopper_id
WHERE s.token_hash = $1 AND s.expires_at > now();

-- name: TouchShopperSession :exec
UPDATE shopper_sessions
SET last_seen_at = now()
WHERE token_hash = $1;

-- name: DeleteShopperSession :exec
DELETE FROM shopper_sessions
WHERE token_hash = $1;

-- name: UpdateOrderShopperID :exec
UPDATE storefront_orders
SET shopper_id = $2, updated_at = now()
WHERE workspace_id = $1 AND id = $3;

-- name: LinkOrdersToShopperByEmail :exec
UPDATE storefront_orders
SET shopper_id = $1, updated_at = now()
WHERE lower(btrim(customer_email)) = lower(btrim($2)) AND shopper_id IS NULL;

-- name: ListShopperOrders :many
SELECT o.*, sf.name AS storefront_name, sf.slug AS storefront_slug
FROM storefront_orders o
JOIN storefronts sf ON sf.id = o.storefront_id
WHERE o.shopper_id = $1
  AND (sqlc.narg('storefront_slug')::text IS NULL OR lower(btrim(sf.slug)) = lower(btrim(sqlc.narg('storefront_slug')::text)))
ORDER BY o.id DESC;

-- name: UpdateStorefrontOrderCheckoutMeta :one
UPDATE storefront_orders
SET hold_type = $3,
    reservation_expires_at = $4,
    processing_fee_minor = $5,
    pickup_code = $6,
    pickup_point_id = $7,
    public_token_enc = $8,
    rate_token = $9,
    courier_name = $10,
    courier_service_code = $11,
    courier_id = $12,
    commercial_status = $13,
    fulfilment_status = $14,
    payment_status = $15,
    shopper_id = COALESCE($16, shopper_id),
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: UpdateStorefrontOrderCourierFull :one
UPDATE storefront_orders
SET courier_name = COALESCE($3, courier_name),
    courier_tracking_number = $4,
    courier_status = $5,
    courier_booking_error = $6,
    courier_tracking_url = $7,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: GetStorefrontOrderByTrackingNumber :one
SELECT * FROM storefront_orders
WHERE courier_tracking_number = $1
LIMIT 1;

-- name: UpdateStorefrontManualBankDetails :one
UPDATE storefront_settings
SET manual_bank_name = $3,
    manual_bank_account_number = $4,
    manual_bank_account_name = $5,
    version = version + 1,
    updated_at = now()
WHERE workspace_id = $1 AND storefront_id = $2
RETURNING *;

-- name: GetStorefrontShippingRateCache :one
SELECT * FROM storefront_shipping_rate_cache
WHERE cache_key = $1 AND expires_at > now();

-- name: GetStorefrontShippingRateByToken :one
SELECT * FROM storefront_shipping_rate_cache
WHERE storefront_id = $1 AND request_token = $2 AND expires_at > now()
ORDER BY expires_at DESC
LIMIT 1;

-- name: UpsertStorefrontShippingRateCache :one
INSERT INTO storefront_shipping_rate_cache (
    cache_key, workspace_id, storefront_id, request_token, rates_json, expires_at
) VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (cache_key) DO UPDATE
SET request_token = EXCLUDED.request_token,
    rates_json = EXCLUDED.rates_json,
    expires_at = EXCLUDED.expires_at,
    created_at = now()
RETURNING *;

-- name: DeleteExpiredShippingRateCache :exec
DELETE FROM storefront_shipping_rate_cache
WHERE expires_at <= now();

-- name: CreateShopperLoginCodeWithLink :one
INSERT INTO shopper_login_codes (shopper_email, code_hash, link_token_hash, expires_at, ip_hash)
VALUES (lower(btrim($1)), $2, $3, $4, $5)
RETURNING *;

-- name: GetShopperLoginCodeByLinkHash :one
SELECT * FROM shopper_login_codes
WHERE link_token_hash = $1
ORDER BY created_at DESC
LIMIT 1;

-- name: UpdateShopperDetails :one
UPDATE shoppers
SET name = COALESCE($2, name),
    phone = COALESCE($3, phone),
    saved_addresses = COALESCE($4, saved_addresses),
    last_seen_at = now()
WHERE id = $1
RETURNING *;

-- name: CountRecentShopperCodesByEmail :one
SELECT count(*)::bigint FROM shopper_login_codes
WHERE lower(btrim(shopper_email)) = lower(btrim($1))
  AND created_at >= now() - interval '10 minutes';

-- name: CountRecentShopperCodesByIP :one
SELECT count(*)::bigint FROM shopper_login_codes
WHERE ip_hash = $1
  AND created_at >= now() - interval '10 minutes';

-- name: UpdateProductWeightGrams :exec
UPDATE products
SET weight_grams = $3, updated_at = now()
WHERE workspace_id = $1 AND id = $2;

-- name: UpdateProductVariantWeightGrams :exec
UPDATE product_variants
SET weight_grams = $3, updated_at = now()
WHERE workspace_id = $1 AND id = $2;

-- name: ListStorefrontProductWeights :many
SELECT sp.id AS storefront_product_id,
       sp.product_id,
       sp.variant_id,
       sp.public_title,
       sp.public_price_minor,
       p.weight_grams AS product_weight_grams,
       pv.weight_grams AS variant_weight_grams
FROM storefront_products sp
JOIN products p ON p.id = sp.product_id AND p.workspace_id = sp.workspace_id
LEFT JOIN product_variants pv ON pv.id = sp.variant_id AND pv.workspace_id = sp.workspace_id
WHERE sp.storefront_id = $1 AND sp.id = ANY($2::bigint[]);

-- name: UpdateStorefrontOrderPackedReady :one
UPDATE storefront_orders
SET fulfilment_status = 'packed',
    version = version + 1,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2 AND version = $3
  AND commercial_status = 'confirmed'
  AND fulfilment_status = 'reserved'
  AND delivery_method = 'pickup'
RETURNING *;
