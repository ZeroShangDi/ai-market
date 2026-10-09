-- PII-free public link redirects. Only aggregate click totals are retained;
-- no visitor ID, IP address, user agent, or lead details are collected here.
ALTER TABLE `cp_acquisition_marketing_link`
  ADD COLUMN `public_code` varchar(32) DEFAULT NULL COMMENT '随机公开跳转码' AFTER `id`,
  ADD COLUMN `click_count` bigint unsigned NOT NULL DEFAULT 0 COMMENT '累计跳转次数' AFTER `status`,
  ADD COLUMN `last_clicked_at` datetime(3) DEFAULT NULL COMMENT '最近一次跳转时间' AFTER `click_count`;

UPDATE `cp_acquisition_marketing_link`
SET `public_code` = LOWER(HEX(RANDOM_BYTES(16)))
WHERE `public_code` IS NULL;

ALTER TABLE `cp_acquisition_marketing_link`
  MODIFY COLUMN `public_code` varchar(32) NOT NULL COMMENT '随机公开跳转码',
  ADD UNIQUE KEY `uk_cp_acq_link_public_code` (`public_code`);
