CREATE TABLE IF NOT EXISTS `cp_customer_stage_event` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `customer_id` bigint NOT NULL,
  `from_stage` varchar(32) DEFAULT NULL,
  `to_stage` varchar(32) NOT NULL,
  `changed_by` bigint NOT NULL,
  `changed_at` datetime(3) NOT NULL,
  `source` varchar(24) NOT NULL DEFAULT 'customer_edit',
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_customer_stage_event_actor_time` (`tenant_id`,`changed_by`,`changed_at`,`id`),
  KEY `idx_cp_customer_stage_event_customer_time` (`tenant_id`,`customer_id`,`changed_at`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 客户阶段变更审计';
