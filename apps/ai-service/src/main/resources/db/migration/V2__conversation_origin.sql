ALTER TABLE conversations ADD COLUMN source_type VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE conversations ADD COLUMN parent_id BIGINT;
CREATE INDEX conversations_source ON conversations(tenant_id,user_id,source_type,updated_at,id);
-- Before source metadata existed, voice transcripts wrote messages directly;
-- ordinary model turns always had a request record. Do not infer from titles.
UPDATE conversations SET source_type='voice'
WHERE EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=conversations.id)
  AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.conversation_id=conversations.id);
