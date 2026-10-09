package cn.iocoder.yudao.module.callphone.service.outbound;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordingAccessAuditDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordingAssetDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordingAccessAuditMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordingAssetMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.framework.datapermission.CallPhoneOwnerScopeService;
import jakarta.annotation.Resource;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class CallRecordingAccessService {

    private static final String CALL_RECORD_PURPOSE = "call_record_detail";
    private static final String SERVICE_REVIEW_PURPOSE = "service_review";

    @Resource private CallRecordMapper callRecordMapper;
    @Resource private CallRecordingAssetMapper assetMapper;
    @Resource private CallRecordingStorageService storage;
    @Resource private CallRecordingAccessAuditMapper auditMapper;
    @Resource private CallPhoneOwnerScopeService ownerScopeService;

    @Transactional(rollbackFor = Exception.class)
    public CallRecordingContent readWithinCurrentDataScope(Long callRecordId, Long actorId) {
        CallRecordDO call = requireReadyCall(callRecordId);
        if (!ownerScopeService.getCurrentUserScope().allows(call.getOwnerUserId())) {
            throw exception(ErrorCodeConstants.CALL_RECORDING_NOT_FOUND);
        }
        return readAndAudit(call, actorId, CALL_RECORD_PURPOSE);
    }

    @Transactional(rollbackFor = Exception.class)
    public CallRecordingContent readForServiceReview(Long callRecordId, Long actorId) {
        CallRecordDO call = requireReadyCall(callRecordId);
        if (!Objects.equals(call.getOwnerUserId(), actorId)) {
            throw exception(ErrorCodeConstants.CALL_RECORDING_NOT_FOUND);
        }
        return readAndAudit(call, actorId, SERVICE_REVIEW_PURPOSE);
    }

    private CallRecordDO requireReadyCall(Long callRecordId) {
        CallRecordDO call = callRecordMapper.selectById(callRecordId);
        if (call == null || !"ended".equals(call.getStatus()) || !"ready".equals(call.getRecordingState())) {
            throw exception(ErrorCodeConstants.CALL_RECORDING_NOT_FOUND);
        }
        return call;
    }

    private CallRecordingContent readAndAudit(CallRecordDO call, Long actorId, String purpose) {
        CallRecordingAssetDO asset = assetMapper.selectByCallRecordId(call.getId());
        if (asset == null || !Objects.equals(asset.getOwnerUserId(), call.getOwnerUserId())
                || !Objects.equals(asset.getDeviceId(), call.getDeviceId())) {
            throw exception(ErrorCodeConstants.CALL_RECORDING_NOT_FOUND);
        }
        byte[] bytes = storage.read(asset);

        CallRecordingAccessAuditDO audit = new CallRecordingAccessAuditDO();
        audit.setId(IdUtil.getSnowflake().nextId());
        audit.setCallRecordId(call.getId());
        audit.setActorId(actorId);
        audit.setAccessPurpose(purpose);
        auditMapper.insert(audit);
        return new CallRecordingContent(asset.getContentType(), bytes);
    }
}
