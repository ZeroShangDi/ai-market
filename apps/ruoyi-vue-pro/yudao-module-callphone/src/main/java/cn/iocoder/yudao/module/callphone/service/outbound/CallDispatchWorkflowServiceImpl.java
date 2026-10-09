package cn.iocoder.yudao.module.callphone.service.outbound;

import cn.hutool.core.util.IdUtil;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchEventDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.MobileCallEventDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallDispatchEventMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallDispatchMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.MobileCallEventMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Objects;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class CallDispatchWorkflowServiceImpl implements CallDispatchWorkflowService {

    private final CallDispatchMapper dispatchMapper;
    private final CallDispatchEventMapper dispatchEventMapper;
    private final CallRecordMapper callRecordMapper;
    private final MobileCallEventMapper mobileCallEventMapper;
    private final CustomerMapper customerMapper;
    private final LeadMapper leadMapper;

    public CallDispatchWorkflowServiceImpl(CallDispatchMapper dispatchMapper,
                                           CallDispatchEventMapper dispatchEventMapper,
                                           CallRecordMapper callRecordMapper,
                                           MobileCallEventMapper mobileCallEventMapper,
                                           CustomerMapper customerMapper,
                                           LeadMapper leadMapper) {
        this.dispatchMapper = dispatchMapper;
        this.dispatchEventMapper = dispatchEventMapper;
        this.callRecordMapper = callRecordMapper;
        this.mobileCallEventMapper = mobileCallEventMapper;
        this.customerMapper = customerMapper;
        this.leadMapper = leadMapper;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean expireIfDue(Long dispatchId, Long requestedBy, Long deviceId, LocalDateTime now) {
        CallDispatchDO dispatch = dispatchMapper.selectById(dispatchId);
        if (dispatch == null || !"queued".equals(dispatch.getStatus()) || dispatch.getExpiresAt().isAfter(now)) {
            return false;
        }
        LambdaUpdateWrapper<CallDispatchDO> update = new LambdaUpdateWrapper<CallDispatchDO>()
                .set(CallDispatchDO::getStatus, "expired")
                .eq(CallDispatchDO::getId, dispatchId)
                .eq(CallDispatchDO::getStatus, "queued")
                .le(CallDispatchDO::getExpiresAt, now);
        if (requestedBy != null) update.eq(CallDispatchDO::getRequestedBy, requestedBy);
        if (deviceId != null) update.eq(CallDispatchDO::getDeviceId, deviceId);
        int changed = dispatchMapper.update(null, update);
        if (changed == 1) appendEvent(dispatch, "expired", "queued", "expired", "system", null, null);
        return changed == 1;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean cancel(Long dispatchId, Long requestedBy, LocalDateTime now) {
        CallDispatchDO dispatch = dispatchMapper.selectById(dispatchId);
        if (dispatch == null || !"queued".equals(dispatch.getStatus())) return false;
        int changed = dispatchMapper.update(null, new LambdaUpdateWrapper<CallDispatchDO>()
                .set(CallDispatchDO::getStatus, "cancelled")
                .eq(CallDispatchDO::getId, dispatchId)
                .eq(CallDispatchDO::getRequestedBy, requestedBy)
                .eq(CallDispatchDO::getStatus, "queued")
                .gt(CallDispatchDO::getExpiresAt, now));
        if (changed == 1) appendEvent(dispatch, "cancelled", "queued", "cancelled", "admin", requestedBy, null);
        return changed == 1;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CallDispatchAcceptance accept(Long dispatchId, Long deviceId, Long requestedBy,
                                         String deviceEventId, LocalDateTime now) {
        CallDispatchDO dispatch = dispatchMapper.selectById(dispatchId);
        if (!isOwnedQueuedDispatch(dispatch, deviceId, requestedBy)) return null;
        if (!dispatch.getExpiresAt().isAfter(now)) {
            expireIfDue(dispatchId, requestedBy, deviceId, now);
            return null;
        }
        CustomerDO customer = dispatch.getCustomerId() == null ? null : customerMapper.selectById(dispatch.getCustomerId());
        LeadDO lead = dispatch.getLeadId() == null ? null : leadMapper.selectById(dispatch.getLeadId());
        if ((customer == null) == (lead == null)
                || (customer != null && (!Objects.equals(customer.getOwnerUserId(), requestedBy)
                    || !"active".equals(customer.getStatus())))
                || (lead != null && (!Objects.equals(lead.getOwnerUserId(), requestedBy)
                    || !"claimed".equals(lead.getStatus())))) {
            throw exception(ErrorCodeConstants.CALL_TARGET_NOT_CALLABLE);
        }

        CallRecordDO record = new CallRecordDO();
        record.setId(IdUtil.getSnowflake().nextId());
        record.setCustomerId(customer == null ? null : customer.getId());
        record.setLeadId(lead == null ? null : lead.getId());
        record.setCallDispatchId(dispatch.getId());
        record.setCustomerNameCiphertext(customer != null ? customer.getNameCiphertext() : lead.getNameCiphertext());
        record.setPhoneCiphertext(dispatch.getPhoneCiphertext());
        record.setPhoneDisplay(dispatch.getPhoneDisplay());
        record.setDirection("outbound");
        record.setOwnerUserId(requestedBy);
        record.setDeviceId(deviceId);
        record.setStatus("requested");
        record.setDurationSeconds(0);
        record.setRecordingState("none");
        record.setSummaryState("unavailable");
        record.setVersion(1);

        int changed = dispatchMapper.update(null, new LambdaUpdateWrapper<CallDispatchDO>()
                .set(CallDispatchDO::getStatus, "accepted")
                .set(CallDispatchDO::getCallRecordId, record.getId())
                .eq(CallDispatchDO::getId, dispatchId)
                .eq(CallDispatchDO::getDeviceId, deviceId)
                .eq(CallDispatchDO::getRequestedBy, requestedBy)
                .eq(CallDispatchDO::getStatus, "queued")
                .gt(CallDispatchDO::getExpiresAt, now));
        if (changed != 1) return null;

        callRecordMapper.insert(record);
        MobileCallEventDO mobileEvent = new MobileCallEventDO();
        mobileEvent.setId(IdUtil.getSnowflake().nextId());
        mobileEvent.setDeviceId(deviceId);
        mobileEvent.setDeviceEventId(deviceEventId);
        mobileEvent.setEventType("accepted");
        mobileEvent.setDispatchId(dispatchId);
        mobileEvent.setCallRecordId(record.getId());
        mobileCallEventMapper.insert(mobileEvent);
        appendEvent(dispatch, "accepted", "queued", "accepted", "mobile", requestedBy, null);
        dispatch.setStatus("accepted");
        dispatch.setCallRecordId(record.getId());
        return new CallDispatchAcceptance(record, dispatch);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean decline(Long dispatchId, Long deviceId, Long requestedBy, String deviceEventId,
                           String reasonCode, LocalDateTime now) {
        CallDispatchDO dispatch = dispatchMapper.selectById(dispatchId);
        if (!isOwnedQueuedDispatch(dispatch, deviceId, requestedBy)) return false;
        if (!dispatch.getExpiresAt().isAfter(now)) {
            expireIfDue(dispatchId, requestedBy, deviceId, now);
            return false;
        }
        int changed = dispatchMapper.update(null, new LambdaUpdateWrapper<CallDispatchDO>()
                .set(CallDispatchDO::getStatus, "declined")
                .eq(CallDispatchDO::getId, dispatchId)
                .eq(CallDispatchDO::getDeviceId, deviceId)
                .eq(CallDispatchDO::getRequestedBy, requestedBy)
                .eq(CallDispatchDO::getStatus, "queued")
                .gt(CallDispatchDO::getExpiresAt, now));
        if (changed != 1) return false;

        MobileCallEventDO mobileEvent = new MobileCallEventDO();
        mobileEvent.setId(IdUtil.getSnowflake().nextId());
        mobileEvent.setDeviceId(deviceId);
        mobileEvent.setDeviceEventId(deviceEventId);
        mobileEvent.setEventType("declined");
        mobileEvent.setDispatchId(dispatchId);
        mobileCallEventMapper.insert(mobileEvent);
        appendEvent(dispatch, "declined", "queued", "declined", "mobile", requestedBy, reasonCode);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int failQueuedForDevice(Long deviceId, Long requestedBy, String reasonCode) {
        int transitioned = 0;
        for (CallDispatchDO dispatch : dispatchMapper.selectList(new LambdaQueryWrapperX<CallDispatchDO>()
                .eq(CallDispatchDO::getDeviceId, deviceId)
                .eq(CallDispatchDO::getRequestedBy, requestedBy)
                .eq(CallDispatchDO::getStatus, "queued"))) {
            int changed = dispatchMapper.update(null, new LambdaUpdateWrapper<CallDispatchDO>()
                    .set(CallDispatchDO::getStatus, "failed")
                    .eq(CallDispatchDO::getId, dispatch.getId())
                    .eq(CallDispatchDO::getDeviceId, deviceId)
                    .eq(CallDispatchDO::getRequestedBy, requestedBy)
                    .eq(CallDispatchDO::getStatus, "queued"));
            if (changed == 1) {
                appendEvent(dispatch, "failed", "queued", "failed", "admin", requestedBy, reasonCode);
                transitioned++;
            }
        }
        return transitioned;
    }

    @Override
    public CallDispatchDO requireAcceptedDispatchForCompletion(Long dispatchId, Long callRecordId) {
        CallDispatchDO dispatch = dispatchMapper.selectById(dispatchId);
        if (dispatch == null || !"accepted".equals(dispatch.getStatus())
                || !Objects.equals(callRecordId, dispatch.getCallRecordId())) {
            throw exception(ErrorCodeConstants.DISPATCH_STATE_CONFLICT);
        }
        return dispatch;
    }

    private boolean isOwnedQueuedDispatch(CallDispatchDO dispatch, Long deviceId, Long requestedBy) {
        return dispatch != null && Objects.equals(dispatch.getDeviceId(), deviceId)
                && Objects.equals(dispatch.getRequestedBy(), requestedBy)
                && "queued".equals(dispatch.getStatus());
    }

    private void appendEvent(CallDispatchDO dispatch, String eventType, String fromStatus, String toStatus,
                             String actorType, Long actorId, String reasonCode) {
        CallDispatchEventDO event = new CallDispatchEventDO();
        event.setId(IdUtil.getSnowflake().nextId());
        event.setDispatchId(dispatch.getId());
        event.setEventType(eventType);
        event.setFromStatus(fromStatus);
        event.setToStatus(toStatus);
        event.setActorType(actorType);
        event.setActorId(actorId);
        event.setDeviceId(dispatch.getDeviceId());
        event.setReasonCode(reasonCode);
        event.setOccurredAt(LocalDateTime.now(ZoneOffset.UTC));
        dispatchEventMapper.insert(event);
    }
}
