-- Customer-local manual summaries for completed, owner-visible call records.
-- AI generation is intentionally not exposed until the protected core service is connected.
CREATE TABLE IF NOT EXISTS `cp_call_summary` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `call_record_id` bigint NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `summary_ciphertext` text NOT NULL,
  `customer_needs_ciphertext` text DEFAULT NULL,
  `objections_ciphertext` text DEFAULT NULL,
  `next_step_ciphertext` text DEFAULT NULL,
  `origin` varchar(16) NOT NULL DEFAULT 'manual',
  `review_status` varchar(16) NOT NULL DEFAULT 'draft',
  `version` int NOT NULL DEFAULT 1,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `reviewed_by` bigint DEFAULT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_call_summary_tenant_record` (`tenant_id`,`call_record_id`),
  KEY `idx_cp_call_summary_tenant_owner_status` (`tenant_id`,`owner_user_id`,`review_status`,`update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 客户侧加密通话总结';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_ai_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='ai' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '通话总结','',2,3,@callphone_ai_id,'summaries','ep:document','callphone/ai/summaries/index','CallPhoneAiSummaries',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_ai_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='summaries' AND `deleted`=b'0');

SET @callphone_ai_summaries_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='summaries' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT `permission_name`,`permission_code`,3,`permission_sort`,@callphone_ai_summaries_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '通话总结查询' AS permission_name,'callphone:ai:summary:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '通话总结编辑','callphone:ai:summary:edit',2
  UNION ALL SELECT '通话总结复核','callphone:ai:summary:review',3
) p
WHERE @callphone_ai_summaries_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');
