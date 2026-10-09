-- Historical code advanced the dispatch row to `completed` when the call ended.
-- Call completion belongs to cp_call_record; the dispatch remains accepted.
-- Preserve dispatches without an ended call record for manual investigation.
UPDATE `cp_call_dispatch` d
JOIN `cp_call_record` r
  ON r.`id` = d.`call_record_id`
 AND r.`tenant_id` = d.`tenant_id`
 AND r.`deleted` = b'0'
SET d.`status` = 'accepted'
WHERE d.`status` = 'completed'
  AND r.`status` = 'ended'
  AND d.`deleted` = b'0';
