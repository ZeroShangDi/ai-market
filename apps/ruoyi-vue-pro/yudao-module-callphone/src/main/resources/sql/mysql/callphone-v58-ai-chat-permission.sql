-- New capability is granted explicitly by administrators; existing roles are not expanded.
SET @ai_parent := (SELECT id FROM system_menu WHERE path='ai' AND creator='callphone' AND deleted=b'0' ORDER BY id LIMIT 1);
INSERT INTO system_menu
(name,permission,type,sort,parent_id,path,icon,component,component_name,status,visible,keep_alive,always_show,creator,create_time,updater,update_time,deleted)
SELECT 'AI 文本对话','callphone:ai:chat',3,20,@ai_parent,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @ai_parent IS NOT NULL AND NOT EXISTS (SELECT 1 FROM system_menu WHERE permission='callphone:ai:chat' AND deleted=b'0');
