-- Per-row import identity makes a retried CSV safe after a lost client response.
ALTER TABLE cp_customer
  ADD COLUMN import_key varchar(80) DEFAULT NULL,
  ADD UNIQUE KEY uk_cp_customer_tenant_owner_import (tenant_id, owner_user_id, import_key);

SET @callphone_customer_page_id := (
  SELECT id FROM system_menu
  WHERE component_name = 'CallPhoneCustomers' AND deleted = b'0'
  ORDER BY id LIMIT 1
);
INSERT INTO system_menu
  (`name`,`permission`,`type`,`sort`,`parent_id`,`path`,`icon`,`component`,`component_name`,`status`,`visible`,`keep_alive`,`always_show`,`creator`,`create_time`,`updater`,`update_time`,`deleted`)
SELECT '客户批量导入','callphone:customer:import',3,4,@callphone_customer_page_id,'','','',NULL,0,b'0',b'1',b'1','callphone',CURRENT_TIMESTAMP,'callphone',CURRENT_TIMESTAMP,b'0'
WHERE @callphone_customer_page_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM system_menu WHERE permission='callphone:customer:import' AND deleted=b'0');
