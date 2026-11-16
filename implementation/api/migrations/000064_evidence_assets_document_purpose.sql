-- Migration 000064: allow evidence_assets for documents (procurement & sales files)
ALTER TABLE evidence_assets
    ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'money_record'
    CONSTRAINT evidence_assets_purpose_check CHECK (purpose IN ('money_record', 'document'));

ALTER TABLE evidence_assets
    DROP CONSTRAINT IF EXISTS evidence_assets_target_check;

ALTER TABLE evidence_assets
    ADD CONSTRAINT evidence_assets_target_check
    CHECK (draft_id IS NOT NULL OR money_record_id IS NOT NULL OR purpose = 'document');
