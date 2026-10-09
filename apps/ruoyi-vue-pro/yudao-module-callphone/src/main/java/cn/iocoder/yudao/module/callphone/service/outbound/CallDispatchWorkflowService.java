package cn.iocoder.yudao.module.callphone.service.outbound;

import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchDO;

import java.time.LocalDateTime;

public interface CallDispatchWorkflowService {

    boolean expireIfDue(Long dispatchId, Long requestedBy, Long deviceId, LocalDateTime now);

    boolean cancel(Long dispatchId, Long requestedBy, LocalDateTime now);

    CallDispatchAcceptance accept(Long dispatchId, Long deviceId, Long requestedBy,
                                  String deviceEventId, LocalDateTime now);

    boolean decline(Long dispatchId, Long deviceId, Long requestedBy, String deviceEventId,
                    String reasonCode, LocalDateTime now);

    int failQueuedForDevice(Long deviceId, Long requestedBy, String reasonCode);

    CallDispatchDO requireAcceptedDispatchForCompletion(Long dispatchId, Long callRecordId);
}
