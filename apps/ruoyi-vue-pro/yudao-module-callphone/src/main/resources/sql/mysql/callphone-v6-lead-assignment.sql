-- Safe to rerun: creates assignment/recycle audit history if absent.
CREATE TABLE IF NOT EXISTS `cp_lead_assignment` (
  `id` bigint NOT NULL, `tenant_id` bigint NOT NULL DEFAULT 0, `lead_id` bigint NOT NULL,
  `from_user_id` bigint DEFAULT NULL, `to_user_id` bigint DEFAULT NULL, `actor_user_id` bigint NOT NULL,
  `action` varchar(16) NOT NULL, `reason` varchar(200) NOT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0', PRIMARY KEY (`id`),
  KEY `idx_cp_lead_assignment_lead` (`tenant_id`,`lead_id`,`create_time`),
  KEY `idx_cp_lead_assignment_actor` (`tenant_id`,`actor_user_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 线索分配流转记录';
