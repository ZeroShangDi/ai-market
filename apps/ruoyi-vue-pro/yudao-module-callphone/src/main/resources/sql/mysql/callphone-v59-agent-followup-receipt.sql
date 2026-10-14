-- Apply before enabling Agent follow-up confirmation. The unique receipt and follow-up
-- are committed together, so a client retry or upstream receipt outage cannot repeat a write.
CREATE TABLE IF NOT EXISTS `cp_agent_followup_receipt` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `agent_task_id` varchar(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `customer_id` bigint NOT NULL,
  `follow_up_task_id` bigint NOT NULL,
  `creator` varchar(64) DEFAULT '', `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '', `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_agent_followup_receipt` (`tenant_id`,`owner_user_id`,`agent_task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 确认创建跟进事项幂等回执';
