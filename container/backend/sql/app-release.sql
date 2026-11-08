-- Platform release registry. No user credentials, signing private keys or business login dependency.
CREATE TABLE IF NOT EXISTS infra_release_application (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 app_id VARCHAR(128) NOT NULL,
 package_name VARCHAR(128) NOT NULL,
 public_key TEXT NOT NULL,
 artifact_base_url VARCHAR(512) NOT NULL,
 creator VARCHAR(64) NOT NULL DEFAULT '',
 create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uk_release_app_id(app_id), UNIQUE KEY uk_release_package(package_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS infra_app_release (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 application_id BIGINT NOT NULL,
 architecture VARCHAR(32) NOT NULL,
 channel VARCHAR(32) NOT NULL,
 sequence BIGINT NOT NULL,
 version_code BIGINT NULL,
 version_name VARCHAR(64) NULL,
 notes TEXT NULL,
 issued_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 manifest MEDIUMTEXT NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
 creator VARCHAR(64) NOT NULL DEFAULT '',
 publisher VARCHAR(64) NULL,
 create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 published_at DATETIME NULL,
 UNIQUE KEY uk_release_sequence(application_id,architecture,channel,sequence),
 KEY idx_release_target(application_id,architecture,channel,state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
