-- Navigation-only migration: retain all existing menu IDs, components, permissions and button children.
START TRANSACTION;
INSERT IGNORE INTO system_menu(id,name,permission,type,sort,parent_id,path,icon,component,component_name,status,visible,keep_alive,always_show) VALUES
(920000,'运维中心','',1,25,0,'/operations','ep:monitor','','ContainerOperations',0,1,1,1),
(920001,'基础配置','',1,1,2,'base','ep:setting','','ContainerBaseSettings',0,1,1,1),
(920002,'认证中心','',1,2,2,'authentication','ep:key','','ContainerAuthentication',0,1,1,1);
UPDATE system_menu SET name='公共服务' WHERE id=2 AND name='基础设施' AND deleted=0;
UPDATE system_menu SET parent_id=920001,sort=1 WHERE id=10 AND parent_id=2 AND deleted=0;
UPDATE system_menu SET parent_id=920001,sort=2 WHERE id=9 AND parent_id=1 AND deleted=0;
UPDATE system_menu SET parent_id=920001,sort=3 WHERE id=271 AND parent_id=1 AND deleted=0;
UPDATE system_menu SET parent_id=920002,sort=1 WHERE id=201 AND parent_id=1 AND deleted=0;
UPDATE system_menu SET parent_id=920002,sort=2 WHERE id=529 AND parent_id=1 AND deleted=0;
UPDATE system_menu SET parent_id=920000,sort=1 WHERE id=88 AND parent_id=2 AND deleted=0;
UPDATE system_menu SET parent_id=920000,sort=2 WHERE id=773 AND parent_id=2 AND deleted=0;
UPDATE system_menu SET parent_id=920000,sort=3 WHERE id=772 AND parent_id=1 AND deleted=0;
UPDATE system_menu SET parent_id=920000,sort=4 WHERE id=910000 AND parent_id=2 AND deleted=0;
UPDATE system_menu SET parent_id=920000,sort=5 WHERE id=565 AND parent_id=2 AND deleted=0;
UPDATE system_menu SET sort=3 WHERE id=193 AND parent_id=2 AND sort=6 AND deleted=0;
UPDATE system_menu SET name='服务监控' WHERE id=16 AND name='Java 监控' AND deleted=0;
UPDATE system_menu SET name='数据库监控' WHERE id=15 AND name='MySQL 监控' AND deleted=0;
UPDATE system_menu SET name='缓存监控' WHERE id=17 AND name='Redis 监控' AND deleted=0;
UPDATE system_menu SET name='WebSocket 调试' WHERE id=565 AND name='WebSocket' AND deleted=0;
INSERT INTO system_role_menu(role_id,menu_id,tenant_id)
SELECT DISTINCT existing.role_id,920001,existing.tenant_id FROM system_role_menu existing
WHERE existing.deleted=0 AND existing.menu_id IN (10,9,271)
AND NOT EXISTS(SELECT 1 FROM system_role_menu granted WHERE granted.role_id=existing.role_id AND granted.menu_id=920001 AND granted.tenant_id=existing.tenant_id AND granted.deleted=0);
UPDATE system_tenant_package SET menu_ids=JSON_ARRAY_APPEND(menu_ids,'$',920001) WHERE deleted=0 AND JSON_VALID(menu_ids) AND NOT JSON_CONTAINS(menu_ids,'920001') AND (JSON_CONTAINS(menu_ids,'10') OR JSON_CONTAINS(menu_ids,'9') OR JSON_CONTAINS(menu_ids,'271'));
INSERT INTO system_role_menu(role_id,menu_id,tenant_id)
SELECT DISTINCT existing.role_id,920002,existing.tenant_id FROM system_role_menu existing
WHERE existing.deleted=0 AND existing.menu_id IN (201,529)
AND NOT EXISTS(SELECT 1 FROM system_role_menu granted WHERE granted.role_id=existing.role_id AND granted.menu_id=920002 AND granted.tenant_id=existing.tenant_id AND granted.deleted=0);
UPDATE system_tenant_package SET menu_ids=JSON_ARRAY_APPEND(menu_ids,'$',920002) WHERE deleted=0 AND JSON_VALID(menu_ids) AND NOT JSON_CONTAINS(menu_ids,'920002') AND (JSON_CONTAINS(menu_ids,'201') OR JSON_CONTAINS(menu_ids,'529'));
INSERT INTO system_role_menu(role_id,menu_id,tenant_id)
SELECT DISTINCT existing.role_id,2,existing.tenant_id FROM system_role_menu existing
WHERE existing.deleted=0 AND existing.menu_id IN (10,9,271,201,529)
AND NOT EXISTS(SELECT 1 FROM system_role_menu granted WHERE granted.role_id=existing.role_id AND granted.menu_id=2 AND granted.tenant_id=existing.tenant_id AND granted.deleted=0);
UPDATE system_tenant_package SET menu_ids=JSON_ARRAY_APPEND(menu_ids,'$',2) WHERE deleted=0 AND JSON_VALID(menu_ids) AND NOT JSON_CONTAINS(menu_ids,'2') AND (JSON_CONTAINS(menu_ids,'10') OR JSON_CONTAINS(menu_ids,'9') OR JSON_CONTAINS(menu_ids,'271') OR JSON_CONTAINS(menu_ids,'201') OR JSON_CONTAINS(menu_ids,'529'));
INSERT INTO system_role_menu(role_id,menu_id,tenant_id)
SELECT DISTINCT existing.role_id,920000,existing.tenant_id FROM system_role_menu existing
WHERE existing.deleted=0 AND existing.menu_id IN (88,773,772,910000,565)
AND NOT EXISTS(SELECT 1 FROM system_role_menu granted WHERE granted.role_id=existing.role_id AND granted.menu_id=920000 AND granted.tenant_id=existing.tenant_id AND granted.deleted=0);
UPDATE system_tenant_package SET menu_ids=JSON_ARRAY_APPEND(menu_ids,'$',920000) WHERE deleted=0 AND JSON_VALID(menu_ids) AND NOT JSON_CONTAINS(menu_ids,'920000') AND (JSON_CONTAINS(menu_ids,'88') OR JSON_CONTAINS(menu_ids,'773') OR JSON_CONTAINS(menu_ids,'772') OR JSON_CONTAINS(menu_ids,'910000') OR JSON_CONTAINS(menu_ids,'565'));
COMMIT;
