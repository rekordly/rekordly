-- Blueprint 03: editable capture drafts, immutable confirmed source records,
-- typed links/parts, and private financial-evidence metadata.

-- A previous untracked local prototype used this table name for a different
-- schema. Preserve that developer data rather than dropping it, then create
-- the canonical Blueprint 03 source table below. Fresh environments skip this.
DO $$
BEGIN
    IF to_regclass('public.money_records') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'money_records'
             AND column_name = 'transaction_id'
       ) THEN
        ALTER TABLE money_records RENAME TO legacy_money_records;
        ALTER INDEX IF EXISTS money_records_workspace_date_idx RENAME TO legacy_money_records_workspace_date_idx;
    END IF;
END $$;

CREATE TABLE money_record_drafts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    state TEXT NOT NULL DEFAULT 'saved' CONSTRAINT money_record_drafts_state_check
        CHECK (state IN ('saved', 'needs_review', 'confirming', 'confirmed', 'failed', 'discarded')),
    version INTEGER NOT NULL DEFAULT 1 CONSTRAINT money_record_drafts_version_check CHECK (version > 0),
    schema_version INTEGER NOT NULL DEFAULT 1 CONSTRAINT money_record_drafts_schema_version_check CHECK (schema_version > 0),
    entry_method TEXT NOT NULL DEFAULT 'manual' CONSTRAINT money_record_drafts_entry_method_check
        CHECK (entry_method IN ('manual', 'ai_assisted', 'import', 'offline')),
    direction TEXT NOT NULL CONSTRAINT money_record_drafts_direction_check
        CHECK (direction IN ('money_in', 'money_out', 'transfer', 'adjustment')),
    scope_type TEXT NOT NULL CONSTRAINT money_record_drafts_scope_type_check
        CHECK (scope_type IN ('personal', 'business', 'mixed', 'transfer')),
    purpose TEXT NOT NULL DEFAULT 'not_yet_known',
    amount_minor BIGINT NOT NULL CONSTRAINT money_record_drafts_amount_check CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL CONSTRAINT money_record_drafts_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL CONSTRAINT money_record_drafts_exponent_check CHECK (currency_exponent BETWEEN 0 AND 4),
    effective_date DATE NOT NULL,
    money_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    destination_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    category_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT,
    counterparty_id BIGINT REFERENCES counterparties(id) ON DELETE RESTRICT,
    counterparty_name TEXT,
    description TEXT,
    reference TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb CONSTRAINT money_record_drafts_tags_array_check CHECK (jsonb_typeof(tags) = 'array'),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb CONSTRAINT money_record_drafts_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
    ai_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CONSTRAINT money_record_drafts_ai_metadata_object_check CHECK (jsonb_typeof(ai_metadata) = 'object'),
    client_command_id TEXT,
    expires_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    discarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT money_record_drafts_transfer_accounts_check CHECK (
        direction <> 'transfer' OR destination_account_id IS NULL OR destination_account_id <> money_account_id
    ),
    CONSTRAINT money_record_drafts_confirmed_state_check CHECK (
        (state = 'confirmed' AND confirmed_at IS NOT NULL) OR state <> 'confirmed'
    ),
    CONSTRAINT money_record_drafts_discarded_state_check CHECK (
        (state = 'discarded' AND discarded_at IS NOT NULL) OR state <> 'discarded'
    )
);
CREATE INDEX money_record_drafts_workspace_state_updated_idx ON money_record_drafts (workspace_id, state, updated_at DESC, id DESC);
CREATE INDEX money_record_drafts_owner_updated_idx ON money_record_drafts (created_by_user_id, updated_at DESC, id DESC);
CREATE UNIQUE INDEX money_record_drafts_workspace_client_command_uidx ON money_record_drafts (workspace_id, client_command_id)
    WHERE client_command_id IS NOT NULL;

CREATE TABLE money_record_draft_links (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    draft_id BIGINT NOT NULL REFERENCES money_record_drafts(id) ON DELETE RESTRICT,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CONSTRAINT money_record_draft_links_type_check CHECK (
        link_type IN ('sale', 'purchase', 'invoice', 'supplier_bill', 'loan', 'tax_period', 'purchase_order', 'transfer', 'other')
    ),
    linked_record_id BIGINT NOT NULL,
    allocated_amount_minor BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CONSTRAINT money_record_draft_links_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT money_record_draft_links_amount_check CHECK (allocated_amount_minor IS NULL OR allocated_amount_minor > 0),
    CONSTRAINT money_record_draft_links_unique UNIQUE (draft_id, link_type, linked_record_id)
);
CREATE INDEX money_record_draft_links_workspace_lookup_idx ON money_record_draft_links (workspace_id, link_type, linked_record_id);

CREATE TABLE money_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    draft_id BIGINT REFERENCES money_record_drafts(id) ON DELETE RESTRICT,
    transaction_id BIGINT UNIQUE REFERENCES money_transactions(id) ON DELETE RESTRICT,
    direction TEXT NOT NULL CONSTRAINT money_records_direction_check
        CHECK (direction IN ('money_in', 'money_out', 'transfer', 'adjustment')),
    scope_type TEXT NOT NULL CONSTRAINT money_records_scope_type_check
        CHECK (scope_type IN ('personal', 'business', 'mixed', 'transfer')),
    purpose TEXT NOT NULL,
    entry_method TEXT NOT NULL CONSTRAINT money_records_entry_method_check
        CHECK (entry_method IN ('manual', 'ai_assisted', 'import', 'offline')),
    status TEXT NOT NULL DEFAULT 'confirmed' CONSTRAINT money_records_status_check
        CHECK (status IN ('confirmed', 'reversed')),
    amount_minor BIGINT NOT NULL CONSTRAINT money_records_amount_check CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL CONSTRAINT money_records_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL CONSTRAINT money_records_exponent_check CHECK (currency_exponent BETWEEN 0 AND 4),
    effective_date DATE NOT NULL,
    money_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    destination_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    category_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT,
    counterparty_id BIGINT REFERENCES counterparties(id) ON DELETE RESTRICT,
    counterparty_name TEXT,
    description TEXT,
    reference TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    confirmed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reversed_at TIMESTAMPTZ,
    reversal_record_id BIGINT REFERENCES money_records(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT money_records_transfer_accounts_check CHECK (
        direction <> 'transfer' OR destination_account_id IS NULL OR destination_account_id <> money_account_id
    )
);
CREATE UNIQUE INDEX money_records_draft_uidx ON money_records (draft_id) WHERE draft_id IS NOT NULL;
CREATE INDEX money_records_workspace_date_idx ON money_records (workspace_id, effective_date DESC, id DESC);
CREATE INDEX money_records_workspace_status_idx ON money_records (workspace_id, status, id DESC);

ALTER TABLE money_record_drafts
    ADD COLUMN confirmed_record_id BIGINT REFERENCES money_records(id) ON DELETE RESTRICT;

CREATE TABLE money_record_parts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    money_record_id BIGINT NOT NULL REFERENCES money_records(id) ON DELETE RESTRICT,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    amount_minor BIGINT NOT NULL CONSTRAINT money_record_parts_amount_check CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL CONSTRAINT money_record_parts_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    purpose TEXT NOT NULL,
    category_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT,
    transaction_id BIGINT REFERENCES money_transactions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX money_record_parts_record_idx ON money_record_parts (money_record_id, id);
CREATE INDEX money_record_parts_workspace_idx ON money_record_parts (workspace_id, id);

CREATE TABLE money_record_links (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    money_record_id BIGINT NOT NULL REFERENCES money_records(id) ON DELETE RESTRICT,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CONSTRAINT money_record_links_type_check CHECK (
        link_type IN ('sale', 'purchase', 'invoice', 'supplier_bill', 'loan', 'tax_period', 'purchase_order', 'transfer', 'other')
    ),
    linked_record_id BIGINT NOT NULL,
    allocated_amount_minor BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CONSTRAINT money_record_links_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT money_record_links_amount_check CHECK (allocated_amount_minor IS NULL OR allocated_amount_minor > 0),
    CONSTRAINT money_record_links_unique UNIQUE (money_record_id, link_type, linked_record_id)
);
CREATE INDEX money_record_links_workspace_lookup_idx ON money_record_links (workspace_id, link_type, linked_record_id);

CREATE TABLE evidence_assets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    draft_id BIGINT REFERENCES money_record_drafts(id) ON DELETE RESTRICT,
    money_record_id BIGINT REFERENCES money_records(id) ON DELETE RESTRICT,
    uploaded_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    storage_provider TEXT NOT NULL DEFAULT 'cloudinary' CONSTRAINT evidence_assets_provider_check CHECK (storage_provider IN ('cloudinary', 's3_compatible')),
    asset_id TEXT NOT NULL,
    delivery_type TEXT NOT NULL DEFAULT 'authenticated' CONSTRAINT evidence_assets_delivery_check CHECK (delivery_type IN ('authenticated', 'private')),
    original_file_name TEXT NOT NULL,
    byte_size BIGINT NOT NULL CONSTRAINT evidence_assets_size_check CHECK (byte_size > 0),
    mime_type TEXT NOT NULL,
    sha256_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT evidence_assets_status_check CHECK (status IN ('pending', 'verified', 'quarantined', 'failed', 'deleted')),
    retention_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT evidence_assets_target_check CHECK (draft_id IS NOT NULL OR money_record_id IS NOT NULL)
);
CREATE UNIQUE INDEX evidence_assets_provider_asset_uidx ON evidence_assets (storage_provider, asset_id);
CREATE INDEX evidence_assets_workspace_draft_idx ON evidence_assets (workspace_id, draft_id, id);
CREATE INDEX evidence_assets_workspace_record_idx ON evidence_assets (workspace_id, money_record_id, id);
