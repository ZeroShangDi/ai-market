ALTER TABLE cp_call_dispatch
  MODIFY COLUMN customer_id bigint DEFAULT NULL,
  ADD COLUMN lead_id bigint DEFAULT NULL AFTER customer_id,
  ADD COLUMN next_follow_up_at datetime(3) DEFAULT NULL AFTER request_note,
  ADD KEY idx_cp_dispatch_tenant_lead_time (tenant_id, lead_id, create_time);

ALTER TABLE cp_call_record
  MODIFY COLUMN customer_id bigint DEFAULT NULL,
  ADD COLUMN lead_id bigint DEFAULT NULL AFTER customer_id,
  ADD KEY idx_cp_call_record_tenant_lead_started (tenant_id, lead_id, started_at);

ALTER TABLE cp_lead_activity
  ADD UNIQUE KEY uk_cp_lead_activity_tenant_call (tenant_id, call_record_id);
