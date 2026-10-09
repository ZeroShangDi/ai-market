-- Reuse Yudao's API access log store. The page itself adds no duplicate log table.
SET @callphone_root_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
SET @callphone_settings_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_root_id AND `path`='settings' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '诊断与日志','',2,12,@callphone_settings_id,'diagnostics','ep:monitor','callphone/system/diagnostics/index','CallPhoneDiagnostics',0,b'1',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_settings_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='diagnostics' AND `deleted`=b'0');
SET @callphone_diagnostics_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=@callphone_settings_id AND `path`='diagnostics' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '查看 Call Phone 诊断日志','callphone:diagnostics:view',3,1,@callphone_diagnostics_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_diagnostics_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:diagnostics:view' AND `deleted`=b'0');
