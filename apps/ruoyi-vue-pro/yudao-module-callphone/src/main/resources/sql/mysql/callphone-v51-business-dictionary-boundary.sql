-- Give the Call Phone dictionary page its own permissions. The adapter still
-- stores values in Yudao's shared dictionaries but rejects every non-callphone_* type.
SET @callphone_business_dictionaries_id := (
  SELECT `id`
  FROM `system_menu`
  WHERE `path`='business-dictionaries'
    AND `component_name`='CallPhoneBusinessDictionaries'
    AND `deleted`=b'0'
  ORDER BY `id`
  LIMIT 1
);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT permission_name,permission_code,3,permission_sort,@callphone_business_dictionaries_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
FROM (
  SELECT '查询业务字典' AS permission_name,'callphone:dictionary:list' AS permission_code,1 AS permission_sort
  UNION ALL SELECT '管理业务字典','callphone:dictionary:manage',2
) permissions
WHERE @callphone_business_dictionaries_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `system_menu` m
    WHERE m.`permission`=permissions.permission_code AND m.`deleted`=b'0'
  );
