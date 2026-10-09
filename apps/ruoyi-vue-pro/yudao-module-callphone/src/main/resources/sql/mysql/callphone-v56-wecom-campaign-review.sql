SET @callphone_campaign_menu_id := (SELECT `id` FROM `system_menu` WHERE `parent_id`=(SELECT `id` FROM `system_menu` WHERE `parent_id`=(SELECT `id` FROM `system_menu` WHERE `parent_id`=0 AND `path`='/callphone' AND `deleted`=b'0' ORDER BY `id` LIMIT 1) AND `path`='customers' AND `deleted`=b'0' ORDER BY `id` LIMIT 1) AND `path`='wecom-campaigns' AND `deleted`=b'0' ORDER BY `id` LIMIT 1);
INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '审核企微运营活动','callphone:wecom:campaign:review',3,6,@callphone_campaign_menu_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_campaign_menu_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `system_menu` WHERE `permission`='callphone:wecom:campaign:review' AND `deleted`=b'0');
