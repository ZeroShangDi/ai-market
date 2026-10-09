package cn.iocoder.yudao.module.callphone.service.settings;

import cn.hutool.core.util.IdUtil;
import cn.hutool.json.JSONUtil;
import cn.iocoder.yudao.module.callphone.controller.admin.settings.vo.IntegrationConnectionRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.settings.vo.IntegrationConnectionSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.settings.IntegrationConnectionDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.settings.IntegrationConnectionMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.callphone.service.wecom.WeComApiClient;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mzt.logapi.context.LogRecordContext;
import com.mzt.logapi.starter.annotation.LogRecord;
import jakarta.annotation.Resource;
import java.net.URI;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class IntegrationConnectionService {
    private static final Set<String> PROVIDERS = Set.of("wecom", "ai_core", "object_storage");
    private static final Pattern SECRET_KEY = Pattern.compile("[A-Za-z][A-Za-z0-9_]{0,39}");
    private static final Pattern S3_BUCKET_NAME = Pattern.compile("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]");
    private static final Pattern IPV4_ADDRESS = Pattern.compile("[0-9]{1,3}(?:\\.[0-9]{1,3}){3}");
    private static final Map<String, Set<String>> CREDENTIAL_KEYS = Map.of(
            "wecom", Set.of("corpId", "agentId", "secret"),
            "ai_core", Set.of("apiKey"));
    private static final Set<String> OBJECT_STORAGE_REQUIRED_KEYS = Set.of("accessKey", "secretKey", "bucket");
    private static final Set<String> OBJECT_STORAGE_ALLOWED_KEYS = Set.of("accessKey", "secretKey", "bucket", "region");
    private static final Map<String, String> PROVIDER_SCOPE = Map.of(
            "wecom", "客户与客户群只读同步",
            "ai_core", "授权后发送最少化任务元数据",
            "object_storage", "知识文档与备份文件");
    @Resource private IntegrationConnectionMapper mapper;
    @Resource private PiiCryptoService crypto;
    @Resource private WeComApiClient weComApiClient;
    @Resource private EntitlementService entitlementService;
    @Resource private ObjectStorageConnectionVerifier objectStorageConnectionVerifier;

    public List<IntegrationConnectionRespVO> getList() {
        return mapper.selectTenantList().stream().map(this::toResp).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    @LogRecord(type = "CALLPHONE_INTEGRATION", subType = "SAVE", bizNo = "{{#req.provider}}", success = "保存扩展服务配置")
    public boolean save(IntegrationConnectionSaveReqVO req) {
        validate(req);
        LogRecordContext.putVariable("provider", req.getProvider());
        IntegrationConnectionDO row = req.getId() == null ? mapper.selectByProvider(req.getProvider()) : mapper.selectById(req.getId());
        if (req.getId() != null && row == null) throw exception(ErrorCodeConstants.INTEGRATION_VERSION_CONFLICT);
        if (row != null && !row.getProvider().equals(req.getProvider())) throw exception(ErrorCodeConstants.INTEGRATION_PROVIDER_IMMUTABLE);
        if (row == null) {
            if (req.getExpectedVersion() != 0) throw exception(ErrorCodeConstants.INTEGRATION_VERSION_CONFLICT);
            row = new IntegrationConnectionDO(); row.setId(IdUtil.getSnowflake().nextId()); row.setProvider(req.getProvider());
            row.setVersion(1); row.setStatus("not_tested");
            validateCredentials(req.getProvider(), req.getCredentials(), true);
            write(row, req, true);
            return mapper.insert(row) > 0;
        }
        if (!row.getVersion().equals(req.getExpectedVersion())) throw exception(ErrorCodeConstants.INTEGRATION_VERSION_CONFLICT);
        validateCredentials(req.getProvider(), req.getCredentials(), row.getCredentialCiphertext() == null);
        write(row, req, false);
        LambdaUpdateWrapper<IntegrationConnectionDO> update = new LambdaUpdateWrapper<IntegrationConnectionDO>()
                .eq(IntegrationConnectionDO::getId, row.getId()).eq(IntegrationConnectionDO::getVersion, req.getExpectedVersion())
                .set(IntegrationConnectionDO::getDisplayName, row.getDisplayName()).set(IntegrationConnectionDO::getEndpointUrl, row.getEndpointUrl())
                .set(IntegrationConnectionDO::getScopesJson, row.getScopesJson()).set(IntegrationConnectionDO::getSyncIntervalMinutes, row.getSyncIntervalMinutes())
                .set(IntegrationConnectionDO::getCredentialCiphertext, row.getCredentialCiphertext()).set(IntegrationConnectionDO::getStatus, "not_tested")
                .set(IntegrationConnectionDO::getLastErrorCode, null).set(IntegrationConnectionDO::getLastCheckedAt, null)
                .set(IntegrationConnectionDO::getVersion, req.getExpectedVersion() + 1);
        if (mapper.update(null, update) == 0) throw exception(ErrorCodeConstants.INTEGRATION_VERSION_CONFLICT);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    @LogRecord(type = "CALLPHONE_INTEGRATION", subType = "REVOKE", bizNo = "{{#provider}}", success = "撤销扩展服务并删除凭据")
    public boolean revoke(Long id, Integer expectedVersion) {
        IntegrationConnectionDO row = mapper.selectById(id);
        if (row == null || !row.getVersion().equals(expectedVersion)) throw exception(ErrorCodeConstants.INTEGRATION_VERSION_CONFLICT);
        LogRecordContext.putVariable("provider", row.getProvider());
        LambdaUpdateWrapper<IntegrationConnectionDO> update = new LambdaUpdateWrapper<IntegrationConnectionDO>()
                .eq(IntegrationConnectionDO::getId, id).eq(IntegrationConnectionDO::getVersion, expectedVersion)
                .set(IntegrationConnectionDO::getCredentialCiphertext, null).set(IntegrationConnectionDO::getStatus, "revoked")
                .set(IntegrationConnectionDO::getLastErrorCode, null).set(IntegrationConnectionDO::getLastCheckedAt, null)
                .set(IntegrationConnectionDO::getVersion, expectedVersion + 1);
        if (mapper.update(null, update) == 0) throw exception(ErrorCodeConstants.INTEGRATION_VERSION_CONFLICT);
        return true;
    }

    @LogRecord(type = "CALLPHONE_INTEGRATION", subType = "TEST", bizNo = "{{#id}}", success = "检测扩展服务连接")
    public IntegrationConnectionRespVO test(Long id, Integer expectedVersion) {
        IntegrationConnectionDO row = mapper.selectById(id);
        if (row == null || !row.getVersion().equals(expectedVersion)) {
            throw exception(ErrorCodeConstants.INTEGRATION_VERSION_CONFLICT);
        }
        if (row.getCredentialCiphertext() == null) throw exception(ErrorCodeConstants.INTEGRATION_CREDENTIAL_REQUIRED);
        boolean connected;
        try {
            if ("wecom".equals(row.getProvider())) {
                weComApiClient.verifyReadOnlySyncScope(row);
                connected = true;
            } else if ("ai_core".equals(row.getProvider())) {
                connected = "available".equals(entitlementService.getCurrent().getState());
            } else {
                Map<String, String> credentials = JSONUtil.toBean(crypto.decrypt(row.getCredentialCiphertext()), Map.class);
                objectStorageConnectionVerifier.verify(row.getEndpointUrl(), credentials);
                connected = true;
            }
        } catch (RuntimeException exception) {
            connected = false;
        }

        LocalDateTime checkedAt = LocalDateTime.now();
        String status = connected ? "connected" : "error";
        String errorCode = connected ? null : "verification_failed";
        LambdaUpdateWrapper<IntegrationConnectionDO> update = new LambdaUpdateWrapper<IntegrationConnectionDO>()
                .eq(IntegrationConnectionDO::getId, id).eq(IntegrationConnectionDO::getVersion, expectedVersion)
                .set(IntegrationConnectionDO::getStatus, status)
                .set(IntegrationConnectionDO::getLastErrorCode, errorCode)
                .set(IntegrationConnectionDO::getLastCheckedAt, checkedAt);
        if (mapper.update(null, update) == 0) throw exception(ErrorCodeConstants.INTEGRATION_VERSION_CONFLICT);

        row.setStatus(status);
        row.setLastErrorCode(errorCode);
        row.setLastCheckedAt(checkedAt);
        return toResp(row);
    }

    private void validate(IntegrationConnectionSaveReqVO req) {
        if (!PROVIDERS.contains(req.getProvider())) throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
        if (req.getSyncIntervalMinutes() < 0 || req.getSyncIntervalMinutes() > 10080) throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
        if (!"wecom".equals(req.getProvider()) && req.getSyncIntervalMinutes() != 0) throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
        if (!"wecom".equals(req.getProvider()) && (req.getEndpointUrl() == null || req.getEndpointUrl().isBlank()))
            throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
        if (req.getEndpointUrl() != null && !req.getEndpointUrl().isBlank()) {
            try {
                URI uri = URI.create(req.getEndpointUrl());
                if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                        || uri.getFragment() != null || uri.getRawQuery() != null)
                    throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
            } catch (IllegalArgumentException ex) { throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID); }
        }
        if (req.getCredentials() != null) req.getCredentials().forEach((key, value) -> {
            if (key == null || !SECRET_KEY.matcher(key).matches() || value == null || value.isBlank()) throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
        });
        if (req.getCredentials() != null && (req.getCredentials().size() > 12
                || req.getCredentials().values().stream().anyMatch(value -> value != null && value.length() > 512)))
            throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
        if (req.getScopes() != null && (req.getScopes().size() > 1 || req.getScopes().stream().anyMatch(scope -> !PROVIDER_SCOPE.get(req.getProvider()).equals(scope))))
            throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
    }

    private void validateCredentials(String provider, Map<String, String> credentials, boolean required) {
        if (credentials == null || credentials.isEmpty()) {
            if (required) throw exception(ErrorCodeConstants.INTEGRATION_CREDENTIAL_REQUIRED);
            return;
        }
        if ("object_storage".equals(provider)) {
            if (!credentials.keySet().containsAll(OBJECT_STORAGE_REQUIRED_KEYS)
                    || !OBJECT_STORAGE_ALLOWED_KEYS.containsAll(credentials.keySet())) {
                throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
            }
            String region = credentials.get("region");
            if (region != null && !region.isBlank() && !region.trim().matches("[a-z0-9-]{2,32}")) {
                throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
            }
            String bucket = credentials.get("bucket").trim();
            if (!S3_BUCKET_NAME.matcher(bucket).matches() || bucket.contains("..") || bucket.contains(".-")
                    || bucket.contains("-.") || IPV4_ADDRESS.matcher(bucket).matches()) {
                throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
            }
            return;
        }
        if (!credentials.keySet().equals(CREDENTIAL_KEYS.get(provider))) throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
    }

    private void write(IntegrationConnectionDO row, IntegrationConnectionSaveReqVO req, boolean isNew) {
        row.setDisplayName(req.getDisplayName().trim()); row.setEndpointUrl(blankToNull(req.getEndpointUrl()));
        row.setScopesJson(JSONUtil.toJsonStr(req.getScopes() == null ? List.of() : req.getScopes().stream().map(String::trim).filter(s -> !s.isBlank()).distinct().toList()));
        row.setSyncIntervalMinutes(req.getSyncIntervalMinutes());
        if (req.getCredentials() != null && !req.getCredentials().isEmpty()) {
            Map<String, String> credentials = new java.util.HashMap<>(req.getCredentials());
            if ("object_storage".equals(req.getProvider())) {
                credentials.computeIfPresent("bucket", (key, value) -> value.trim());
                credentials.computeIfPresent("region", (key, value) -> value.trim());
            }
            row.setCredentialCiphertext(crypto.encrypt(JSONUtil.toJsonStr(credentials)));
        }
        if (isNew) row.setVersion(1);
    }

    private IntegrationConnectionRespVO toResp(IntegrationConnectionDO row) {
        IntegrationConnectionRespVO resp = new IntegrationConnectionRespVO();
        resp.setId(row.getId()); resp.setProvider(row.getProvider()); resp.setDisplayName(row.getDisplayName()); resp.setEndpointUrl(row.getEndpointUrl());
        resp.setScopes(row.getScopesJson() == null ? List.of() : JSONUtil.toList(row.getScopesJson(), String.class));
        resp.setSyncIntervalMinutes(row.getSyncIntervalMinutes()); resp.setHasCredentials(row.getCredentialCiphertext() != null);
        resp.setStatus(row.getStatus()); resp.setLastErrorCode(row.getLastErrorCode()); resp.setLastCheckedAt(row.getLastCheckedAt()); resp.setVersion(row.getVersion());
        return resp;
    }
    private String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
