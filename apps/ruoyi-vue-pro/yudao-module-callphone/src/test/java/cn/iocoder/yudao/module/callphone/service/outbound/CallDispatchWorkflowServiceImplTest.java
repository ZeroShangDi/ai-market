package cn.iocoder.yudao.module.callphone.service.outbound;

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
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CallDispatchWorkflowServiceImplTest {

    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        List.of(CallDispatchDO.class, CallDispatchEventDO.class, CallRecordDO.class,
                MobileCallEventDO.class, CustomerDO.class, LeadDO.class)
                .forEach(entity -> TableInfoHelper.initTableInfo(assistant, entity));
    }

    @Mock private CallDispatchMapper dispatchMapper;
    @Mock private CallDispatchEventMapper dispatchEventMapper;
    @Mock private CallRecordMapper callRecordMapper;
    @Mock private MobileCallEventMapper mobileCallEventMapper;
    @Mock private CustomerMapper customerMapper;
    @Mock private LeadMapper leadMapper;
    private CallDispatchWorkflowServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new CallDispatchWorkflowServiceImpl(dispatchMapper, dispatchEventMapper,
                callRecordMapper, mobileCallEventMapper, customerMapper, leadMapper);
    }

    @Test
    void expiryWritesAuditOnlyWhenQueuedExpiryWins() {
        when(dispatchMapper.selectById(1L)).thenReturn(dispatch(1L, "queued", LocalDateTime.now().minusSeconds(1)));
        when(dispatchMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<CallDispatchDO>>any())).thenReturn(1);

        assertTrue(service.expireIfDue(1L, 8L, 4L, LocalDateTime.now()));

        ArgumentCaptor<CallDispatchEventDO> event = ArgumentCaptor.forClass(CallDispatchEventDO.class);
        verify(dispatchEventMapper).insert(event.capture());
        assertEquals("expired", event.getValue().getEventType());
        assertEquals("system", event.getValue().getActorType());
        assertEquals(4L, event.getValue().getDeviceId());
    }

    @Test
    void cancelConflictDoesNotCreateAnAuditEvent() {
        when(dispatchMapper.selectById(2L)).thenReturn(dispatch(2L, "accepted", LocalDateTime.now().plusMinutes(1)));

        assertFalse(service.cancel(2L, 8L, LocalDateTime.now()));

        verify(dispatchMapper, never()).update(any(), any());
        verify(dispatchEventMapper, never()).insert(any(CallDispatchEventDO.class));
    }

    @Test
    void acceptAtomicallyCreatesCallRecordAndBothEvents() {
        CallDispatchDO dispatch = dispatch(3L, "queued", LocalDateTime.now().plusMinutes(2));
        dispatch.setCustomerId(22L);
        dispatch.setPhoneCiphertext("cipher");
        dispatch.setPhoneDisplay("138****1234");
        when(dispatchMapper.selectById(3L)).thenReturn(dispatch);
        CustomerDO customer = new CustomerDO();
        customer.setId(22L);
        customer.setOwnerUserId(8L);
        customer.setStatus("active");
        customer.setNameCiphertext("name-cipher");
        when(customerMapper.selectById(22L)).thenReturn(customer);
        when(dispatchMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<CallDispatchDO>>any())).thenReturn(1);

        CallDispatchAcceptance result = service.accept(3L, 4L, 8L, "device-event-1", LocalDateTime.now());

        assertNotNull(result);
        assertEquals("accepted", result.dispatch().getStatus());
        assertEquals(result.callRecord().getId(), result.dispatch().getCallRecordId());
        assertEquals("requested", result.callRecord().getStatus());
        assertEquals("name-cipher", result.callRecord().getCustomerNameCiphertext());
        ArgumentCaptor<MobileCallEventDO> mobileEvent = ArgumentCaptor.forClass(MobileCallEventDO.class);
        verify(mobileCallEventMapper).insert(mobileEvent.capture());
        assertEquals("accepted", mobileEvent.getValue().getEventType());
        assertEquals(result.callRecord().getId(), mobileEvent.getValue().getCallRecordId());
        ArgumentCaptor<CallDispatchEventDO> dispatchEvent = ArgumentCaptor.forClass(CallDispatchEventDO.class);
        verify(dispatchEventMapper).insert(dispatchEvent.capture());
        assertEquals("accepted", dispatchEvent.getValue().getEventType());
    }

    @Test
    void acceptDoesNotCreateCallWhenDispatchIsAlreadyClaimed() {
        when(dispatchMapper.selectById(4L)).thenReturn(dispatch(4L, "accepted", LocalDateTime.now().plusMinutes(2)));

        assertNull(service.accept(4L, 4L, 8L, "device-event-2", LocalDateTime.now()));

        verify(dispatchMapper, never()).update(any(), any());
        verify(callRecordMapper, never()).insert(any(CallRecordDO.class));
        verify(mobileCallEventMapper, never()).insert(any(MobileCallEventDO.class));
    }

    @Test
    void declineWritesDeviceAndDispatchEventsOnlyWhenStateChangeSucceeds() {
        when(dispatchMapper.selectById(5L)).thenReturn(dispatch(5L, "queued", LocalDateTime.now().plusMinutes(2)));
        when(dispatchMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<CallDispatchDO>>any())).thenReturn(1);

        assertTrue(service.decline(5L, 4L, 8L, "device-event-3", "user_declined", LocalDateTime.now()));

        ArgumentCaptor<MobileCallEventDO> mobileEvent = ArgumentCaptor.forClass(MobileCallEventDO.class);
        verify(mobileCallEventMapper).insert(mobileEvent.capture());
        assertEquals("declined", mobileEvent.getValue().getEventType());
        ArgumentCaptor<CallDispatchEventDO> dispatchEvent = ArgumentCaptor.forClass(CallDispatchEventDO.class);
        verify(dispatchEventMapper).insert(dispatchEvent.capture());
        assertEquals("user_declined", dispatchEvent.getValue().getReasonCode());
    }

    @Test
    void revokingDeviceFailsOnlyQueuedDispatchesAndWritesReason() {
        when(dispatchMapper.selectList(org.mockito.ArgumentMatchers.<Wrapper<CallDispatchDO>>any()))
                .thenReturn(List.of(dispatch(6L, "queued", LocalDateTime.now().plusMinutes(2))));
        when(dispatchMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<CallDispatchDO>>any())).thenReturn(1);

        assertEquals(1, service.failQueuedForDevice(4L, 8L, "device_revoked"));

        ArgumentCaptor<CallDispatchEventDO> event = ArgumentCaptor.forClass(CallDispatchEventDO.class);
        verify(dispatchEventMapper).insert(event.capture());
        assertEquals("failed", event.getValue().getEventType());
        assertEquals("device_revoked", event.getValue().getReasonCode());
        assertEquals(4L, event.getValue().getDeviceId());
    }

    @Test
    void completedCallKeepsItsAcceptedDispatchState() {
        CallDispatchDO dispatch = dispatch(7L, "accepted", LocalDateTime.now().plusMinutes(2));
        dispatch.setCallRecordId(70L);
        when(dispatchMapper.selectById(7L)).thenReturn(dispatch);

        CallDispatchDO result = service.requireAcceptedDispatchForCompletion(7L, 70L);

        assertSame(dispatch, result);
        assertEquals("accepted", result.getStatus());
        verify(dispatchMapper, never()).update(any(), any());
    }

    @Test
    void completionRejectsMislinkedOrLegacyCompletedDispatch() {
        CallDispatchDO mislinked = dispatch(8L, "accepted", LocalDateTime.now().plusMinutes(2));
        mislinked.setCallRecordId(80L);
        when(dispatchMapper.selectById(8L)).thenReturn(mislinked);

        assertThrows(cn.iocoder.yudao.framework.common.exception.ServiceException.class,
                () -> service.requireAcceptedDispatchForCompletion(8L, 81L));

        CallDispatchDO alreadyCompleted = dispatch(9L, "completed", LocalDateTime.now().plusMinutes(2));
        alreadyCompleted.setCallRecordId(90L);
        when(dispatchMapper.selectById(9L)).thenReturn(alreadyCompleted);

        assertThrows(cn.iocoder.yudao.framework.common.exception.ServiceException.class,
                () -> service.requireAcceptedDispatchForCompletion(9L, 90L));
        verify(dispatchMapper, never()).update(any(), any());
    }

    private static CallDispatchDO dispatch(Long id, String status, LocalDateTime expiresAt) {
        CallDispatchDO dispatch = new CallDispatchDO();
        dispatch.setId(id);
        dispatch.setDeviceId(4L);
        dispatch.setRequestedBy(8L);
        dispatch.setStatus(status);
        dispatch.setExpiresAt(expiresAt);
        return dispatch;
    }
}
