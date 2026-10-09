package cn.iocoder.yudao.module.callphone.controller.admin.outbound;

import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.PairedDeviceDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallDispatchEventMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallDispatchMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.PairedDeviceMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.callphone.service.outbound.CallDispatchWorkflowService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CallDispatchReplayTest {

    private final CustomerMapper customerMapper = mock(CustomerMapper.class);
    private final LeadMapper leadMapper = mock(LeadMapper.class);
    private final PairedDeviceMapper deviceMapper = mock(PairedDeviceMapper.class);
    private final CallDispatchMapper dispatchMapper = mock(CallDispatchMapper.class);
    private final CallRecordMapper callRecordMapper = mock(CallRecordMapper.class);
    private final CallDispatchEventMapper dispatchEventMapper = mock(CallDispatchEventMapper.class);
    private final PiiCryptoService piiCryptoService = mock(PiiCryptoService.class);
    private final CallDispatchWorkflowService workflowService = mock(CallDispatchWorkflowService.class);
    private final CallDispatchController controller = new CallDispatchController();

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(controller, "customerMapper", customerMapper);
        ReflectionTestUtils.setField(controller, "leadMapper", leadMapper);
        ReflectionTestUtils.setField(controller, "deviceMapper", deviceMapper);
        ReflectionTestUtils.setField(controller, "dispatchMapper", dispatchMapper);
        ReflectionTestUtils.setField(controller, "callRecordMapper", callRecordMapper);
        ReflectionTestUtils.setField(controller, "dispatchEventMapper", dispatchEventMapper);
        ReflectionTestUtils.setField(controller, "piiCryptoService", piiCryptoService);
        ReflectionTestUtils.setField(controller, "callDispatchWorkflowService", workflowService);

        LoginUser loginUser = new LoginUser();
        loginUser.setId(7L);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void exactRetryReturnsOriginalDispatchEvenAfterLeadIsNoLongerCallable() {
        CallDispatchDO prior = priorDispatch();
        PairedDeviceDO device = new PairedDeviceDO();
        device.setDisplayName("Sales phone");
        when(dispatchMapper.selectOne(any())).thenReturn(prior);
        when(deviceMapper.selectById(32L)).thenReturn(device);
        when(dispatchEventMapper.selectByDispatchId(51L)).thenReturn(List.of());

        CallDispatchController.CallDispatchRespVO response = controller.create("retry-key", request()).getData();

        assertNotNull(response);
        assertEquals(51L, response.getId());
        assertEquals("queued", response.getStatus());
        assertEquals("Sales phone", response.getDeviceName());
        verify(leadMapper, never()).selectById(any(Long.class));
        verify(customerMapper, never()).selectById(any(Long.class));
        verify(dispatchMapper, never()).insert(any(CallDispatchDO.class));
    }

    @Test
    void simultaneousIdenticalFirstAttemptsResolveToTheUniqueIndexWinner() {
        CallDispatchDO winner = priorDispatch();
        LeadDO lead = new LeadDO();
        lead.setOwnerUserId(7L);
        lead.setStatus("claimed");
        PairedDeviceDO device = new PairedDeviceDO();
        device.setOwnerUserId(7L);
        device.setStatus("paired");
        device.setLastSeenAt(LocalDateTime.now().minusSeconds(10));

        when(dispatchMapper.selectOne(any())).thenReturn(null, winner);
        when(leadMapper.selectById(41L)).thenReturn(lead);
        when(deviceMapper.selectById(32L)).thenReturn(device);
        when(dispatchEventMapper.selectByDispatchId(51L)).thenReturn(List.of());
        doThrow(new DuplicateKeyException("concurrent idempotency key"))
                .when(dispatchMapper).insert(any(CallDispatchDO.class));

        CallDispatchController.CallDispatchRespVO response = controller.create("retry-key", request()).getData();

        assertNotNull(response);
        assertEquals(51L, response.getId());
        assertEquals("queued", response.getStatus());
        verify(dispatchMapper, times(2)).selectOne(any());
        verify(dispatchMapper).insert(any(CallDispatchDO.class));
    }

    private CallDispatchDO priorDispatch() {
        CallDispatchDO dispatch = new CallDispatchDO();
        dispatch.setId(51L);
        dispatch.setRequestedBy(7L);
        dispatch.setLeadId(41L);
        dispatch.setDeviceId(32L);
        dispatch.setSource("lead_followup");
        dispatch.setScriptCode("intro");
        dispatch.setFollowUpStatus("first_contact");
        dispatch.setRequestNote("Call after 9");
        dispatch.setNextFollowUpAt(LocalDateTime.of(2026, 10, 7, 9, 0));
        dispatch.setStatus("queued");
        return dispatch;
    }

    private CallDispatchController.CallDispatchCreateReqVO request() {
        CallDispatchController.CallDispatchCreateReqVO request = new CallDispatchController.CallDispatchCreateReqVO();
        request.setLeadId(41L);
        request.setDeviceId(32L);
        request.setSource("lead_followup");
        request.setScriptCode("intro");
        request.setFollowUpStatus("first_contact");
        request.setRequestNote("Call after 9");
        request.setNextFollowUpAt(LocalDateTime.of(2026, 10, 7, 9, 0));
        return request;
    }
}
