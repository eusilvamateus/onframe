ALTER TABLE seller_credentials ADD COLUMN refresh_lock_id TEXT;
ALTER TABLE seller_credentials ADD COLUMN refresh_lock_expires_at INTEGER;
