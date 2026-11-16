-- Online storefront orders are represented in Sales once payment is complete.
-- name: GetStorefrontOrderByInvoiceForUpdate :one
SELECT * FROM storefront_orders
WHERE workspace_id = @workspace_id AND linked_invoice_id = @invoice_id
FOR UPDATE;

-- name: GetSaleByStorefrontOrder :one
SELECT * FROM sales
WHERE workspace_id = @workspace_id AND storefront_order_id = @storefront_order_id;

-- name: CreateStorefrontOrderSale :one
INSERT INTO sales (
    workspace_id, customer_id, customer_name, sale_date, total_amount_minor, paid_amount_minor,
    currency, currency_exponent, status, notes, reference, idempotency_key, created_by_user_id,
    source, storefront_order_id
) VALUES (
    @workspace_id, sqlc.narg('customer_id'), @customer_name, @sale_date, @total_amount_minor,
    @paid_amount_minor, @currency, @currency_exponent, 'paid', @notes, @reference,
    @idempotency_key, sqlc.narg('created_by_user_id'), 'online_store', @storefront_order_id
)
RETURNING *;

-- name: CreateStorefrontOrderSaleItem :one
INSERT INTO sale_items (workspace_id, sale_id, product_id, variant_id, description, quantity, unit_price_minor, amount_minor)
VALUES (@workspace_id, @sale_id, @product_id, @variant_id, @description, @quantity, @unit_price_minor, @amount_minor)
RETURNING *;

-- name: UpdateStorefrontOrderPaymentPaid :exec
UPDATE storefront_orders
SET payment_status = 'paid', updated_at = now()
WHERE workspace_id = @workspace_id AND id = @order_id;

-- name: GetStorefrontOrderSaleID :one
SELECT id FROM sales
WHERE workspace_id = @workspace_id AND storefront_order_id = @storefront_order_id;
