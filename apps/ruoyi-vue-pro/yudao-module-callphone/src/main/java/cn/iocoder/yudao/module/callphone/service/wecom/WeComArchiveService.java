package cn.iocoder.yudao.module.callphone.service.wecom;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.security.core.service.SecurityFrameworkService;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveContentReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveContentRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveCleanupRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchivePageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveRetentionRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveRetentionSaveReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveSyncStatusRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComArchiveAccessAuditDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComArchiveMessageDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComArchiveSyncCursorDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComArchiveRetentionDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComArchiveAccessAuditMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComArchiveMessageMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComArchiveSyncCursorMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComArchiveRetentionMapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Service
public class WeComArchiveService {
    @Resource private WeComArchiveMessageMapper messageMapper;
    @Resource private WeComArchiveSyncCursorMapper cursorMapper;
    @Resource private WeComArchiveRetentionMapper retentionMapper;
    @Resource private WeComArchiveAccessAuditMapper auditMapper;
    @Resource private PiiCryptoService crypto;
    @Resource private SecurityFrameworkService security;

    public PageResult<WeComArchiveRespVO> getPage(WeComArchivePageReqVO req) {
        if (req.getFromTime() != null && req.getToTime() != null && req.getFromTime().isAfter(req.getToTime())) {
            throw exception(ErrorCodeConstants.WECOM_ARCHIVE_DATE_RANGE_INVALID);
        }
        PageResult<WeComArchiveMessageDO> page = messageMapper.selectPage(req, retentionCutoff());
        return new PageResult<>(page.getList().stream().map(this::toResp).toList(), page.getTotal());
    }

    public WeComArchiveSyncStatusRespVO getSyncStatus() {
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        String keyHash = crypto.indexHash("wecom-archive-cursor-" + tenantId, "primary");
        WeComArchiveSyncCursorDO cursor = cursorMapper.selectByCursorKeyHash(keyHash);
        WeComArchiveSyncStatusRespVO resp = new WeComArchiveSyncStatusRespVO();
        resp.setEnabled(cursor != null && !"disabled".equals(cursor.getStatus()));
        resp.setStatus(cursor == null ? "disabled" : cursor.getStatus());
        resp.setLastSyncAt(cursor == null ? null : cursor.getLastSyncAt());
        resp.setErrorCode(cursor == null ? "ARCHIVE_SDK_NOT_CONNECTED" : cursor.getErrorCode());
        resp.setReason(cursor == null || "disabled".equals(cursor.getStatus())
                ? "尚未接入企业微信会话存档 SDK 或完成成员授权；页面不会展示模拟消息。"
                : "当前存档状态由本地同步适配器提供。");
        return resp;
    }

    public WeComArchiveRetentionRespVO getRetention() {
        WeComArchiveRetentionDO row = retentionMapper.selectCurrent();
        WeComArchiveRetentionRespVO resp = new WeComArchiveRetentionRespVO();
        resp.setRetentionDays(row == null ? 180 : row.getRetentionDays());
        resp.setVersion(row == null ? 0 : row.getVersion());
        return resp;
    }

    @Transactional(rollbackFor = Exception.class)
    public WeComArchiveRetentionRespVO saveRetention(WeComArchiveRetentionSaveReqVO req) {
        WeComArchiveRetentionDO row = retentionMapper.selectCurrent();
        if (row == null) {
            if (req.getExpectedVersion() != 0) throw exception(ErrorCodeConstants.WECOM_ARCHIVE_RETENTION_CONFLICT);
            row = new WeComArchiveRetentionDO();
            row.setId(IdUtil.getSnowflake().nextId());
            row.setRetentionDays(req.getRetentionDays());
            row.setVersion(1);
            retentionMapper.insert(row);
        } else {
            if (!req.getExpectedVersion().equals(row.getVersion())) throw exception(ErrorCodeConstants.WECOM_ARCHIVE_RETENTION_CONFLICT);
            int nextVersion = row.getVersion() + 1;
            int updated = retentionMapper.update(null, new LambdaUpdateWrapper<WeComArchiveRetentionDO>()
                    .eq(WeComArchiveRetentionDO::getId, row.getId())
                    .eq(WeComArchiveRetentionDO::getVersion, req.getExpectedVersion())
                    .set(WeComArchiveRetentionDO::getRetentionDays, req.getRetentionDays())
                    .set(WeComArchiveRetentionDO::getVersion, nextVersion));
            if (updated == 0) throw exception(ErrorCodeConstants.WECOM_ARCHIVE_RETENTION_CONFLICT);
            row.setRetentionDays(req.getRetentionDays());
            row.setVersion(nextVersion);
        }
        WeComArchiveRetentionRespVO resp = new WeComArchiveRetentionRespVO();
        resp.setRetentionDays(row.getRetentionDays()); resp.setVersion(row.getVersion());
        return resp;
    }

    @Transactional(rollbackFor = Exception.class)
    public WeComArchiveCleanupRespVO cleanupExpired(Long actorId) {
        return cleanupExpired(actorId, "user");
    }

    @Transactional(rollbackFor = Exception.class)
    public WeComArchiveCleanupRespVO cleanupExpiredForSystem() {
        return cleanupExpired(0L, "system");
    }

    private WeComArchiveCleanupRespVO cleanupExpired(Long actorId, String actorType) {
        WeComArchiveRetentionDO retention = retentionMapper.selectCurrent();
        int days = retention == null ? 180 : retention.getRetentionDays();
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime cutoff = now.minusDays(days);
        java.util.List<WeComArchiveMessageDO> expired = messageMapper.selectExpiredForCleanup(tenantId, cutoff, now, 500);
        for (WeComArchiveMessageDO message : expired) {
            WeComArchiveAccessAuditDO audit = new WeComArchiveAccessAuditDO();
            audit.setId(IdUtil.getSnowflake().nextId());
            audit.setMessageId(message.getId());
            audit.setActorId(actorId);
            audit.setActorType(actorType);
            audit.setPurposeCiphertext(crypto.encrypt("执行保留期限清理：超过 " + days + " 天"));
            auditMapper.insert(audit);
        }
        int deletedCount = expired.isEmpty() ? 0 : messageMapper.hardDeleteExpiredMessages(tenantId,
                expired.stream().map(WeComArchiveMessageDO::getId).toList());
        WeComArchiveCleanupRespVO resp = new WeComArchiveCleanupRespVO();
        resp.setDeletedCount(deletedCount);
        resp.setRemainingCount(messageMapper.countExpiredForCleanup(tenantId, cutoff, LocalDateTime.now()));
        return resp;
    }

    @Transactional(rollbackFor = Exception.class)
    public WeComArchiveContentRespVO getContent(WeComArchiveContentReqVO req) {
        if (req.getPurpose() == null || req.getPurpose().trim().length() < 8) {
            throw exception(ErrorCodeConstants.WECOM_ARCHIVE_PURPOSE_REQUIRED);
        }
        if (!security.hasPermission("callphone:wecom:archive:view-content")) {
            throw exception(ErrorCodeConstants.WECOM_ARCHIVE_MESSAGE_NOT_FOUND);
        }
        WeComArchiveMessageDO row = messageMapper.selectById(req.getId());
        if (row == null || row.getExpiresAt() == null || !row.getExpiresAt().isAfter(LocalDateTime.now())
                || row.getMessageTime() == null || !row.getMessageTime().isAfter(retentionCutoff())) {
            throw exception(ErrorCodeConstants.WECOM_ARCHIVE_MESSAGE_NOT_FOUND);
        }
        WeComArchiveAccessAuditDO audit = new WeComArchiveAccessAuditDO();
        audit.setId(IdUtil.getSnowflake().nextId());
        audit.setMessageId(row.getId());
        audit.setActorId(getLoginUserId());
        audit.setActorType("user");
        audit.setPurposeCiphertext(crypto.encrypt(req.getPurpose().trim()));
        auditMapper.insert(audit);

        WeComArchiveContentRespVO resp = new WeComArchiveContentRespVO();
        resp.setId(row.getId());
        resp.setConversationRef("会话·" + row.getConversationIdHash().substring(0, 6));
        resp.setConversationType(row.getConversationType());
        resp.setMessageType(row.getMessageType());
        resp.setMessageTime(row.getMessageTime());
        resp.setContent(crypto.decrypt(row.getContentCiphertext()));
        resp.setExpiresAt(row.getExpiresAt());
        return resp;
    }

    private WeComArchiveRespVO toResp(WeComArchiveMessageDO row) {
        WeComArchiveRespVO resp = new WeComArchiveRespVO();
        resp.setId(row.getId());
        resp.setConversationRef("会话·" + row.getConversationIdHash().substring(0, 6));
        resp.setConversationType(row.getConversationType());
        resp.setMessageType(row.getMessageType());
        resp.setMessageTime(row.getMessageTime());
        resp.setParticipantCount(row.getParticipantCount());
        resp.setExpiresAt(row.getExpiresAt());
        return resp;
    }

    private LocalDateTime retentionCutoff() {
        WeComArchiveRetentionDO retention = retentionMapper.selectCurrent();
        return LocalDateTime.now().minusDays(retention == null ? 180 : retention.getRetentionDays());
    }
}
