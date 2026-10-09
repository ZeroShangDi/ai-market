package cn.iocoder.yudao.module.callphone.service.wecom;

import cn.hutool.core.util.IdUtil;
import cn.hutool.json.JSONUtil;
import cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.security.core.service.SecurityFrameworkService;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComContactPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComContactRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComContactSyncReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComFollowUserRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComSyncJobRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.settings.IntegrationConnectionDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComContactDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComContactOwnerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComSyncJobDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.settings.IntegrationConnectionMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComContactMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComContactOwnerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComSyncJobMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.scheduling.annotation.Async;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class WeComContactService {
    @Resource private WeComContactMapper contactMapper;
    @Resource private WeComContactOwnerMapper ownerMapper;
    @Resource private WeComSyncJobMapper weComSyncJobMapper;
    @Resource private IntegrationConnectionMapper integrationMapper;
    @Resource private WeComApiClient apiClient;
    @Resource private PiiCryptoService crypto;
    @Resource private ObjectMapper objectMapper;
    @Resource private SecurityFrameworkService security;
    @Lazy @Resource private WeComContactService self;

    public PageResult<WeComContactRespVO> getPage(WeComContactPageReqVO req) {
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        String nameHash = req.getQuery() == null || req.getQuery().isBlank() ? null
                : crypto.indexHash("wecom-name-" + tenantId, req.getQuery().trim());
        List<Long> ids = req.getFollowUserKey() == null || req.getFollowUserKey().isBlank() ? null
                : ownerMapper.selectContactIdsByOwnerHash(ownerHash(tenantId, req.getFollowUserKey()));
        PageResult<WeComContactDO> page = contactMapper.selectPage(req, ids, nameHash);
        boolean piiVisible = Boolean.TRUE.equals(req.getIncludePii()) && security.hasPermission("callphone:wecom:contact:pii");
        List<WeComContactRespVO> rows = page.getList().stream().map(row -> toResp(row, piiVisible)).toList();
        return new PageResult<>(rows, page.getTotal());
    }

    public WeComContactRespVO get(Long id, boolean includePii) {
        WeComContactDO row = contactMapper.selectById(id);
        if (row == null) throw exception(ErrorCodeConstants.WECOM_CONTACT_NOT_FOUND);
        return toResp(row, includePii && security.hasPermission("callphone:wecom:contact:pii"));
    }

    public List<WeComFollowUserRespVO> getFollowUserOptions() {
        IntegrationConnectionDO connection = requireConnection();
        return apiClient.getFollowUsers(connection).stream()
                .map(user -> new WeComFollowUserRespVO(user.userId(), user.name())).toList();
    }

    public boolean hasPiiPermission() { return security.hasPermission("callphone:wecom:contact:pii"); }
    public boolean hasSyncPermission() { return security.hasPermission("callphone:wecom:contact:sync"); }

    @Transactional(rollbackFor = Exception.class)
    public WeComSyncJobRespVO createSyncJob(WeComContactSyncReqVO req, Long userId) {
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        WeComSyncJobDO existing = weComSyncJobMapper.selectByRequestAndKey(userId, req.getIdempotencyKey());
        if (existing != null) {
            if (!"contact".equals(existing.getResourceType()) || !existing.getOwnerUserIdHash().equals(ownerHash(tenantId, req.getFollowUserKey()))) {
                throw exception(ErrorCodeConstants.IDEMPOTENCY_CONFLICT);
            }
            return toJobResp(existing);
        }
        IntegrationConnectionDO connection = requireConnection();
        if (weComSyncJobMapper.selectCount(new cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX<WeComSyncJobDO>()
                .eq(WeComSyncJobDO::getOwnerUserIdHash, ownerHash(tenantId, req.getFollowUserKey()))
                .eq(WeComSyncJobDO::getResourceType, "contact")
                .in(WeComSyncJobDO::getStatus, List.of("queued", "running"))) > 0) {
            throw exception(ErrorCodeConstants.WECOM_UPSTREAM_UNAVAILABLE);
        }
        WeComSyncJobDO job = new WeComSyncJobDO();
        job.setId(IdUtil.getSnowflake().nextId()); job.setRequestedBy(userId);
        job.setOwnerUserIdHash(ownerHash(tenantId, req.getFollowUserKey()));
        job.setOwnerUserIdCiphertext(crypto.encrypt(req.getFollowUserKey()));
        job.setIdempotencyKey(req.getIdempotencyKey()); job.setStatus("queued");
        job.setResourceType("contact");
        job.setTotal(0); job.setProcessed(0); job.setSucceeded(0); job.setFailed(0);
        weComSyncJobMapper.insert(job);
        Long jobId = job.getId();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { self.runSyncAsync(jobId, tenantId); }
        });
        return toJobResp(job);
    }

    public WeComSyncJobRespVO getSyncJob(Long id, Long userId) {
        WeComSyncJobDO job = weComSyncJobMapper.selectByOwnerAndRequest(id, userId, "contact");
        return job == null ? null : toJobResp(job);
    }

    @Async
    public void runSyncAsync(Long jobId, Long tenantId) {
        TenantUtils.execute(tenantId, () -> runSync(jobId));
    }

    private void runSync(Long jobId) {
        WeComSyncJobDO job = weComSyncJobMapper.selectById(jobId);
        if (job == null) return;
        weComSyncJobMapper.update(null, new LambdaUpdateWrapper<WeComSyncJobDO>().eq(WeComSyncJobDO::getId, jobId)
                .set(WeComSyncJobDO::getStatus, "running").set(WeComSyncJobDO::getStartedAt, LocalDateTime.now()));
        int succeeded = 0, failed = 0, processed = 0;
        try {
            IntegrationConnectionDO connection = requireConnection();
            String userId = crypto.decrypt(job.getOwnerUserIdCiphertext());
            String ownerName = apiClient.getFollowUserName(connection, userId);
            List<String> externalIds = apiClient.getContactIds(connection, userId);
            if (externalIds.size() > 5000) throw exception(ErrorCodeConstants.WECOM_UPSTREAM_UNAVAILABLE);
            setProgress(jobId, "running", externalIds.size(), processed, succeeded, failed, null, null);
            for (String externalId : externalIds) {
                try { syncContact(connection, userId, ownerName, externalId); succeeded++; }
                catch (RuntimeException exception) { failed++; }
                processed++;
                setProgress(jobId, "running", externalIds.size(), processed, succeeded, failed, null, null);
            }
            String status = failed == 0 ? "completed" : succeeded == 0 ? "failed" : "partial";
            setProgress(jobId, status, externalIds.size(), processed, succeeded, failed,
                    failed == 0 ? null : "CONTACT_SYNC_PARTIAL", LocalDateTime.now());
        } catch (RuntimeException exception) {
            setProgress(jobId, "failed", processed, processed, succeeded, failed, "WECOM_SYNC_UNAVAILABLE", LocalDateTime.now());
        }
    }

    private void syncContact(IntegrationConnectionDO connection, String ownerId, String ownerName, String externalId) {
        JsonNode root = apiClient.getContact(connection, externalId);
        JsonNode external = root.path("external_contact");
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        String extHash = crypto.indexHash("wecom-external-" + tenantId, externalId);
        WeComContactDO contact = contactMapper.selectOne(new cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX<WeComContactDO>()
                .eq(WeComContactDO::getExternalUserIdHash, extHash));
        LocalDateTime now = LocalDateTime.now();
        String name = safeText(external, "name", 256);
        JsonNode followRows = root.path("follow_user");
        JsonNode selectedFollow = null;
        if (followRows.isArray()) for (JsonNode follow : followRows) if (ownerId.equals(safeText(follow, "userid", 128))) selectedFollow = follow;
        JsonNode followInfo = selectedFollow == null ? objectMapper.createObjectNode() : selectedFollow;
        if (contact == null) {
            contact = new WeComContactDO(); contact.setId(IdUtil.getSnowflake().nextId());
            contact.setExternalUserIdHash(extHash); contact.setExternalUserIdCiphertext(crypto.encrypt(externalId));
            contact.setVersion(1);
        }
        contact.setNameSearchHash(name == null ? null : crypto.indexHash("wecom-name-" + tenantId, name));
        contact.setNameCiphertext(crypto.encrypt(name)); contact.setProfileCiphertext(crypto.encrypt(profileJson(followInfo)));
        contact.setExternalType("external"); contact.setGender(external.path("gender").isInt() ? external.path("gender").asInt() : null);
        contact.setFirstAddedAt(epoch(followInfo.path("add_time")));
        contact.setExternalCreatedAt(epoch(external.path("create_time"))); contact.setLastSyncedAt(now);
        if (contactMapper.selectById(contact.getId()) == null) contactMapper.insert(contact); else contactMapper.updateById(contact);

        String ownerHash = ownerHash(tenantId, ownerId);
        WeComContactOwnerDO owner = ownerMapper.selectByContactAndOwner(contact.getId(), ownerHash);
        if (owner == null) {
            owner = new WeComContactOwnerDO(); owner.setId(IdUtil.getSnowflake().nextId()); owner.setContactId(contact.getId());
            owner.setOwnerUserIdHash(ownerHash); owner.setOwnerUserIdCiphertext(crypto.encrypt(ownerId));
            owner.setFirstFollowedAt(epoch(followInfo.path("add_time")));
        }
        owner.setFollowInfoCiphertext(crypto.encrypt(profileJson(followInfo))); owner.setLastSyncedAt(now);
        owner.setOwnerNameCiphertext(crypto.encrypt(ownerName));
        if (ownerMapper.selectById(owner.getId()) == null) ownerMapper.insert(owner); else ownerMapper.updateById(owner);
    }

    private WeComContactRespVO toResp(WeComContactDO row, boolean piiVisible) {
        WeComContactRespVO resp = new WeComContactRespVO();
        resp.setId(row.getId()); resp.setExternalType(row.getExternalType()); resp.setGender(row.getGender());
        resp.setFirstAddedAt(row.getFirstAddedAt()); resp.setLastInteractionAt(row.getLastInteractionAt());
        resp.setLastSyncedAt(row.getLastSyncedAt()); resp.setPiiVisible(piiVisible);
        WeComContactOwnerDO owner = ownerMapper.selectList(new cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX<WeComContactOwnerDO>()
                .eq(WeComContactOwnerDO::getContactId, row.getId()).orderByDesc(WeComContactOwnerDO::getLastSyncedAt))
                .stream().findFirst().orElse(null);
        if (owner != null) { resp.setFollowUserKey(crypto.decrypt(owner.getOwnerUserIdCiphertext())); resp.setFollowUserName(crypto.decrypt(owner.getOwnerNameCiphertext())); }
        String profile = crypto.decrypt(owner == null ? row.getProfileCiphertext() : owner.getFollowInfoCiphertext());
        if (piiVisible) {
            resp.setName(crypto.decrypt(row.getNameCiphertext()));
            Map<?, ?> profileMap = profile == null ? Map.of() : JSONUtil.toBean(profile, Map.class);
            resp.setRemark(asString(profileMap.get("remark"))); resp.setDescription(asString(profileMap.get("description")));
            Object tags = profileMap.get("tags");
            if (tags instanceof List<?> list) resp.setTags(list.stream().filter(String.class::isInstance).map(String.class::cast).toList());
        } else {
            resp.setName(row.getNameSearchHash() == null ? "企微客户" : "企微客户·" + row.getNameSearchHash().substring(0, 4));
        }
        return resp;
    }

    private String profileJson(JsonNode followInfo) {
        Map<String, Object> profile = new HashMap<>();
        profile.put("remark", safeText(followInfo, "remark", 512));
        profile.put("description", safeText(followInfo, "description", 2048));
        List<String> tags = new ArrayList<>();
        JsonNode tagRows = followInfo.path("tags");
        if (tagRows.isArray()) tagRows.forEach(tag -> { String name = safeText(tag, "tag_name", 128); if (name != null) tags.add(name); });
        profile.put("tags", tags);
        return JSONUtil.toJsonStr(profile);
    }

    private String safeText(JsonNode node, String field, int max) {
        JsonNode value = node.get(field);
        return value != null && value.isTextual() && value.asText().length() <= max ? value.asText() : null;
    }
    private LocalDateTime epoch(JsonNode value) {
        return value != null && value.canConvertToLong() && value.asLong() > 0
                ? LocalDateTime.ofInstant(Instant.ofEpochSecond(value.asLong()), ZoneId.systemDefault()) : null;
    }
    private String ownerHash(Long tenantId, String owner) { return crypto.indexHash("wecom-owner-" + tenantId, owner); }
    private String asString(Object value) { return value instanceof String text ? text : null; }
    private IntegrationConnectionDO requireConnection() {
        IntegrationConnectionDO row = integrationMapper.selectByProvider("wecom");
        if (row == null || row.getCredentialCiphertext() == null) throw exception(ErrorCodeConstants.WECOM_NOT_CONFIGURED);
        return row;
    }
    private void setProgress(Long id, String status, int total, int processed, int succeeded, int failed, String error, LocalDateTime finishedAt) {
        weComSyncJobMapper.update(null, new LambdaUpdateWrapper<WeComSyncJobDO>().eq(WeComSyncJobDO::getId, id)
                .set(WeComSyncJobDO::getStatus, status).set(WeComSyncJobDO::getTotal, total)
                .set(WeComSyncJobDO::getProcessed, processed).set(WeComSyncJobDO::getSucceeded, succeeded)
                .set(WeComSyncJobDO::getFailed, failed).set(WeComSyncJobDO::getErrorCode, error)
                .set(WeComSyncJobDO::getFinishedAt, finishedAt));
    }
    private WeComSyncJobRespVO toJobResp(WeComSyncJobDO job) {
        WeComSyncJobRespVO resp = new WeComSyncJobRespVO();
        resp.setId(job.getId()); resp.setStatus(job.getStatus()); resp.setTotal(job.getTotal());
        resp.setProcessed(job.getProcessed()); resp.setSucceeded(job.getSucceeded()); resp.setFailed(job.getFailed());
        resp.setErrorCode(job.getErrorCode()); resp.setStartedAt(job.getStartedAt()); resp.setFinishedAt(job.getFinishedAt());
        return resp;
    }
}
