ALTER TABLE storefront_orders DROP CONSTRAINT IF EXISTS storefront_orders_fulfilment_status_check;
ALTER TABLE storefront_orders ADD CONSTRAINT storefront_orders_fulfilment_status_check
    CHECK (fulfilment_status IN ('unreserved', 'reserved', 'packed', 'partially_fulfilled', 'fulfilled', 'returned'));
