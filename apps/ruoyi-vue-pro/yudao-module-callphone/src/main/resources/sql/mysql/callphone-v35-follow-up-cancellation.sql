CREATE TABLE IF NOT EXISTS `cp_follow_up_task_event` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `task_id` bigint NOT NULL,
  `actor_user_id` bigint NOT NULL,
  `event_type` varchar(32) NOT NULL,
  `from_status` varchar(16) NOT NULL,
  `to_status` varchar(16) NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_followup_event_tenant_task_time` (`tenant_id`,`task_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 跟进事项状态审计';

SET @callphone_followup_id := (SELECT `id` FROM `system_menu` WHERE `permission`='callphone:followup:list' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_followup_id := (SELECT `parent_id` FROM `system_menu` WHERE `id`=@callphone_followup_id AND `deleted`=b'0');
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '跟进事项取消','callphone:followup:cancel',3,4,@callphone_followup_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_followup_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:followup:cancel' AND `deleted`=b'0');
