ALTER TABLE workspaces
ADD COLUMN cost_display_decimal_places INTEGER NOT NULL DEFAULT 2
CHECK (cost_display_decimal_places >= 0 AND cost_display_decimal_places <= 8);
