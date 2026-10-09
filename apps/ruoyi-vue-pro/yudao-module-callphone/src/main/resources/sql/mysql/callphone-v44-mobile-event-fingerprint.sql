-- Store a device-keyed fingerprint for mobile call completion idempotency.
-- The note itself is never copied into the event table.
SET @callphone_db := DATABASE();
SET @callphone_event_fingerprint_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@callphone_db
    AND table_name='cp_mobile_call_event'
    AND column_name='request_fingerprint'
);
SET @callphone_event_fingerprint_ddl := IF(
  @callphone_event_fingerprint_exists=0,
  'ALTER TABLE `cp_mobile_call_event` ADD COLUMN `request_fingerprint` char(64) DEFAULT NULL AFTER `event_type`',
  'SELECT 1'
);
PREPARE callphone_event_fingerprint_stmt FROM @callphone_event_fingerprint_ddl;
EXECUTE callphone_event_fingerprint_stmt;
DEALLOCATE PREPARE callphone_event_fingerprint_stmt;

ALTER TABLE `cp_local_backup_job`
  ALTER COLUMN `schema_version` SET DEFAULT 44;
