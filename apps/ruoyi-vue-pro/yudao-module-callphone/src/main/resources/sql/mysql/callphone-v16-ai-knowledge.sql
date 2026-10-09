-- Customer-owned knowledge bases and encrypted text chunks for explicitly authorized AI retrieval.
CREATE TABLE IF NOT EXISTS `cp_knowledge_base` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `name` varchar(80) NOT NULL,
  `description` varchar(300) NOT NULL DEFAULT '',
  `visibility` varchar(16) NOT NULL DEFAULT 'workspace',
  `visible_department_ids_json` varchar(2000) NOT NULL DEFAULT '[]',
  `status` varchar(16) NOT NULL DEFAULT 'enabled',
  `document_count` int unsigned NOT NULL DEFAULT 0,
  `chunk_count` int unsigned NOT NULL DEFAULT 0,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  KEY `idx_cp_knowledge_base_tenant_status_time` (`tenant_id`,`status`,`update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 本地知识库';

CREATE TABLE IF NOT EXISTS `cp_knowledge_document` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `knowledge_base_id` bigint NOT NULL,
  `source_name` varchar(180) NOT NULL,
  `storage_url` varchar(1024) NOT NULL,
  `content_type` varchar(100) NOT NULL DEFAULT 'text/plain; charset=utf-8',
  `byte_size` bigint unsigned NOT NULL,
  `checksum` char(64) NOT NULL,
  `parse_status` varchar(16) NOT NULL DEFAULT 'ready',
  `chunk_count` int unsigned NOT NULL DEFAULT 0,
  `retry_count` int unsigned NOT NULL DEFAULT 0,
  `error_message` varchar(500) DEFAULT NULL,
  `content_ciphertext` mediumtext NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_knowledge_doc_tenant_base_checksum` (`tenant_id`,`knowledge_base_id`,`checksum`),
  KEY `idx_cp_knowledge_doc_tenant_base_time` (`tenant_id`,`knowledge_base_id`,`create_time`),
  KEY `idx_cp_knowledge_doc_tenant_status` (`tenant_id`,`parse_status`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 本地知识库文档';

CREATE TABLE IF NOT EXISTS `cp_knowledge_chunk` (
  `id` bigint NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT 0,
  `knowledge_base_id` bigint NOT NULL,
  `document_id` bigint NOT NULL,
  `chunk_no` int unsigned NOT NULL,
  `char_count` int unsigned NOT NULL,
  `content_ciphertext` text NOT NULL,
  `creator` varchar(64) DEFAULT '',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updater` varchar(64) DEFAULT '',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted` bit(1) NOT NULL DEFAULT b'0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_knowledge_chunk_tenant_document_no` (`tenant_id`,`document_id`,`chunk_no`),
  KEY `idx_cp_knowledge_chunk_tenant_base` (`tenant_id`,`knowledge_base_id`,`document_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Call Phone 本地加密检索切片';
