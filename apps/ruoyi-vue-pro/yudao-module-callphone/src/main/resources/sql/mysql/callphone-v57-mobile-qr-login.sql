-- One-time QR login proof; only its hash is stored.
SET @cp_qr_column_exists := (SELECT COUNT(*) FROM information_schema.columns
 WHERE table_schema=DATABASE() AND table_name='cp_desktop_pairing_code' AND column_name='login_secret_hash');
SET @cp_qr_ddl := IF(@cp_qr_column_exists=0,
 'ALTER TABLE cp_desktop_pairing_code ADD COLUMN login_secret_hash char(64) DEFAULT NULL', 'SELECT 1');
PREPARE cp_qr_stmt FROM @cp_qr_ddl;
EXECUTE cp_qr_stmt;
DEALLOCATE PREPARE cp_qr_stmt;
