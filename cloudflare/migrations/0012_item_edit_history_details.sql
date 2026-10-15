ALTER TABLE item_edit_events ADD COLUMN operation TEXT;
ALTER TABLE item_edit_events ADD COLUMN details_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promotion_reconciliations ADD COLUMN history_before_json TEXT;
