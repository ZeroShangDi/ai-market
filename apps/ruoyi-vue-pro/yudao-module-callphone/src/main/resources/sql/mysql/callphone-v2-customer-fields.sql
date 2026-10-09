-- One-time upgrade for existing Call Phone databases from v1; do not execute twice.
ALTER TABLE `cp_customer`
  ADD COLUMN `stage` varchar(32) NOT NULL DEFAULT 'new' AFTER `phone_display`,
  ADD COLUMN `source` varchar(64) DEFAULT NULL AFTER `stage`,
  ADD COLUMN `tags` varchar(512) DEFAULT NULL AFTER `source`;
