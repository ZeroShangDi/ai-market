-- One-time migration after v12. Custom values are encrypted before persistence.
ALTER TABLE `cp_customer_field`
  ADD COLUMN `visible_role_codes_json` varchar(12000) DEFAULT NULL AFTER `list_visible`;

ALTER TABLE `cp_customer`
  ADD COLUMN `custom_fields_ciphertext` mediumtext DEFAULT NULL AFTER `tags`;
