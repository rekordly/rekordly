-- 000061_po_share_link_reuse.sql
-- Store raw_token on purchase_order_shares so active unexpired share links can be reused.

ALTER TABLE purchase_order_shares
    ADD COLUMN IF NOT EXISTS raw_token TEXT;
