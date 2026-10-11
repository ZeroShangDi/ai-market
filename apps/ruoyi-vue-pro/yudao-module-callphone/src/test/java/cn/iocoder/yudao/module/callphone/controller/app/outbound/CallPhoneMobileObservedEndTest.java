package cn.iocoder.yudao.module.callphone.controller.app.outbound;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.*;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class CallPhoneMobileObservedEndTest {
    private final CallRecordMapper records = mock(CallRecordMapper.class);
    private final MobileCallEventMapper events = mock(MobileCallEventMapper.class);
    private final CallPhoneMobileController controller = spy(new CallPhoneMobileController());
    private final CallPhoneMobileController.ObservedEndReqVO request = new CallPhoneMobileController.ObservedEndReqVO();
    private final CallRecordDO record = new CallRecordDO();
    CallPhoneMobileObservedEndTest() {
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                new org.apache.ibatis.builder.MapperBuilderAssistant(new org.apache.ibatis.session.Configuration(), "test"), CallRecordDO.class);
        ReflectionTestUtils.setField(controller, "recordMapper", records);
        ReflectionTestUtils.setField(controller, "eventMapper", events);
        PairedDeviceDO device = new PairedDeviceDO(); device.setId(10L); device.setOwnerUserId(7L);
        doReturn(device).when(controller).requireDevice(10L, "0123456789abcdef0123456789abcdef");
        record.setId(20L); record.setDeviceId(10L); record.setOwnerUserId(7L); record.setStatus("ended");
        record.setStartedAt(LocalDateTime.of(2026, 10, 1, 0, 0)); record.setDurationSeconds(0); record.setVersion(1);
        when(records.selectById(20L)).thenReturn(record);
        when(records.update(isNull(), any())).thenReturn(1);
        request.setDeviceId(10L); request.setCallRecordId(20L); request.setDeviceEventId("late-end");
        request.setEndedAt(OffsetDateTime.parse("2026-10-01T00:01:00Z")); request.setDurationSeconds(45);
    }
    @Test void reconcilesLateDurationAndPersistsIdempotentEvent() {
        try (var security = mockStatic(SecurityFrameworkUtils.class)) {
            security.when(SecurityFrameworkUtils::getLoginUserId).thenReturn(7L);
            assertTrue(controller.observedEnd(request, "0123456789abcdef0123456789abcdef").getData());
            verify(records).update(isNull(), any());
            verify(events).insert(argThat((MobileCallEventDO event) -> event.getEventType().equals("observed_end")
                    && event.getCallRecordId().equals(20L) && event.getRequestFingerprint() != null));
        }
    }
    @Test void rejectsForeignDeviceAndImpossibleDuration() {
        try (var security = mockStatic(SecurityFrameworkUtils.class)) {
            security.when(SecurityFrameworkUtils::getLoginUserId).thenReturn(7L);
            record.setDeviceId(99L);
            assertThrows(ServiceException.class, () -> controller.observedEnd(request, "0123456789abcdef0123456789abcdef"));
            record.setDeviceId(10L); request.setDurationSeconds(900);
            assertThrows(ServiceException.class, () -> controller.observedEnd(request, "0123456789abcdef0123456789abcdef"));
            verify(records, never()).update(isNull(), any());
        }
    }
    @Test void duplicateLessInformativeEventCannotEraseDuration() {
        try (var security = mockStatic(SecurityFrameworkUtils.class)) {
            security.when(SecurityFrameworkUtils::getLoginUserId).thenReturn(7L);
            record.setDurationSeconds(50);
            assertTrue(controller.observedEnd(request, "0123456789abcdef0123456789abcdef").getData());
            verify(records, never()).update(isNull(), any());
        }
    }
    @Test void conflictingReplayDoesNotModifyRecord() {
        MobileCallEventDO prior = new MobileCallEventDO(); prior.setEventType("observed_end");
        prior.setCallRecordId(20L); prior.setRequestFingerprint("different");
        when(events.selectByDeviceEvent(10L, "late-end")).thenReturn(prior);
        assertThrows(ServiceException.class, () -> controller.observedEnd(request, "0123456789abcdef0123456789abcdef"));
        verifyNoInteractions(records);
    }
}
