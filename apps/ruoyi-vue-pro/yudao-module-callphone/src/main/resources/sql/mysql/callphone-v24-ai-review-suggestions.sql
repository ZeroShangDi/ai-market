-- Customer-local AI output review queue; no model prompt or recording is stored here.
CREATE TABLE IF NOT EXISTS `cp_ai_review_suggestion` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `call_record_id` bigint NOT NULL,
  `customer_id` bigint NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `source_run_id` varchar(96) NOT NULL,
  `risk_level` varchar(12) NOT NULL,
  `suggestion_ciphertext` text NOT NULL,
  `evidence_ciphertext` text NOT NULL,
  `review_status` varchar(16) NOT NULL DEFAULT 'pending',
  `review_reason_ciphertext` text DEFAULT NULL,
  `reviewer_id` bigint DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `version` int NOT NULL DEFAULT 1,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_ai_review_source_run` (`tenant_id`,`source_run_id`),
  KEY `idx_cp_ai_review_owner_status` (`tenant_id`,`owner_user_id`,`review_status`,`create_time`),
  KEY `idx_cp_ai_review_owner_risk` (`tenant_id`,`owner_user_id`,`risk_level`,`review_status`),
  KEY `idx_cp_ai_review_call` (`tenant_id`,`call_record_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 客户侧加密 AI 建议复核队列';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_ai_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='ai' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '人工复核建议','',2,5,@callphone_ai_id,'ai-review-suggestions','ep:finished','callphone/ai/review-suggestions/index','CallPhoneAiReviewSuggestions',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_ai_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='ai-review-suggestions' AND `deleted`=b'0');
SET @callphone_ai_review_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='ai-review-suggestions' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_ai_review_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '复核建议查询' AS permission_name,'callphone:ai:review-suggestion:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '复核 AI 建议','callphone:ai:review-suggestion:review',2
) p
WHERE @callphone_ai_review_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');
