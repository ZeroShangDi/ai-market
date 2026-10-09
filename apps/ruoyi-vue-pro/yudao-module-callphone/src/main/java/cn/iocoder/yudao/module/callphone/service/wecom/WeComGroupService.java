package cn.iocoder.yudao.module.callphone.service.wecom;

import cn.hutool.core.util.IdUtil;
import cn.hutool.json.JSONUtil;
import cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.security.core.service.SecurityFrameworkService;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComGroupPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComGroupRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComGroupSyncReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComFollowUserRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComSyncJobRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.settings.IntegrationConnectionDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComGroupDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComGroupMemberDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComSyncJobDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.settings.IntegrationConnectionMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComGroupMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComGroupMemberMapper;
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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class WeComGroupService {
    @Resource private WeComGroupMapper groupMapper;
    @Resource private WeComGroupMemberMapper memberMapper;
    @Resource private WeComSyncJobMapper weComSyncJobMapper;
    @Resource private IntegrationConnectionMapper integrationMapper;
    @Resource private WeComApiClient apiClient;
    @Resource private PiiCryptoService crypto;
    @Resource private SecurityFrameworkService security;
    @Resource private ObjectMapper objectMapper;
    @Lazy @Resource private WeComGroupService self;

    public PageResult<WeComGroupRespVO> getPage(WeComGroupPageReqVO req) {
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        String ownerHash = req.getOwnerKey() == null || req.getOwnerKey().isBlank() ? null : ownerHash(tenantId, req.getOwnerKey());
        String nameHash = req.getQuery() == null || req.getQuery().isBlank() ? null
                : crypto.indexHash("wecom-group-name-" + tenantId, req.getQuery().trim());
        PageResult<WeComGroupDO> page = groupMapper.selectPage(req, ownerHash, nameHash);
        boolean piiVisible = Boolean.TRUE.equals(req.getIncludePii()) && hasPiiPermission();
        return new PageResult<>(page.getList().stream().map(row -> toResp(row, piiVisible, false)).toList(), page.getTotal());
    }

    public WeComGroupRespVO get(Long id, boolean includePii) {
        WeComGroupDO row = groupMapper.selectById(id);
        if (row == null) throw exception(ErrorCodeConstants.WECOM_CONTACT_NOT_FOUND);
        return toResp(row, includePii && hasPiiPermission(), true);
    }

    public boolean hasPiiPermission() { return security.hasPermission("callphone:wecom:contact:pii"); }
    public boolean hasSyncPermission() { return security.hasPermission("callphone:wecom:group:sync"); }

    public List<WeComFollowUserRespVO> getFollowUserOptions() {
        return apiClient.getFollowUsers(requireConnection()).stream()
                .map(user -> new WeComFollowUserRespVO(user.userId(), user.name())).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public WeComSyncJobRespVO createSyncJob(WeComGroupSyncReqVO req, Long requestedBy) {
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        String ownerHash = ownerHash(tenantId, req.getOwnerKey());
        WeComSyncJobDO existing = weComSyncJobMapper.selectByRequestAndKey(requestedBy, req.getIdempotencyKey());
        if (existing != null) {
            if (!"group".equals(existing.getResourceType()) || !existing.getOwnerUserIdHash().equals(ownerHash)) throw exception(ErrorCodeConstants.IDEMPOTENCY_CONFLICT);
            return toJob(existing);
        }
        IntegrationConnectionDO connection = requireConnection();
        if (weComSyncJobMapper.selectCount(new cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX<WeComSyncJobDO>()
                .eq(WeComSyncJobDO::getOwnerUserIdHash, ownerHash)
                .eq(WeComSyncJobDO::getResourceType, "group")
                .in(WeComSyncJobDO::getStatus, List.of("queued", "running"))) > 0) {
            throw exception(ErrorCodeConstants.WECOM_UPSTREAM_UNAVAILABLE);
        }
        WeComSyncJobDO job = new WeComSyncJobDO();
        job.setId(IdUtil.getSnowflake().nextId()); job.setRequestedBy(requestedBy); job.setOwnerUserIdHash(ownerHash);
        job.setResourceType("group");
        job.setOwnerUserIdCiphertext(crypto.encrypt(req.getOwnerKey())); job.setIdempotencyKey(req.getIdempotencyKey());
        job.setStatus("queued"); job.setTotal(0); job.setProcessed(0); job.setSucceeded(0); job.setFailed(0);
        weComSyncJobMapper.insert(job);
        Long jobId = job.getId();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { self.runSyncAsync(jobId, tenantId); }
        });
        return toJob(job);
    }

    public WeComSyncJobRespVO getSyncJob(Long id, Long requestedBy) {
        WeComSyncJobDO job = weComSyncJobMapper.selectByOwnerAndRequest(id, requestedBy, "group");
        return job == null ? null : toJob(job);
    }

    @Async
    public void runSyncAsync(Long jobId, Long tenantId) { TenantUtils.execute(tenantId, () -> runSync(jobId)); }

    private void runSync(Long jobId) {
        WeComSyncJobDO job = weComSyncJobMapper.selectById(jobId);
        if (job == null) return;
        LocalDateTime started = LocalDateTime.now();
        updateJob(jobId, "running", 0, 0, 0, 0, null, started, null);
        int succeeded = 0, failed = 0, processed = 0;
        try {
            IntegrationConnectionDO connection = requireConnection();
            String ownerId = crypto.decrypt(job.getOwnerUserIdCiphertext());
            String ownerName = apiClient.getFollowUserName(connection, ownerId);
            List<String> chatIds = apiClient.getGroupChatIds(connection, ownerId);
            if (chatIds.size() > 5000) throw exception(ErrorCodeConstants.WECOM_UPSTREAM_UNAVAILABLE);
            updateJob(jobId, "running", chatIds.size(), 0, 0, 0, null, started, null);
            Set<String> activeChatHashes = new HashSet<>();
            for (String chatId : chatIds) {
                try { syncGroup(connection, ownerId, ownerName, chatId); succeeded++; activeChatHashes.add(chatHash(TenantContextHolder.getRequiredTenantId(), chatId)); }
                catch (RuntimeException ex) { failed++; }
                processed++;
                updateJob(jobId, "running", chatIds.size(), processed, succeeded, failed, null, started, null);
            }
            if (failed == 0) markMissingGroups(ownerHash(TenantContextHolder.getRequiredTenantId(), ownerId), activeChatHashes);
            String status = failed == 0 ? "completed" : succeeded == 0 ? "failed" : "partial";
            updateJob(jobId, status, chatIds.size(), processed, succeeded, failed,
                    failed == 0 ? null : "GROUP_SYNC_PARTIAL", started, LocalDateTime.now());
        } catch (RuntimeException ex) {
            updateJob(jobId, "failed", processed, processed, succeeded, failed, "WECOM_SYNC_UNAVAILABLE", started, LocalDateTime.now());
        }
    }

    private void syncGroup(IntegrationConnectionDO connection, String ownerId, String ownerName, String chatId) {
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        String chatHash = chatHash(tenantId, chatId);
        JsonNode groupJson = apiClient.getGroupChat(connection, chatId);
        String groupName = safeText(groupJson, "name", 256);
        JsonNode members = groupJson.path("member_list");
        List<JsonNode> memberRows = new ArrayList<>();
        if (members.isArray()) members.forEach(memberRows::add);
        if (memberRows.size() > 5000) throw exception(ErrorCodeConstants.WECOM_UPSTREAM_UNAVAILABLE);
        LocalDateTime now = LocalDateTime.now();
        WeComGroupDO group = groupMapper.selectOne(new cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX<WeComGroupDO>()
                .eq(WeComGroupDO::getChatIdHash, chatHash));
        if (group == null) {
            group = new WeComGroupDO(); group.setId(IdUtil.getSnowflake().nextId());
            group.setChatIdHash(chatHash); group.setChatIdCiphertext(crypto.encrypt(chatId));
        }
        group.setNameSearchHash(groupName == null ? null : crypto.indexHash("wecom-group-name-" + tenantId, groupName));
        group.setProfileCiphertext(crypto.encrypt(groupProfile(groupJson)));
        group.setOwnerUserIdHash(ownerHash(tenantId, ownerId)); group.setOwnerUserIdCiphertext(crypto.encrypt(ownerId));
        group.setOwnerNameCiphertext(crypto.encrypt(ownerName)); group.setGroupStatus("active");
        group.setMemberCount(memberRows.size()); group.setCreatedAt(epoch(groupJson.path("create_time"))); group.setLastSyncedAt(now);
        if (groupMapper.selectById(group.getId()) == null) groupMapper.insert(group); else groupMapper.updateById(group);
        memberMapper.update(null, new LambdaUpdateWrapper<WeComGroupMemberDO>().eq(WeComGroupMemberDO::getGroupId, group.getId())
                .set(WeComGroupMemberDO::getIsActive, false));
        for (JsonNode member : memberRows) syncMember(group.getId(), member, now, tenantId);
    }

    private void syncMember(Long groupId, JsonNode member, LocalDateTime now, Long tenantId) {
        String memberId = safeText(member, "userid", 256);
        if (memberId == null) return;
        String memberHash = crypto.indexHash("wecom-group-member-" + tenantId,
                member.path("type").asText("unknown") + ":" + memberId);
        WeComGroupMemberDO row = memberMapper.selectByGroupAndHash(groupId, memberHash);
        if (row == null) {
            row = new WeComGroupMemberDO(); row.setId(IdUtil.getSnowflake().nextId()); row.setGroupId(groupId);
            row.setMemberIdHash(memberHash); row.setMemberIdCiphertext(crypto.encrypt(memberId));
        }
        row.setMemberType(member.path("type").asText("unknown"));
        row.setMemberNameCiphertext(crypto.encrypt(safeText(member, "name", 256)));
        row.setMemberInfoCiphertext(crypto.encrypt(member.toString()));
        row.setJoinTime(epoch(member.path("join_time")));
        row.setJoinScene(member.path("join_scene").isNumber() ? Integer.toString(member.path("join_scene").asInt()) : null);
        row.setIsGroupAdmin(member.path("group_admin").asInt(0) == 1); row.setIsActive(true); row.setLastSyncedAt(now);
        if (memberMapper.selectById(row.getId()) == null) memberMapper.insert(row); else memberMapper.updateById(row);
    }

    private void markMissingGroups(String ownerHash, Set<String> activeHashes) {
        List<WeComGroupDO> groups = groupMapper.selectList(new cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX<WeComGroupDO>()
                .eq(WeComGroupDO::getOwnerUserIdHash, ownerHash));
        for (WeComGroupDO group : groups) {
            if (!activeHashes.contains(group.getChatIdHash())) groupMapper.update(null,
                    new LambdaUpdateWrapper<WeComGroupDO>().eq(WeComGroupDO::getId, group.getId()).set(WeComGroupDO::getGroupStatus, "dissolved"));
        }
    }

    private WeComGroupRespVO toResp(WeComGroupDO row, boolean piiVisible, boolean detail) {
        WeComGroupRespVO resp = new WeComGroupRespVO();
        resp.setId(row.getId()); resp.setStatus(row.getGroupStatus()); resp.setMemberCount(row.getMemberCount());
        resp.setCreatedAt(row.getCreatedAt()); resp.setLastSyncedAt(row.getLastSyncedAt()); resp.setPiiVisible(piiVisible);
        resp.setOwnerKey(crypto.decrypt(row.getOwnerUserIdCiphertext())); resp.setOwnerName(crypto.decrypt(row.getOwnerNameCiphertext()));
        String profile = crypto.decrypt(row.getProfileCiphertext());
        if (piiVisible) {
            Map<?, ?> map = profile == null ? Map.of() : JSONUtil.toBean(profile, Map.class);
            resp.setName(asString(map.get("name")));
        } else resp.setName(row.getNameSearchHash() == null ? "企微群" : "企微群·" + row.getNameSearchHash().substring(0, 4));
        if (detail) {
            List<WeComGroupRespVO.MemberVO> memberVos = new ArrayList<>();
            if (piiVisible) for (WeComGroupMemberDO member : memberMapper.selectByGroupId(row.getId())) {
                WeComGroupRespVO.MemberVO mv = new WeComGroupRespVO.MemberVO();
                mv.setName(crypto.decrypt(member.getMemberNameCiphertext())); mv.setType(memberType(member.getMemberType()));
                mv.setJoinedAt(member.getJoinTime()); mv.setGroupAdmin(Boolean.TRUE.equals(member.getIsGroupAdmin())); memberVos.add(mv);
            }
            resp.setMembers(memberVos);
        }
        return resp;
    }

    private String groupProfile(JsonNode group) {
        Map<String, String> profile = new HashMap<>();
        profile.put("name", safeText(group, "name", 256)); profile.put("notice", safeText(group, "notice", 2048));
        return JSONUtil.toJsonStr(profile);
    }
    private String memberType(String type) { return switch (type) { case "1" -> "企业成员"; case "2" -> "外部联系人"; default -> "其他成员"; }; }
    private String safeText(JsonNode node, String field, int max) { JsonNode value = node.get(field); return value != null && value.isTextual() && value.asText().length() <= max ? value.asText() : null; }
    private LocalDateTime epoch(JsonNode value) { return value != null && value.canConvertToLong() && value.asLong() > 0 ? LocalDateTime.ofInstant(Instant.ofEpochSecond(value.asLong()), ZoneId.systemDefault()) : null; }
    private String ownerHash(Long tenantId, String value) { return crypto.indexHash("wecom-owner-" + tenantId, value); }
    private String chatHash(Long tenantId, String value) { return crypto.indexHash("wecom-chat-" + tenantId, value); }
    private String asString(Object value) { return value instanceof String text ? text : null; }
    private IntegrationConnectionDO requireConnection() { IntegrationConnectionDO row = integrationMapper.selectByProvider("wecom"); if (row == null || row.getCredentialCiphertext() == null) throw exception(ErrorCodeConstants.WECOM_NOT_CONFIGURED); return row; }
    private void updateJob(Long id, String status, int total, int processed, int succeeded, int failed, String error, LocalDateTime started, LocalDateTime finished) {
        weComSyncJobMapper.update(null, new LambdaUpdateWrapper<WeComSyncJobDO>().eq(WeComSyncJobDO::getId, id)
                .set(WeComSyncJobDO::getStatus, status).set(WeComSyncJobDO::getTotal, total).set(WeComSyncJobDO::getProcessed, processed)
                .set(WeComSyncJobDO::getSucceeded, succeeded).set(WeComSyncJobDO::getFailed, failed).set(WeComSyncJobDO::getErrorCode, error)
                .set(WeComSyncJobDO::getStartedAt, started).set(WeComSyncJobDO::getFinishedAt, finished));
    }
    private WeComSyncJobRespVO toJob(WeComSyncJobDO job) {
        WeComSyncJobRespVO resp = new WeComSyncJobRespVO(); resp.setId(job.getId()); resp.setStatus(job.getStatus());
        resp.setTotal(job.getTotal()); resp.setProcessed(job.getProcessed()); resp.setSucceeded(job.getSucceeded()); resp.setFailed(job.getFailed());
        resp.setErrorCode(job.getErrorCode()); resp.setStartedAt(job.getStartedAt()); resp.setFinishedAt(job.getFinishedAt()); return resp;
    }
}
