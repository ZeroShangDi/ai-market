package cn.iocoder.yudao.module.callphone.service.system;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupCreateRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupPreviewRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupRestoreReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.system.CallPhoneLocalBackupAuditDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.system.CallPhoneLocalBackupJobDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.system.CallPhoneLocalBackupRestoreTokenDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.system.CallPhoneLocalBackupAuditMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.system.CallPhoneLocalBackupJobMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.system.CallPhoneLocalBackupRestoreTokenMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.callphone.util.CallPhoneBackupSchemaCompatibility;
import cn.iocoder.yudao.module.callphone.util.CallPhoneBackupArchiveIntegrity;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.Resource;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.HashSet;
import java.util.Objects;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class CallPhoneLocalBackupService {
    private static final int CURRENT_SCHEMA_VERSION = 55;
    private static final int FORMAT_VERSION = 1;
    private static final String JOB_TABLE = "cp_local_backup_job";
    private static final String AUDIT_TABLE = "cp_local_backup_audit";
    private static final String RESTORE_CONFIRM_TEXT = "REPLACE CALLPHONE DATA";

    @Resource private JdbcTemplate jdbc;
    @Resource private ObjectMapper objectMapper;
    @Resource private CallPhoneLocalBackupJobMapper callPhoneLocalBackupJobMapper;
    @Resource private CallPhoneLocalBackupAuditMapper auditMapper;
    @Resource private CallPhoneLocalBackupRestoreTokenMapper restoreTokenMapper;
    @Resource private CallPhoneBackupCryptoService backupCrypto;
    @Resource private PiiCryptoService crypto;
    @Value("${CALLPHONE_BACKUP_DIR:./data/callphone/backups}") private String backupDirectory;
    @Value("${CALLPHONE_RECORDING_STORAGE_PATH:/yudao-server/data/callphone/recordings}") private String recordingDirectory;
    private final SecureRandom secureRandom = new SecureRandom();

    @Transactional(rollbackFor = Exception.class)
    public CallPhoneLocalBackupCreateRespVO create(Long actorId) {
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        CallPhoneLocalBackupJobDO job = new CallPhoneLocalBackupJobDO();
        job.setId(IdUtil.getSnowflake().nextId());
        job.setStatus("creating");
        job.setSchemaVersion(CURRENT_SCHEMA_VERSION);
        job.setArtifactSha256("");
        job.setArtifactSize(0L);
        job.setTableCount(0);
        job.setRowCount(0L);
        job.setCompletedAt(LocalDateTime.now());
        callPhoneLocalBackupJobMapper.insert(job);

        Path target = artifactPath(tenantId, job.getId());
        Path temp = target.resolveSibling(target.getFileName() + ".tmp");
        try {
            Files.createDirectories(target.getParent());
            List<TableInfo> tables = discoverTables(tenantId);
            long totalRows = tables.stream().mapToLong(TableInfo::rowCount).sum();
            writeArchive(temp, tenantId, tables);
            try {
                Files.move(temp, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                        java.nio.file.StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException ex) {
                Files.move(temp, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            String checksum = sha256(target);
            callPhoneLocalBackupJobMapper.update(null, new LambdaUpdateWrapper<CallPhoneLocalBackupJobDO>()
                    .eq(CallPhoneLocalBackupJobDO::getId, job.getId())
                    .set(CallPhoneLocalBackupJobDO::getStatus, "completed")
                    .set(CallPhoneLocalBackupJobDO::getArtifactSha256, checksum)
                    .set(CallPhoneLocalBackupJobDO::getArtifactSize, Files.size(target))
                    .set(CallPhoneLocalBackupJobDO::getTableCount, tables.size())
                    .set(CallPhoneLocalBackupJobDO::getRowCount, totalRows)
                    .set(CallPhoneLocalBackupJobDO::getCompletedAt, LocalDateTime.now()));
            audit(job.getId(), actorId, "create", "加密备份完成：" + tables.size() + " 张 Call Phone 业务表，共 " + totalRows + " 行");
            job.setStatus("completed");
            job.setArtifactSha256(checksum);
            job.setArtifactSize(Files.size(target));
            job.setTableCount(tables.size());
            job.setRowCount(totalRows);
            CallPhoneLocalBackupCreateRespVO resp = new CallPhoneLocalBackupCreateRespVO();
            resp.setBackup(toResp(job));
            resp.setChecksum(checksum);
            return resp;
        } catch (Exception ex) {
            try { Files.deleteIfExists(temp); Files.deleteIfExists(target); } catch (IOException ignored) { }
            throw new IllegalStateException("Unable to create encrypted local Call Phone backup", ex);
        }
    }

    public PageResult<CallPhoneLocalBackupRespVO> getPage(CallPhoneLocalBackupPageReqVO req) {
        PageResult<CallPhoneLocalBackupJobDO> page = callPhoneLocalBackupJobMapper.selectPage(req);
        return new PageResult<>(page.getList().stream().map(this::toResp).toList(), page.getTotal());
    }

    public CallPhoneLocalBackupRespVO get(Long id) { return toResp(requireJob(id)); }

    public Path getVerifiedArtifact(Long id, Long actorId) {
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        CallPhoneLocalBackupJobDO job = requireJob(id);
        Path path = artifactPath(tenantId, id);
        if (!Files.isRegularFile(path) || !Objects.equals(job.getArtifactSha256(), sha256(path))) {
            throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        }
        audit(job.getId(), actorId, "download", "下载加密 Call Phone 业务数据备份");
        return path;
    }

    @Transactional(rollbackFor = Exception.class)
    public CallPhoneLocalBackupPreviewRespVO previewRestore(Long backupId, Long actorId) {
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        CallPhoneLocalBackupJobDO job = requireJob(backupId);
        JsonNode manifest = readVerifiedManifest(job, tenantId);
        validateCompatibleTables(manifest, tenantId);
        JsonNode tables = manifest.path("tables");
        List<CallPhoneLocalBackupPreviewRespVO.TableDiff> diffs = new ArrayList<>();
        long backupRows = 0;
        long currentRows = 0;
        for (JsonNode table : tables) {
            String name = table.path("name").asText();
            validateTableName(name);
            long archived = table.path("rowCount").asLong();
            long current = countRows(name, tenantId);
            CallPhoneLocalBackupPreviewRespVO.TableDiff diff = new CallPhoneLocalBackupPreviewRespVO.TableDiff();
            diff.setTableName(name);
            diff.setBackupRows(archived);
            diff.setCurrentRows(current);
            diffs.add(diff);
            backupRows += archived;
            currentRows += current;
        }
        LocalDateTime expiresAt = LocalDateTime.now().plusMinutes(10);
        byte[] tokenBytes = new byte[32];
        secureRandom.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        CallPhoneLocalBackupRestoreTokenDO tokenDO = new CallPhoneLocalBackupRestoreTokenDO();
        tokenDO.setId(IdUtil.getSnowflake().nextId());
        tokenDO.setBackupId(backupId);
        tokenDO.setActorUserId(actorId);
        tokenDO.setTokenHash(crypto.indexHash("callphone-restore-token", token));
        tokenDO.setArtifactSha256(job.getArtifactSha256());
        tokenDO.setExpiresAt(expiresAt);
        restoreTokenMapper.insert(tokenDO);
        CallPhoneLocalBackupPreviewRespVO resp = new CallPhoneLocalBackupPreviewRespVO();
        resp.setBackupId(backupId);
        resp.setSchemaVersion(job.getSchemaVersion());
        resp.setSnapshotTenantId(Long.valueOf(manifest.path("tenantId").asText()));
        resp.setCurrentTenantId(tenantId);
        resp.setTableCount(diffs.size());
        resp.setBackupRowCount(backupRows);
        resp.setCurrentRowCount(currentRows);
        resp.setCreatedAt(job.getCreateTime());
        resp.setTokenExpiresAt(expiresAt);
        resp.setPreviewToken(token);
        resp.setTables(diffs);
        audit(job.getId(), actorId, "restore_preview", "生成恢复预览：" + diffs.size() + " 张表；恢复将整体替换当前租户 Call Phone 数据");
        return resp;
    }

    @Transactional(rollbackFor = Exception.class)
    public CallPhoneLocalBackupRespVO restore(CallPhoneLocalBackupRestoreReqVO req, Long actorId) {
        if (!RESTORE_CONFIRM_TEXT.equals(req.getConfirmText())) throw exception(ErrorCodeConstants.LOCAL_BACKUP_CONFIRM_REQUIRED);
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        CallPhoneLocalBackupJobDO job = requireJob(req.getBackupId());
        JsonNode manifest = readVerifiedManifest(job, tenantId);
        validateCompatibleTables(manifest, tenantId);
        consumePreviewToken(req.getPreviewToken(), tenantId, job, actorId);
        List<JsonNode> tables = new ArrayList<>();
        manifest.path("tables").forEach(tables::add);
        Set<String> recordingObjectKeys = recordingObjectKeys(manifest);
        Set<String> previousRecordingKeys = currentRecordingObjectKeys(tenantId);
        Path recordingStage = createRecordingRestoreStage();
        try {
            for (int index = tables.size() - 1; index >= 0; index--) {
                String table = tables.get(index).path("name").asText();
                jdbc.update("DELETE FROM `" + table + "` WHERE `tenant_id` = ?", tenantId);
            }
            if (manifest.path("schemaVersion").asInt(-1) < 47) {
                jdbc.update("DELETE FROM `cp_call_recording_asset` WHERE `tenant_id` = ?", tenantId);
            }
            if (manifest.path("schemaVersion").asInt(-1) < 49) {
                // Older archives contain no automatic-intake policy; never keep a pointer to a
                // rule that may not exist in the restored snapshot.
                jdbc.update("UPDATE `cp_lead_assignment_auto_config` SET `rule_id` = NULL, "
                        + "`version` = `version` + 1, `update_time` = CURRENT_TIMESTAMP(3) "
                        + "WHERE `tenant_id` = ? AND `deleted` = b'0'", tenantId);
            }
            restoreRows(job, tenantId, tables, manifest, recordingStage);
            if (manifest.path("schemaVersion").asInt(-1) < 47) {
                jdbc.update("UPDATE `cp_call_record` SET `recording_state` = 'none' "
                        + "WHERE `tenant_id` = ? AND `deleted` = b'0'", tenantId);
            }
            Set<String> obsoleteRecordingKeys = new HashSet<>(previousRecordingKeys);
            obsoleteRecordingKeys.removeAll(recordingObjectKeys);
            registerRecordingRestoreAfterCommit(recordingStage, recordingObjectKeys, obsoleteRecordingKeys);
        } catch (RuntimeException exception) {
            deleteTree(recordingStage);
            throw exception;
        }
        audit(job.getId(), actorId, "restore", "已确认恢复并替换当前租户 Call Phone 业务数据；来源备份 " + job.getId());
        return toResp(job);
    }

    private void writeArchive(Path path, Long tenantId, List<TableInfo> tables) throws Exception {
        ObjectNode manifest = objectMapper.createObjectNode();
        manifest.put("formatVersion", FORMAT_VERSION);
        manifest.put("schemaVersion", CURRENT_SCHEMA_VERSION);
        manifest.put("tenantId", tenantId.toString());
        manifest.put("createdAt", LocalDateTime.now().toString());
        ArrayNode manifestTables = manifest.putArray("tables");
        for (TableInfo table : tables) {
            ObjectNode node = manifestTables.addObject();
            node.put("name", table.name());
            node.put("rowCount", table.rowCount());
            ArrayNode columns = node.putArray("columns");
            table.columns().forEach(columns::add);
        }
        List<RecordingArchiveEntry> recordings = recordingArchiveEntries(tenantId);
        ArrayNode manifestRecordings = manifest.putArray("recordings");
        for (RecordingArchiveEntry recording : recordings) {
            ObjectNode node = manifestRecordings.addObject();
            node.put("objectKey", recording.objectKey());
            node.put("sizeBytes", recording.sizeBytes());
            node.put("sha256", recording.sha256());
        }
        try (OutputStream raw = Files.newOutputStream(path);
             OutputStream encrypted = backupCrypto.encrypt(raw);
             ZipOutputStream zip = new ZipOutputStream(encrypted, StandardCharsets.UTF_8)) {
            zip.putNextEntry(new ZipEntry("manifest.json"));
            zip.write(objectMapper.writeValueAsBytes(manifest));
            zip.closeEntry();
            for (TableInfo table : tables) writeTable(zip, tenantId, table);
            for (RecordingArchiveEntry recording : recordings) {
                Path source = recordingObjectPath(recording.objectKey());
                zip.putNextEntry(new ZipEntry("recordings/" + recording.objectKey()));
                Files.copy(source, zip);
                zip.closeEntry();
            }
            zip.finish();
        }
    }

    private List<RecordingArchiveEntry> recordingArchiveEntries(Long tenantId) throws IOException {
        if (!tableExists("cp_call_recording_asset")) return List.of();
        List<String> objectKeys = jdbc.queryForList("SELECT `object_key` FROM `cp_call_recording_asset` "
                + "WHERE `tenant_id` = ? AND `deleted` = b'0' ORDER BY `id`", String.class, tenantId);
        List<RecordingArchiveEntry> entries = new ArrayList<>();
        for (String objectKey : objectKeys) {
            Path object = recordingObjectPath(objectKey);
            if (!Files.isRegularFile(object)) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
            long size = Files.size(object);
            if (size <= 28 || size > 25L * 1024 * 1024 + 28) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
            entries.add(new RecordingArchiveEntry(objectKey, size, sha256(object)));
        }
        return entries;
    }

    private void writeTable(ZipOutputStream zip, Long tenantId, TableInfo table) throws IOException {
        zip.putNextEntry(new ZipEntry("tables/" + table.name() + ".jsonl"));
        BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(zip, StandardCharsets.UTF_8));
        String sql = "SELECT " + quotedColumns(table.columns()) + " FROM `" + table.name()
                + "` WHERE `tenant_id` = ? ORDER BY `id`";
        PreparedStatementCreator creator = connection -> {
            PreparedStatement statement = connection.prepareStatement(sql, ResultSet.TYPE_FORWARD_ONLY,
                    ResultSet.CONCUR_READ_ONLY);
            statement.setFetchSize(Integer.MIN_VALUE);
            statement.setLong(1, tenantId);
            return statement;
        };
        try {
            jdbc.query(creator, (RowCallbackHandler) resultSet -> writeRow(writer, resultSet, table.columns().size()));
            writer.flush();
        } catch (RuntimeException ex) {
            throw ex;
        }
        zip.closeEntry();
    }

    private void writeRow(BufferedWriter writer, ResultSet resultSet, int columnCount) {
        try {
            ArrayNode row = objectMapper.createArrayNode();
            for (int column = 1; column <= columnCount; column++) {
                String value = resultSet.getString(column);
                if (value == null) row.addNull(); else row.add(value);
            }
            writer.write(objectMapper.writeValueAsString(row));
            writer.newLine();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to serialize local backup row", ex);
        }
    }

    private List<TableInfo> discoverTables(Long tenantId) {
        return discoverTables(tenantId, true);
    }

    private List<TableInfo> discoverTables(Long tenantId, boolean includeRowCount) {
        List<String> names = jdbc.queryForList("SELECT TABLE_NAME FROM information_schema.TABLES "
                + "WHERE TABLE_SCHEMA = DATABASE() AND LEFT(TABLE_NAME, 3) = 'cp_' ORDER BY TABLE_NAME", String.class);
        List<TableInfo> tables = new ArrayList<>();
        for (String name : names) {
            if (JOB_TABLE.equals(name) || AUDIT_TABLE.equals(name) || name.startsWith("cp_local_backup_")) continue;
            validateTableName(name);
            List<String> columns = jdbc.queryForList("SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                    + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION", String.class, name);
            if (!columns.contains("id") || !columns.contains("tenant_id")) continue;
            Long count = includeRowCount ? countRows(name, tenantId) : 0L;
            tables.add(new TableInfo(name, columns, count == null ? 0 : count));
        }
        return tables;
    }

    private JsonNode readVerifiedManifest(CallPhoneLocalBackupJobDO job, Long tenantId) {
        try {
            Path file = artifactPath(tenantId, job.getId());
            if (!Files.isRegularFile(file) || !Objects.equals(job.getArtifactSha256(), sha256(file))) {
                throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
            }
            try (InputStream raw = Files.newInputStream(file);
                 InputStream decrypted = backupCrypto.decrypt(raw);
                 ZipInputStream zip = new ZipInputStream(decrypted, StandardCharsets.UTF_8)) {
                ZipEntry first = zip.getNextEntry();
                if (first == null || !"manifest.json".equals(first.getName())) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
                JsonNode manifest = objectMapper.readTree(zip.readAllBytes());
                validateManifest(manifest, tenantId, job);
                return manifest;
            }
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        }
    }

    private void validateManifest(JsonNode manifest, Long tenantId, CallPhoneLocalBackupJobDO job) {
        int schemaVersion = manifest.path("schemaVersion").asInt(-1);
        if (manifest.path("formatVersion").asInt(-1) != FORMAT_VERSION
                || schemaVersion < 1 || schemaVersion > CURRENT_SCHEMA_VERSION
                || (schemaVersion >= 47 && !manifest.path("recordings").isArray())
                || !Objects.equals(job.getSchemaVersion(), schemaVersion)
                || !tenantId.toString().equals(manifest.path("tenantId").asText())
                || !manifest.path("tables").isArray()) {
            throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        }
        recordingObjectKeys(manifest);
    }

    private void validateCompatibleTables(JsonNode manifest, Long tenantId) {
        recordingObjectKeys(manifest);
        JsonNode archivedTables = manifest.path("tables");
        int schemaVersion = manifest.path("schemaVersion").asInt(-1);
        List<TableInfo> currentTables = discoverTables(tenantId, false);
        Set<String> expectedNames = currentTables.stream().map(TableInfo::name).collect(java.util.stream.Collectors.toSet());
        Set<String> archivedNames = new HashSet<>();
        for (JsonNode archived : archivedTables) {
            validateTable(archived, tenantId, schemaVersion);
            String name = archived.path("name").asText();
            if (!archivedNames.add(name)) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        }
        if (expectedNames.isEmpty() || !CallPhoneBackupSchemaCompatibility.hasCompatibleTables(
                schemaVersion, expectedNames, archivedNames)) {
            throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        }
    }

    private void validateTable(JsonNode node, Long tenantId, int schemaVersion) {
        String name = node.path("name").asText();
        validateTableName(name);
        if (name.startsWith("cp_local_backup_")) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        List<String> current = jdbc.queryForList("SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION", String.class, name);
        List<String> archived = new ArrayList<>();
        node.path("columns").forEach(column -> archived.add(column.asText()));
        if (!CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(schemaVersion, name, current, archived)
                || !current.contains("tenant_id") || !current.contains("id")) {
            throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        }
        if (!tableExists(name)) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
    }

    private void restoreRows(CallPhoneLocalBackupJobDO job, Long tenantId, List<JsonNode> tables,
                             JsonNode manifest, Path recordingStage) {
        Set<String> expectedTables = new HashSet<>();
        tables.forEach(table -> expectedTables.add(table.path("name").asText()));
        Set<String> restoredTables = new HashSet<>();
        List<String> tableArchiveEntries = new ArrayList<>();
        Set<String> expectedRecordingKeys = recordingObjectKeys(manifest);
        Set<String> restoredRecordingKeys = new HashSet<>();
        try (InputStream raw = Files.newInputStream(artifactPath(tenantId, job.getId()));
             InputStream decrypted = backupCrypto.decrypt(raw);
             ZipInputStream zip = new ZipInputStream(decrypted, StandardCharsets.UTF_8)) {
            ZipEntry entry = zip.getNextEntry();
            if (entry == null || !"manifest.json".equals(entry.getName())) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
            zip.closeEntry();
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.getName().startsWith("recordings/")) {
                    String objectKey = entry.getName().substring("recordings/".length());
                    if (!expectedRecordingKeys.contains(objectKey) || !restoredRecordingKeys.add(objectKey)) {
                        throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
                    }
                    JsonNode metadata = findRecordingMetadata(manifest, objectKey);
                    long expectedSize = metadata.path("sizeBytes").asLong(-1);
                    if (expectedSize <= 28 || expectedSize > 25L * 1024 * 1024 + 28) {
                        throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
                    }
                    Path stagedObject = recordingStage.resolve(objectKey).normalize();
                    if (!stagedObject.startsWith(recordingStage)) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
                    copyRecordingEntry(zip, stagedObject, expectedSize);
                    if (Files.size(stagedObject) != metadata.path("sizeBytes").asLong(-1)
                            || !Objects.equals(sha256(stagedObject), metadata.path("sha256").asText())) {
                        throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
                    }
                    zip.closeEntry();
                    continue;
                }
                if (!entry.getName().startsWith("tables/") || !entry.getName().endsWith(".jsonl")) {
                    throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
                }
                tableArchiveEntries.add(entry.getName());
                String name = entry.getName().substring("tables/".length(), entry.getName().length() - ".jsonl".length());
                validateTableName(name);
                if (!restoredTables.add(name)) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
                JsonNode table = tables.stream().filter(item -> name.equals(item.path("name").asText())).findFirst()
                        .orElseThrow(() -> exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID));
                List<String> columns = new ArrayList<>();
                table.path("columns").forEach(column -> columns.add(column.asText()));
                long restoredRows = insertTable(zip, tenantId, name, columns);
                if (!CallPhoneBackupArchiveIntegrity.hasExpectedRowCount(table.path("rowCount").asLong(-1), restoredRows)) {
                    throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
                }
                zip.closeEntry();
            }
            if (!CallPhoneBackupArchiveIntegrity.hasCompleteTableEntries(expectedTables, tableArchiveEntries)
                    || !restoredRecordingKeys.equals(expectedRecordingKeys)) {
                throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
            }
            Set<String> restoredDbKeys = new HashSet<>(jdbc.queryForList("SELECT `object_key` FROM `cp_call_recording_asset` "
                    + "WHERE `tenant_id` = ? AND `deleted` = b'0'", String.class, tenantId));
            if (!restoredDbKeys.equals(expectedRecordingKeys)) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        }
    }

    private long insertTable(ZipInputStream zip, Long tenantId, String table, List<String> columns) {
        String sql = "INSERT INTO `" + table + "` (" + quotedColumns(columns) + ") VALUES ("
                + String.join(",", java.util.Collections.nCopies(columns.size(), "?")) + ")";
        return jdbc.execute((Connection connection) -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(zip, StandardCharsets.UTF_8));
                String line;
                int queued = 0;
                long restoredRows = 0;
                int tenantIndex = columns.indexOf("tenant_id");
                while ((line = reader.readLine()) != null) {
                    JsonNode values = objectMapper.readTree(line);
                    if (!values.isArray() || values.size() != columns.size()
                            || tenantIndex < 0 || !tenantId.toString().equals(values.get(tenantIndex).asText())) {
                        throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
                    }
                    for (int index = 0; index < values.size(); index++) {
                        JsonNode value = values.get(index);
                        if (value == null || value.isNull()) statement.setObject(index + 1, null);
                        else statement.setString(index + 1, value.asText());
                    }
                    statement.addBatch();
                    restoredRows++;
                    if (++queued % 250 == 0) statement.executeBatch();
                }
                if (queued % 250 != 0) statement.executeBatch();
                return restoredRows;
            } catch (IOException ex) {
                throw new IllegalStateException("Unable to read encrypted backup rows", ex);
            }
        });
    }

    private long countRows(String table, Long tenantId) {
        validateTableName(table);
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM `" + table + "` WHERE `tenant_id` = ?", Long.class, tenantId);
        return count == null ? 0 : count;
    }

    private Set<String> recordingObjectKeys(JsonNode manifest) {
        JsonNode recordings = manifest.path("recordings");
        if (recordings.isMissingNode() || recordings.isNull()) return Set.of();
        if (!recordings.isArray()) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        Set<String> keys = new HashSet<>();
        for (JsonNode recording : recordings) {
            String objectKey = recording.path("objectKey").asText();
            long sizeBytes = recording.path("sizeBytes").asLong(-1);
            String checksum = recording.path("sha256").asText();
            if (!objectKey.matches("[a-f0-9-]{36}\\.enc") || sizeBytes <= 28
                    || sizeBytes > 25L * 1024 * 1024 + 28 || !checksum.matches("[a-f0-9]{64}")
                    || !keys.add(objectKey)) {
                throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
            }
        }
        return keys;
    }

    private JsonNode findRecordingMetadata(JsonNode manifest, String objectKey) {
        for (JsonNode recording : manifest.path("recordings")) {
            if (objectKey.equals(recording.path("objectKey").asText())) return recording;
        }
        throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
    }

    private void copyRecordingEntry(InputStream source, Path target, long expectedSize) throws IOException {
        long copied = 0;
        byte[] buffer = new byte[64 * 1024];
        try (OutputStream output = Files.newOutputStream(target)) {
            int read;
            while ((read = source.read(buffer)) != -1) {
                copied += read;
                if (copied > expectedSize) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
                output.write(buffer, 0, read);
            }
        }
        if (copied != expectedSize) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
    }

    private Path recordingObjectPath(String objectKey) {
        if (objectKey == null || !objectKey.matches("[a-f0-9-]{36}\\.enc")) {
            throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        }
        Path root = Path.of(recordingDirectory).toAbsolutePath().normalize();
        Path object = root.resolve(objectKey).normalize();
        if (!object.startsWith(root)) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
        return object;
    }

    private Path createRecordingRestoreStage() {
        Path root = Path.of(recordingDirectory).toAbsolutePath().normalize();
        Path stage = root.resolve(".restore-" + UUID.randomUUID()).normalize();
        try {
            Files.createDirectories(root);
            if (!stage.startsWith(root)) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
            return Files.createDirectory(stage);
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to stage encrypted Call Phone recordings", exception);
        }
    }

    private Set<String> currentRecordingObjectKeys(Long tenantId) {
        if (!tableExists("cp_call_recording_asset")) return Set.of();
        return new HashSet<>(jdbc.queryForList("SELECT `object_key` FROM `cp_call_recording_asset` "
                + "WHERE `tenant_id` = ? AND `deleted` = b'0'", String.class, tenantId));
    }

    private void registerRecordingRestoreAfterCommit(Path stage, Set<String> objectKeys, Set<String> obsoleteKeys) {
        if (objectKeys.isEmpty() && obsoleteKeys.isEmpty()) {
            deleteTree(stage);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    for (String key : objectKeys) {
                        Path staged = stage.resolve(key).normalize();
                        Path target = recordingObjectPath(key);
                        if (!staged.startsWith(stage) || !Files.isRegularFile(staged)) {
                            throw new IOException("A recording object is missing from the verified restore archive");
                        }
                        Files.move(staged, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                    }
                    for (String key : obsoleteKeys) Files.deleteIfExists(recordingObjectPath(key));
                } catch (IOException exception) {
                    throw new IllegalStateException("Unable to restore encrypted Call Phone recordings", exception);
                } finally {
                    deleteTree(stage);
                }
            }

            @Override
            public void afterCompletion(int status) {
                if (status != TransactionSynchronization.STATUS_COMMITTED) deleteTree(stage);
            }
        });
    }

    private void deleteTree(Path directory) {
        if (directory == null || !Files.exists(directory)) return;
        try (var paths = Files.walk(directory)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try { Files.deleteIfExists(path); } catch (IOException ignored) { }
            });
        } catch (IOException ignored) {
            // Failed temporary-file cleanup does not change the database restore result.
        }
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.TABLES "
                + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
        return count != null && count > 0;
    }

    private CallPhoneLocalBackupJobDO requireJob(Long id) {
        CallPhoneLocalBackupJobDO row = callPhoneLocalBackupJobMapper.selectById(id);
        if (row == null || !"completed".equals(row.getStatus())) throw exception(ErrorCodeConstants.LOCAL_BACKUP_NOT_FOUND);
        return row;
    }

    private void consumePreviewToken(String token, Long tenantId, CallPhoneLocalBackupJobDO job, Long actorId) {
        if (token == null || token.isBlank()) throw exception(ErrorCodeConstants.LOCAL_BACKUP_CONFIRM_REQUIRED);
        String tokenHash = crypto.indexHash("callphone-restore-token", token);
        CallPhoneLocalBackupRestoreTokenDO tokenDO = restoreTokenMapper.selectOne(
                new LambdaQueryWrapperX<CallPhoneLocalBackupRestoreTokenDO>()
                        .eq(CallPhoneLocalBackupRestoreTokenDO::getTokenHash, tokenHash)
                        .eq(CallPhoneLocalBackupRestoreTokenDO::getBackupId, job.getId())
                        .eq(CallPhoneLocalBackupRestoreTokenDO::getActorUserId, actorId)
                        .eq(CallPhoneLocalBackupRestoreTokenDO::getArtifactSha256, job.getArtifactSha256()));
        LocalDateTime now = LocalDateTime.now();
        if (tokenDO == null || tokenDO.getConsumedAt() != null || !tokenDO.getExpiresAt().isAfter(now)) {
            throw exception(ErrorCodeConstants.LOCAL_BACKUP_CONFIRM_REQUIRED);
        }
        int consumed = restoreTokenMapper.update(null, new LambdaUpdateWrapper<CallPhoneLocalBackupRestoreTokenDO>()
                .set(CallPhoneLocalBackupRestoreTokenDO::getConsumedAt, now)
                .eq(CallPhoneLocalBackupRestoreTokenDO::getId, tokenDO.getId())
                .eq(CallPhoneLocalBackupRestoreTokenDO::getBackupId, job.getId())
                .eq(CallPhoneLocalBackupRestoreTokenDO::getActorUserId, actorId)
                .eq(CallPhoneLocalBackupRestoreTokenDO::getArtifactSha256, job.getArtifactSha256())
                .isNull(CallPhoneLocalBackupRestoreTokenDO::getConsumedAt)
                .gt(CallPhoneLocalBackupRestoreTokenDO::getExpiresAt, now));
        if (consumed != 1) throw exception(ErrorCodeConstants.LOCAL_BACKUP_CONFIRM_REQUIRED);
        restoreTokenMapper.update(null, new LambdaUpdateWrapper<CallPhoneLocalBackupRestoreTokenDO>()
                .set(CallPhoneLocalBackupRestoreTokenDO::getConsumedAt, now)
                .eq(CallPhoneLocalBackupRestoreTokenDO::getBackupId, job.getId())
                .isNull(CallPhoneLocalBackupRestoreTokenDO::getConsumedAt));
    }

    private void audit(Long backupId, Long actorId, String action, String summary) {
        CallPhoneLocalBackupAuditDO audit = new CallPhoneLocalBackupAuditDO();
        audit.setId(IdUtil.getSnowflake().nextId());
        audit.setBackupId(backupId);
        audit.setAction(action);
        audit.setActorId(actorId);
        audit.setSummaryCiphertext(crypto.encrypt(summary));
        auditMapper.insert(audit);
    }

    private CallPhoneLocalBackupRespVO toResp(CallPhoneLocalBackupJobDO row) {
        CallPhoneLocalBackupRespVO resp = new CallPhoneLocalBackupRespVO();
        resp.setId(row.getId()); resp.setStatus(row.getStatus()); resp.setSchemaVersion(row.getSchemaVersion());
        resp.setArtifactSize(row.getArtifactSize()); resp.setTableCount(row.getTableCount());
        resp.setRowCount(row.getRowCount()); resp.setCompletedAt(row.getCompletedAt()); resp.setCreateTime(row.getCreateTime());
        return resp;
    }

    private Path artifactPath(Long tenantId, Long backupId) {
        return Path.of(backupDirectory).toAbsolutePath().normalize()
                .resolve("cp-" + tenantId + "-" + backupId + ".cpbak");
    }

    private String sha256(Path file) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = Files.newInputStream(file)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to verify Call Phone backup checksum", ex);
        }
    }

    private String quotedColumns(List<String> columns) {
        return columns.stream().map(column -> {
            if (!column.matches("[a-zA-Z][a-zA-Z0-9_]*")) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
            return "`" + column + "`";
        }).collect(java.util.stream.Collectors.joining(","));
    }

    private void validateTableName(String name) {
        if (name == null || !name.matches("cp_[a-z0-9_]+")) throw exception(ErrorCodeConstants.LOCAL_BACKUP_INVALID);
    }

    private record TableInfo(String name, List<String> columns, long rowCount) { }
    private record RecordingArchiveEntry(String objectKey, long sizeBytes, String sha256) { }
}
