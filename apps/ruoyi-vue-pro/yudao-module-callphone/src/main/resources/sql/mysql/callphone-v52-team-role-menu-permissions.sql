-- Keep Call Phone role-page administration inside the Call Phone permission boundary.
SET @callphone_team_roles_id := (
  SELECT `id`
  FROM `system_menu`
  WHERE `component_name`='CallPhoneTeamsAndRoles'
    AND `deleted`=b'0'
  ORDER BY `id`
  LIMIT 1
);

INSERT INTO `system_menu`
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '管理 Call Phone 页面权限','callphone:team:permissions:manage',3,1,@callphone_team_roles_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_team_roles_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `system_menu` m
    WHERE m.`permission`='callphone:team:permissions:manage' AND m.`deleted`=b'0'
  );
