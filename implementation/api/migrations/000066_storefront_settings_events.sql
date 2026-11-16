ALTER TABLE storefront_design_events DROP CONSTRAINT IF EXISTS storefront_design_events_event_type_check;
ALTER TABLE storefront_design_events ADD CONSTRAINT storefront_design_events_event_type_check
    CHECK (event_type IN ('draft_saved', 'published', 'discarded', 'settings_updated'));
