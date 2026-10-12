CREATE SEQUENCE ai_id START WITH 10001;
CREATE TABLE conversations (
  id BIGINT PRIMARY KEY, tenant_id VARCHAR(19) NOT NULL, user_id VARCHAR(19) NOT NULL,
  title_cipher CLOB NOT NULL, created_at VARCHAR(30) NOT NULL, updated_at VARCHAR(30) NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX conversations_owner ON conversations(tenant_id,user_id,updated_at,id);
CREATE TABLE messages (
  id BIGINT PRIMARY KEY, conversation_id BIGINT NOT NULL REFERENCES conversations(id),
  role VARCHAR(12) NOT NULL, content_cipher CLOB NOT NULL, status VARCHAR(12) NOT NULL,
  created_at VARCHAR(30) NOT NULL, request_id VARCHAR(36) NOT NULL, error_code VARCHAR(40)
);
CREATE INDEX messages_conversation ON messages(conversation_id,id);
CREATE TABLE requests (
  tenant_id VARCHAR(19) NOT NULL, user_id VARCHAR(19) NOT NULL, device_id VARCHAR(19) NOT NULL,
  request_id VARCHAR(36) NOT NULL, conversation_id BIGINT NOT NULL REFERENCES conversations(id),
  user_message_id BIGINT NOT NULL, assistant_message_id BIGINT NOT NULL,
  fingerprint VARCHAR(64) NOT NULL, status VARCHAR(12) NOT NULL, sequence_no INT NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0, output_tokens INT NOT NULL DEFAULT 0,
  created_at VARCHAR(30) NOT NULL, error_code VARCHAR(40),
  PRIMARY KEY(tenant_id,user_id,device_id,request_id)
);
CREATE INDEX requests_active ON requests(conversation_id,status);
CREATE TABLE conversation_creates (
  tenant_id VARCHAR(19) NOT NULL, user_id VARCHAR(19) NOT NULL, device_id VARCHAR(19) NOT NULL,
  request_id VARCHAR(36) NOT NULL, conversation_id BIGINT NOT NULL REFERENCES conversations(id),
  PRIMARY KEY(tenant_id,user_id,device_id,request_id)
);
