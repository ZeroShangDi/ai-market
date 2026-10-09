package cn.iocoder.yudao.module.callphone.service.wecom;

import cn.hutool.core.util.IdUtil;
import cn.hutool.json.JSONUtil;
import cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignActionReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignAuditRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignEstimateReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignEstimateRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComFollowUserRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignReviewReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComCampaignAuditDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComCampaignDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComContactOwnerDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComCampaignAuditMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComCampaignMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComContactOwnerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.settings.IntegrationConnectionMapper;
import cn.iocoder.yudao.module.callphone.dal.dataobject.settings.IntegrationConnectionDO;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

/** Local-only campaign drafts and approval handoff. This service never sends WeCom messages. */
@Service
public class WeComCampaignService {
    @Resource private WeComCampaignMapper campaignMapper;
    @Resource private WeComCampaignAuditMapper auditMapper;
    @Resource private WeComContactOwnerMapper contactOwnerMapper;
    @Resource private IntegrationConnectionMapper integrationMapper;
    @Resource private WeComApiClient apiClient;
    @Resource private PiiCryptoService crypto;
    @Resource private AdminUserApi adminUserApi;

    public PageResult<WeComCampaignRespVO> getPage(WeComCampaignPageReqVO req) {
        PageResult<WeComCampaignDO> page = campaignMapper.selectPage(req);
        return new PageResult<>(page.getList().stream().map(row -> toResp(row, false)).toList(), page.getTotal());
    }

    public WeComCampaignRespVO get(Long id) {
        WeComCampaignDO row = campaignMapper.selectById(id);
        if (row == null) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_NOT_FOUND);
        return toResp(row, true);
    }

    public List<WeComCampaignAuditRespVO> getAuditList(Long id) {
        if (campaignMapper.selectById(id) == null) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_NOT_FOUND);
        List<WeComCampaignAuditDO> audits = auditMapper.selectList(new LambdaQueryWrapper<WeComCampaignAuditDO>()
                .eq(WeComCampaignAuditDO::getCampaignId, id)
                .orderByAsc(WeComCampaignAuditDO::getCreateTime).orderByAsc(WeComCampaignAuditDO::getId));
        java.util.Set<Long> actorIds = audits.stream().map(WeComCampaignAuditDO::getActorId)
                .filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet());
        Map<Long, AdminUserRespDTO> users = actorIds.isEmpty() ? Map.of() : adminUserApi.getUserMap(actorIds);
        return audits.stream().map(event -> {
            WeComCampaignAuditRespVO resp = new WeComCampaignAuditRespVO();
            resp.setAction(event.getAction());
            resp.setActorId(event.getActorId());
            AdminUserRespDTO actor = users.get(event.getActorId());
            resp.setActorName(actor == null ? null : actor.getNickname());
            resp.setNote(event.getNoteCiphertext() == null ? null : crypto.decrypt(event.getNoteCiphertext()));
            resp.setCampaignVersion(event.getCampaignVersion());
            resp.setCreateTime(event.getCreateTime());
            return resp;
        }).toList();
    }

    public List<WeComFollowUserRespVO> getAudienceOptions() {
        IntegrationConnectionDO connection = integrationMapper.selectByProvider("wecom");
        return apiClient.getFollowUsers(connection).stream().map(user -> new WeComFollowUserRespVO(user.userId(), user.name())).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public WeComCampaignRespVO save(WeComCampaignSaveReqVO req, Long actorId) {
        if (req.getName() == null || req.getName().isBlank() || req.getContent() == null || req.getContent().isBlank()
                || req.getOwnerKey() == null || req.getOwnerKey().isBlank()) {
            throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
        }
        Map<String, String> criteria = criteria(req.getOwnerKey(), req.getTag());
        if (req.getId() == null) {
            if (req.getExpectedVersion() != 0) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_STATE_CONFLICT);
            WeComCampaignDO row = new WeComCampaignDO(); row.setId(IdUtil.getSnowflake().nextId());
            row.setCampaignNameCiphertext(crypto.encrypt(req.getName().trim()));
            row.setMessageContentCiphertext(crypto.encrypt(req.getContent().trim()));
            row.setCriteriaCiphertext(crypto.encrypt(JSONUtil.toJsonStr(criteria)));
            row.setStatus("draft"); row.setVersion(1); campaignMapper.insert(row);
            audit(row.getId(), "draft_saved", actorId, row.getVersion());
            return toResp(row, true);
        }
        WeComCampaignDO existing = campaignMapper.selectById(req.getId());
        if (existing == null || !Objects.equals(existing.getVersion(), req.getExpectedVersion())
                || !List.of("draft", "withdrawn", "rejected").contains(existing.getStatus())) {
            throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_STATE_CONFLICT);
        }
        int nextVersion = existing.getVersion() + 1;
        LambdaUpdateWrapper<WeComCampaignDO> update = new LambdaUpdateWrapper<WeComCampaignDO>()
                .eq(WeComCampaignDO::getId, req.getId()).eq(WeComCampaignDO::getVersion, req.getExpectedVersion())
                .in(WeComCampaignDO::getStatus, List.of("draft", "withdrawn", "rejected"))
                .set(WeComCampaignDO::getCampaignNameCiphertext, crypto.encrypt(req.getName().trim()))
                .set(WeComCampaignDO::getMessageContentCiphertext, crypto.encrypt(req.getContent().trim()))
                .set(WeComCampaignDO::getCriteriaCiphertext, crypto.encrypt(JSONUtil.toJsonStr(criteria)))
                .set(WeComCampaignDO::getEstimatedRecipientCount, null).set(WeComCampaignDO::getEstimatedAt, null)
                .set(WeComCampaignDO::getStatus, "draft").set(WeComCampaignDO::getVersion, nextVersion);
        if (campaignMapper.update(null, update) == 0) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_STATE_CONFLICT);
        audit(req.getId(), "draft_saved", actorId, nextVersion);
        return get(req.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public WeComCampaignEstimateRespVO estimate(WeComCampaignEstimateReqVO req, Long actorId) {
        WeComCampaignDO row = campaignMapper.selectById(req.getId());
        if (row == null || !Objects.equals(row.getVersion(), req.getExpectedVersion()) || !"draft".equals(row.getStatus())) {
            throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_STATE_CONFLICT);
        }
        Map<?, ?> criteria = JSONUtil.toBean(crypto.decrypt(row.getCriteriaCiphertext()), Map.class);
        String ownerKey = criteria.get("ownerKey") instanceof String value ? value : null;
        String tag = criteria.get("tag") instanceof String value ? value : "";
        if (ownerKey == null || ownerKey.isBlank()) throw exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        String ownerHash = crypto.indexHash("wecom-owner-" + tenantId, ownerKey);
        List<WeComContactOwnerDO> owners = contactOwnerMapper.selectByOwnerHash(ownerHash);
        if (owners.size() > 100_000) throw exception(ErrorCodeConstants.WECOM_UPSTREAM_UNAVAILABLE);
        int count = tag.isBlank() ? owners.size() : (int) owners.stream().filter(owner -> containsTag(owner, tag)).count();
        LocalDateTime estimatedAt = LocalDateTime.now();
        int nextVersion = row.getVersion() + 1;
        LambdaUpdateWrapper<WeComCampaignDO> update = new LambdaUpdateWrapper<WeComCampaignDO>()
                .eq(WeComCampaignDO::getId, row.getId()).eq(WeComCampaignDO::getVersion, req.getExpectedVersion())
                .eq(WeComCampaignDO::getStatus, "draft").set(WeComCampaignDO::getEstimatedRecipientCount, count)
                .set(WeComCampaignDO::getEstimatedAt, estimatedAt).set(WeComCampaignDO::getVersion, nextVersion);
        if (campaignMapper.update(null, update) == 0) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_STATE_CONFLICT);
        audit(row.getId(), "audience_estimated", actorId, nextVersion);
        WeComCampaignEstimateRespVO resp = new WeComCampaignEstimateRespVO();
        resp.setCount(count); resp.setEstimatedAt(estimatedAt); resp.setVersion(nextVersion);
        resp.setBasis(tag.isBlank() ? "所选员工的本地企微客户快照" : "所选员工及标签匹配的本地企微客户快照");
        return resp;
    }

    @Transactional(rollbackFor = Exception.class)
    public WeComCampaignRespVO submit(WeComCampaignActionReqVO req, Long actorId) {
        WeComCampaignDO row = campaignMapper.selectById(req.getId());
        if (row == null) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_NOT_FOUND);
        if (!Objects.equals(row.getVersion(), req.getExpectedVersion()) || !"draft".equals(row.getStatus())) {
            throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_STATE_CONFLICT);
        }
        if (row.getEstimatedAt() == null || row.getEstimatedAt().isBefore(LocalDateTime.now().minusMinutes(30))
                || row.getEstimatedRecipientCount() == null || row.getEstimatedRecipientCount() < 1) {
            throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_ESTIMATE_REQUIRED);
        }
        int nextVersion = row.getVersion() + 1;
        LambdaUpdateWrapper<WeComCampaignDO> update = new LambdaUpdateWrapper<WeComCampaignDO>()
                .eq(WeComCampaignDO::getId, row.getId()).eq(WeComCampaignDO::getVersion, req.getExpectedVersion())
                .eq(WeComCampaignDO::getStatus, "draft").set(WeComCampaignDO::getStatus, "pending_review")
                .set(WeComCampaignDO::getVersion, nextVersion);
        if (campaignMapper.update(null, update) == 0) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_STATE_CONFLICT);
        audit(row.getId(), "submitted_for_review", actorId, nextVersion);
        return get(row.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public WeComCampaignRespVO withdraw(WeComCampaignActionReqVO req, Long actorId) {
        WeComCampaignDO row = campaignMapper.selectById(req.getId());
        if (row == null) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_NOT_FOUND);
        if (!Objects.equals(row.getVersion(), req.getExpectedVersion()) || !"pending_review".equals(row.getStatus())) {
            throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_STATE_CONFLICT);
        }
        int nextVersion = row.getVersion() + 1;
        LambdaUpdateWrapper<WeComCampaignDO> update = new LambdaUpdateWrapper<WeComCampaignDO>()
                .eq(WeComCampaignDO::getId, row.getId()).eq(WeComCampaignDO::getVersion, req.getExpectedVersion())
                .eq(WeComCampaignDO::getStatus, "pending_review").set(WeComCampaignDO::getStatus, "withdrawn")
                .set(WeComCampaignDO::getVersion, nextVersion);
        if (campaignMapper.update(null, update) == 0) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_STATE_CONFLICT);
        audit(row.getId(), "withdrawn", actorId, nextVersion);
        return get(row.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public WeComCampaignRespVO approve(WeComCampaignReviewReqVO req, Long actorId) {
        return review(req, actorId, "approved", "approved", false);
    }

    @Transactional(rollbackFor = Exception.class)
    public WeComCampaignRespVO reject(WeComCampaignReviewReqVO req, Long actorId) {
        return review(req, actorId, "rejected", "rejected", true);
    }

    private WeComCampaignRespVO review(WeComCampaignReviewReqVO req, Long actorId, String status, String action,
                                       boolean noteRequired) {
        String note = req.getNote() == null ? "" : req.getNote().trim();
        if (noteRequired && note.isBlank()) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_REVIEW_NOTE_REQUIRED);
        WeComCampaignDO row = campaignMapper.selectById(req.getId());
        if (row == null) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_NOT_FOUND);
        if (!Objects.equals(row.getVersion(), req.getExpectedVersion()) || !"pending_review".equals(row.getStatus())) {
            throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_STATE_CONFLICT);
        }
        int nextVersion = row.getVersion() + 1;
        LambdaUpdateWrapper<WeComCampaignDO> update = new LambdaUpdateWrapper<WeComCampaignDO>()
                .eq(WeComCampaignDO::getId, row.getId()).eq(WeComCampaignDO::getVersion, req.getExpectedVersion())
                .eq(WeComCampaignDO::getStatus, "pending_review").set(WeComCampaignDO::getStatus, status)
                .set(WeComCampaignDO::getVersion, nextVersion);
        if (campaignMapper.update(null, update) == 0) throw exception(ErrorCodeConstants.WECOM_CAMPAIGN_STATE_CONFLICT);
        audit(row.getId(), action, actorId, nextVersion, note.isBlank() ? null : crypto.encrypt(note));
        return get(row.getId());
    }

    private boolean containsTag(WeComContactOwnerDO owner, String expected) {
        String encrypted = owner.getFollowInfoCiphertext();
        if (encrypted == null) return false;
        Map<?, ?> data = JSONUtil.toBean(crypto.decrypt(encrypted), Map.class);
        Object rawTags = data.get("tags");
        return rawTags instanceof List<?> tags && tags.stream().anyMatch(tag -> tag instanceof String value && value.equalsIgnoreCase(expected));
    }
    private Map<String, String> criteria(String ownerKey, String tag) {
        return Map.of("ownerKey", ownerKey.trim(), "tag", tag == null ? "" : tag.trim());
    }
    private void audit(Long campaignId, String action, Long actorId, Integer version) {
        audit(campaignId, action, actorId, version, null);
    }
    private void audit(Long campaignId, String action, Long actorId, Integer version, String noteCiphertext) {
        WeComCampaignAuditDO event = new WeComCampaignAuditDO(); event.setId(IdUtil.getSnowflake().nextId());
        event.setCampaignId(campaignId); event.setAction(action); event.setActorId(actorId); event.setCampaignVersion(version);
        event.setNoteCiphertext(noteCiphertext);
        auditMapper.insert(event);
    }
    private WeComCampaignRespVO toResp(WeComCampaignDO row, boolean includeContent) {
        WeComCampaignRespVO resp = new WeComCampaignRespVO(); resp.setId(row.getId());
        resp.setName(crypto.decrypt(row.getCampaignNameCiphertext()));
        Map<?, ?> criteria = JSONUtil.toBean(crypto.decrypt(row.getCriteriaCiphertext()), Map.class);
        resp.setTag(criteria.get("tag") instanceof String value ? value : "");
        if (includeContent) {
            resp.setContent(crypto.decrypt(row.getMessageContentCiphertext()));
            resp.setOwnerKey(criteria.get("ownerKey") instanceof String value ? value : null);
            resp.setTag(criteria.get("tag") instanceof String value ? value : "");
        }
        resp.setStatus(row.getStatus()); resp.setEstimatedRecipientCount(row.getEstimatedRecipientCount());
        resp.setEstimatedAt(row.getEstimatedAt()); resp.setVersion(row.getVersion());
        resp.setCreateTime(row.getCreateTime()); resp.setUpdateTime(row.getUpdateTime()); return resp;
    }
}
