-- Call Phone first visible leaf menu and API permissions.
-- Run after the upstream Yudao SQL has created system_menu.
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '客户','',1,30,0,'/callphone','ep:user-filled',NULL,NULL,0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0');

SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '拓客','',1,40,@callphone_root_id,'acquisition','ep:connection',NULL,NULL,0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='acquisition' AND `deleted`=b'0');
SET @callphone_acquisition_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='acquisition' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '平台渠道','',2,1,@callphone_acquisition_id,'channels','ep:connection','callphone/acquisition/channels/index','CallPhoneAcquisitionChannels',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_acquisition_id AND `path`='channels' AND `deleted`=b'0');
SET @callphone_acquisition_channels_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_acquisition_id AND `path`='channels' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_acquisition_channels_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '平台渠道查询' AS permission_name,'callphone:acquisition:channel:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '渠道配置管理','callphone:acquisition:channel:manage',2
) p
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT 'AI 助手','',1,80,@callphone_root_id,'ai','ep:magic-stick',NULL,NULL,0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='ai' AND `deleted`=b'0');
SET @callphone_ai_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='ai' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '话术助手','',2,1,@callphone_ai_id,'scripts','ep:chat-line-square','callphone/ai/scripts/index','CallPhoneAiScripts',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='scripts' AND `deleted`=b'0');
SET @callphone_ai_scripts_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='scripts' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '话术查询','callphone:ai:script:list',3,1,@callphone_ai_scripts_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:ai:script:list' AND `deleted`=b'0');
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '话术编辑','callphone:ai:script:edit',3,2,@callphone_ai_scripts_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:ai:script:edit' AND `deleted`=b'0');
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '话术发布','callphone:ai:script:publish',3,3,@callphone_ai_scripts_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:ai:script:publish' AND `deleted`=b'0');
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '话术使用','callphone:ai:script:use',3,4,@callphone_ai_scripts_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:ai:script:use' AND `deleted`=b'0');
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '知识库','',2,2,@callphone_ai_id,'knowledge','ep:collection','callphone/ai/knowledge/index','CallPhoneAiKnowledge',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='knowledge' AND `deleted`=b'0');
SET @callphone_ai_knowledge_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='knowledge' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_ai_knowledge_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '知识库查询' AS permission_name,'callphone:ai:knowledge:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '知识库管理','callphone:ai:knowledge:manage',2
  UNION ALL SELECT '文档上传','callphone:ai:knowledge:upload',3
  UNION ALL SELECT '文档重试解析','callphone:ai:knowledge:retry',4
) p
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT 'AI 使用记录','',2,6,@callphone_ai_id,'usage','ep:data-analysis','callphone/ai/usage/index','CallPhoneAiUsage',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='usage' AND `deleted`=b'0');
SET @callphone_ai_usage_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_ai_id AND `path`='usage' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT 'AI 使用记录查询','callphone:ai:usage:list',3,1,@callphone_ai_usage_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:ai:usage:list' AND `deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '电话沟通','',1,20,@callphone_root_id,'outbound','ep:phone',NULL,NULL,0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='outbound' AND `deleted`=b'0');

SET @callphone_outbound_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='outbound' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '通话记录','',2,1,@callphone_outbound_id,'records','ep:phone','callphone/outbound/records/index','CallPhoneOutboundRecords',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_outbound_id AND `path`='records' AND `deleted`=b'0');

SET @callphone_records_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_outbound_id AND `path`='records' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT `permission_name`,`permission_code`,3,`permission_sort`,@callphone_records_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '通话记录查询' AS permission_name,'callphone:call:record:query' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '客户候选查询','callphone:customer:query',2
  UNION ALL SELECT '发起外呼','callphone:call:dispatch:create',3
) p
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');


-- Device pairing is a Call Phone system-settings page at menu level three.
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '系统设置','',1,90,@callphone_root_id,'settings','ep:setting',NULL,NULL,0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='settings' AND `deleted`=b'0');

SET @callphone_settings_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='settings' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '成员管理','',2,1,@callphone_settings_id,'members','ep:user','callphone/system/members/index','CallPhoneMembers',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='members' AND `deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '团队与角色','',2,2,@callphone_settings_id,'teams-roles','ep:avatar','callphone/system/teams-roles/index','CallPhoneTeamsAndRoles',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='teams-roles' AND `deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '数据权限','',2,3,@callphone_settings_id,'data-permissions','ep:lock','callphone/system/data-permissions/index','CallPhoneDataPermissions',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='data-permissions' AND `deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '客户字段','',2,8,@callphone_settings_id,'customer-fields','ep:edit-pen','callphone/system/customer-fields/index','CallPhoneCustomerFields',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='customer-fields' AND `deleted`=b'0');
SET @callphone_customer_fields_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='customer-fields' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '客户字段配置查询','callphone:customer:field:list',3,1,@callphone_customer_fields_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:customer:field:list' AND `deleted`=b'0');
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '客户字段配置保存','callphone:customer:field:save',3,2,@callphone_customer_fields_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:customer:field:save' AND `deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '手机设备','',2,4,@callphone_settings_id,'phone-devices','ep:iphone','callphone/system/phone-devices/index','CallPhonePhoneDevices',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='phone-devices' AND `deleted`=b'0');
SET @callphone_phone_devices_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='phone-devices' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '业务字典','',2,6,@callphone_settings_id,'business-dictionaries','ep:notebook','callphone/system/dictionaries/index','CallPhoneBusinessDictionaries',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='business-dictionaries' AND `deleted`=b'0');
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '阶段与结果配置','',2,7,@callphone_settings_id,'phase-result-config','ep:setting','callphone/system/phase-result-config/index','CallPhonePhaseResultConfig',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='phase-result-config' AND `deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '电脑与配对','',2,5,@callphone_settings_id,'device-pairing','ep:connection','callphone/system/device-pairing/index','CallPhoneDevicePairing',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='device-pairing' AND `deleted`=b'0');

SET @callphone_device_pairing_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='device-pairing' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '配对设备管理','callphone:device:pair:manage',3,1,@callphone_device_pairing_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`='callphone:device:pair:manage' AND m.`deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '线索管理','',1,20,@callphone_root_id,'leads','ep:promotion',NULL,NULL,0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='leads' AND `deleted`=b'0');

SET @callphone_leads_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='leads' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '线索池','',2,1,@callphone_leads_id,'pool','ep:collection-tag','callphone/leads/pool/index','CallPhoneLeadPool',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_leads_id AND `path`='pool' AND `deleted`=b'0');

SET @callphone_lead_pool_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_leads_id AND `path`='pool' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT `permission_name`,`permission_code`,3,`permission_sort`,@callphone_lead_pool_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '线索查询' AS permission_name,'callphone:lead:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '线索新增','callphone:lead:create',2
  UNION ALL SELECT '领取线索','callphone:lead:claim',3
) p
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '转化记录','',2,4,@callphone_leads_id,'conversions','ep:switch','callphone/leads/conversions/index','CallPhoneLeadConversions',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_leads_id AND `path`='conversions' AND `deleted`=b'0');
SET @callphone_lead_conversions_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_leads_id AND `path`='conversions' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '线索转化查询','callphone:lead:convert',3,1,@callphone_lead_conversions_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`='callphone:lead:convert' AND m.`deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '分配与回收','',2,2,@callphone_leads_id,'assignment','ep:share','callphone/leads/assignment/index','CallPhoneLeadAssignment',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_leads_id AND `path`='assignment' AND `deleted`=b'0');

SET @callphone_lead_assignment_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_leads_id AND `path`='assignment' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT `permission_name`,`permission_code`,3,`permission_sort`,@callphone_lead_assignment_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
SELECT '线索分配查询' AS permission_name,'callphone:lead:assign' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '线索回收','callphone:lead:recycle',2
) p
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '线索跟进','',2,3,@callphone_leads_id,'follow-ups','ep:edit-pen','callphone/leads/follow-ups/index','CallPhoneLeadFollowUps',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_leads_id AND `path`='follow-ups' AND `deleted`=b'0');
SET @callphone_lead_followups_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_leads_id AND `path`='follow-ups' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '线索跟进记录','callphone:lead:follow',3,1,@callphone_lead_followups_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`='callphone:lead:follow' AND m.`deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '无效/重复归档','',2,5,@callphone_leads_id,'archives','ep:folder-delete','callphone/leads/archives/index','CallPhoneLeadArchives',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_leads_id AND `path`='archives' AND `deleted`=b'0');
SET @callphone_lead_archives_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_leads_id AND `path`='archives' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '线索归档管理','callphone:lead:archive',3,1,@callphone_lead_archives_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`='callphone:lead:archive' AND m.`deleted`=b'0');
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '恢复已归档线索','callphone:lead:restore',3,2,@callphone_lead_archives_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`='callphone:lead:restore' AND m.`deleted`=b'0');

-- Customer list page is also a third-level menu page. Detail/edit stay within the page dialog.
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '客户管理','',1,10,@callphone_root_id,'customers','ep:user',NULL,NULL,0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='customers' AND `deleted`=b'0');

SET @callphone_customers_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='customers' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '客户列表','',2,1,@callphone_customers_id,'list','ep:list','callphone/customers/index','CallPhoneCustomers',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='list' AND `deleted`=b'0');

SET @callphone_customer_list_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='list' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT `permission_name`,`permission_code`,3,`permission_sort`,@callphone_customer_list_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '客户查询' AS permission_name,'callphone:customer:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '客户新增或修改','callphone:customer:save',2
  UNION ALL SELECT '客户归档','callphone:customer:archive',3
) p
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '客户阶段','',2,3,@callphone_customers_id,'stages','ep:operation','callphone/customer-stages/index','CallPhoneCustomerStages',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='stages' AND `deleted`=b'0');

SET @callphone_customer_stages_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='stages' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT `permission_name`,`permission_code`,3,`permission_sort`,@callphone_customer_stages_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '客户阶段配置查询' AS permission_name,'callphone:customer:stage:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '客户阶段配置保存','callphone:customer:stage:save',2
) p
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '跟进事项','',2,2,@callphone_customers_id,'follow-up-tasks','ep:calendar','callphone/follow-up-tasks/index','CallPhoneFollowUpTasks',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='follow-up-tasks' AND `deleted`=b'0');

SET @callphone_followup_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_customers_id AND `path`='follow-up-tasks' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT `permission_name`,`permission_code`,3,`permission_sort`,@callphone_followup_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '跟进事项查询' AS permission_name,'callphone:followup:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '跟进事项新增或修改','callphone:followup:save',2
  UNION ALL SELECT '跟进事项完成','callphone:followup:complete',3
) p
WHERE NOT EXISTS (SELECT 1 FROM `system_menu` m WHERE m.`permission`=p.permission_code AND m.`deleted`=b'0');
