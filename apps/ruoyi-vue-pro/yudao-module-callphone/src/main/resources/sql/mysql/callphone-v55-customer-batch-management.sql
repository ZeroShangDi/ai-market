-- Customer owner changes remain in the customer tenant data plane and are included in local backups.
CREATE TABLE IF NOT EXISTS `cp_customer_owner_change` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `customer_id` bigint NOT NULL,
  `from_owner_user_id` bigint DEFAULT NULL,
  `to_owner_user_id` bigint NOT NULL,
  `actor_user_id` bigint NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_customer_owner_change_customer` (`tenant_id`,`customer_id`,`create_time`,`id`),
  KEY `idx_cp_customer_owner_change_actor` (`tenant_id`,`actor_user_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 客户负责人变更审计';

SET @callphone_customer_list_id := (
  SELECT `id` FROM `system_menu`
  WHERE `component_name` = 'CallPhoneCustomers' AND `deleted` = b'0'
  ORDER BY `id` LIMIT 1
);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT `permission_name`,`permission_code`,3,`permission_sort`,@callphone_customer_list_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '批量分配客户' AS permission_name,'callphone:customer:assign' AS permission_code,5 AS permission_sort
  UNION ALL SELECT '批量维护客户标签','callphone:customer:tags',6
) p
WHERE @callphone_customer_list_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');

ALTER TABLE `cp_local_backup_job`
  ALTER COLUMN `schema_version` SET DEFAULT 55;
