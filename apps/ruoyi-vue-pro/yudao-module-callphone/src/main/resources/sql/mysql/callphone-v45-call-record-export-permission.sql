-- The export is separately permissioned from viewing records. It contains no
-- customer name, full phone number, note, or other decrypted contact content.
SET @callphone_records_menu_id := (
  SELECT `parent_id`
  FROM `system_menu`
  WHERE `permission`='callphone:call:record:query' AND `deleted`=b'0'
  ORDER BY `id`
  LIMIT 1
);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '导出通话记录','callphone:call:record:export',3,4,@callphone_records_menu_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_records_menu_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `system_menu`
    WHERE `permission`='callphone:call:record:export' AND `deleted`=b'0'
  );
