-- Risk alerts and rule preferences are stored by the customer-side Call Phone module.
CREATE TABLE IF NOT EXISTS `cp_risk_rule` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `rule_code` varchar(40) NOT NULL,
  `name` varchar(80) NOT NULL,
  `description` varchar(500) NOT NULL,
  `enabled` bit(1) NOT NULL DEFAULT b'1',
  `threshold_days` int NOT NULL,
  `severity` varchar(12) NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_risk_rule_tenant_code` (`tenant_id`,`rule_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 租户风险预警规则';

CREATE TABLE IF NOT EXISTS `cp_risk_alert` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `rule_code` varchar(40) NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `customer_id` bigint NOT NULL,
  `source_type` varchar(24) NOT NULL,
  `source_id` bigint NOT NULL,
  `severity` varchar(12) NOT NULL,
  `status` varchar(12) NOT NULL DEFAULT 'open',
  `detail_ciphertext` text NOT NULL,
  `resolution_reason_ciphertext` text DEFAULT NULL,
  `resolver_id` bigint DEFAULT NULL,
  `resolved_at` datetime(3) DEFAULT NULL,
  `version` int NOT NULL DEFAULT 1,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_risk_alert_source_status` (`tenant_id`,`rule_code`,`source_type`,`source_id`,`status`),
  KEY `idx_cp_risk_alert_owner_status` (`tenant_id`,`owner_user_id`,`status`,`create_time`),
  KEY `idx_cp_risk_alert_owner_severity` (`tenant_id`,`owner_user_id`,`severity`,`status`),
  KEY `idx_cp_risk_alert_customer` (`tenant_id`,`customer_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 加密风险预警及处置记录';

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_customers_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='customers' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '风险预警','',2,10,@callphone_customers_id,'risk-alerts','ep:warning','callphone/customers/risk-alerts/index','CallPhoneRiskAlerts',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_customers_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='risk-alerts' AND `deleted`=b'0');
SET @callphone_risk_alerts_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='risk-alerts' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_risk_alerts_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '风险预警查询' AS permission_name,'callphone:risk:alert:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '扫描风险预警','callphone:risk:alert:scan',2
  UNION ALL SELECT '处置风险预警','callphone:risk:alert:resolve',3
  UNION ALL SELECT '管理风险规则','callphone:risk:rule:manage',4
) permissions
WHERE @callphone_risk_alerts_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=permissions.permission_code AND m.`deleted`=b'0');
