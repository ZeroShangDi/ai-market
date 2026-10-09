-- Customer-local follow-up recommendations extracted from reviewed call-summary next steps.
-- This workflow is deterministic and does not claim to invoke the protected AI service.
CREATE TABLE IF NOT EXISTS `cp_ai_recommendation` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `call_record_id` bigint NOT NULL,
  `source_summary_id` bigint NOT NULL,
  `source_summary_version` int NOT NULL,
  `customer_id` bigint NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `source_summary_origin` varchar(16) NOT NULL,
  `content_ciphertext` text NOT NULL,
  `review_status` varchar(16) NOT NULL DEFAULT 'pending',
  `review_reason_ciphertext` text DEFAULT NULL,
  `reviewer_id` bigint DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `follow_up_task_id` bigint DEFAULT NULL,
  `due_at` datetime(3) NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_ai_recommendation_source_version` (`tenant_id`,`call_record_id`,`source_summary_version`),
  UNIQUE KEY `uk_cp_ai_recommendation_task` (`tenant_id`,`follow_up_task_id`),
  KEY `idx_cp_ai_recommendation_owner_status` (`tenant_id`,`owner_user_id`,`review_status`,`update_time`),
  KEY `idx_cp_ai_recommendation_customer` (`tenant_id`,`customer_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 客户侧加密跟进建议';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_ai_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='ai' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '跟进建议','',2,4,@callphone_ai_id,'recommendations','ep:promotion','callphone/ai/recommendations/index','CallPhoneAiFollowUpSuggestions',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_ai_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='recommendations' AND `deleted`=b'0');
SET @callphone_ai_recommendations_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='recommendations' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_ai_recommendations_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '跟进建议查询' AS permission_name,'callphone:ai:recommendation:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '提取跟进建议','callphone:ai:recommendation:prepare',2
  UNION ALL SELECT '编辑跟进建议','callphone:ai:recommendation:edit',3
  UNION ALL SELECT '采纳跟进建议','callphone:ai:recommendation:adopt',4
  UNION ALL SELECT '复核跟进建议','callphone:ai:recommendation:review',5
) p
WHERE @callphone_ai_recommendations_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');
