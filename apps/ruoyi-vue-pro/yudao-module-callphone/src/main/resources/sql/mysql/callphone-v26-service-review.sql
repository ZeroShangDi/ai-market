-- Structured workflow sampling. This table stores no audio and no unencrypted review notes.
CREATE TABLE IF NOT EXISTS `cp_service_review` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `call_record_id` bigint NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `score` int NOT NULL,
  `review_status` varchar(24) NOT NULL,
  `identify_ok` bit(1) NOT NULL,
  `consent_ok` bit(1) NOT NULL,
  `need_captured` bit(1) NOT NULL,
  `result_accurate` bit(1) NOT NULL,
  `next_step_clear` bit(1) NOT NULL,
  `note_ciphertext` text DEFAULT NULL,
  `reviewer_id` bigint NOT NULL,
  `reviewed_at` datetime(3) NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_service_review_call` (`tenant_id`,`call_record_id`),
  KEY `idx_cp_service_review_owner_result` (`tenant_id`,`owner_user_id`,`review_status`,`reviewed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 通话服务流程质检';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_customers_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='customers' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '服务质检','',2,11,@callphone_customers_id,'service-review','ep:finished','callphone/customers/service-review/index','CallPhoneServiceReview',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_customers_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='service-review' AND `deleted`=b'0');
SET @callphone_service_review_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='service-review' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_service_review_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '服务质检查询' AS permission_name,'callphone:service:review:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '保存质检结果','callphone:service:review:save',2
) permissions
WHERE @callphone_service_review_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=permissions.permission_code AND m.`deleted`=b'0');
