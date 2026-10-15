package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController;
import cn.iocoder.yudao.module.callphone.service.agent.AgentActor;
import cn.iocoder.yudao.module.callphone.service.agent.AgentRelay;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MobileAgentAccessTest {
    @Test void sharedIdentityUsesLoginTenantAndPairedDeviceAndRejectsCallerOverrides() {
        var devices = mock(CallPhoneMobileController.class);
        var user = new LoginUser(); user.setId(7L); user.setTenantId(1L); user.setUserType(2); user.setScopes(List.of("callphone-device:10"));
        var request = new MockHttpServletRequest(); request.addHeader("X-Callphone-Device-Id", "10"); request.addHeader("X-Callphone-Device-Key", "device-key");
        request.addHeader("X-AI-Tenant", "999"); request.addHeader("X-AI-User", "999");
        TenantContextHolder.setTenantId(1L);
        try (var security = mockStatic(SecurityFrameworkUtils.class)) {
            security.when(SecurityFrameworkUtils::getLoginUser).thenReturn(user);
            assertEquals(new AgentActor(1L, 7L, "10"), MobileAgentAccess.requireActor(request, devices));
            verify(devices).requireDevice(10L, "device-key");
            user.setScopes(List.of("callphone-device:11")); assertThrows(Exception.class, () -> MobileAgentAccess.requireActor(request, devices));
            user.setScopes(List.of("callphone-device:10")); TenantContextHolder.setTenantId(2L); assertThrows(Exception.class, () -> MobileAgentAccess.requireActor(request, devices));
        } finally { TenantContextHolder.clear(); }
    }
    @Test void sharedErrorsNeverReturnUnknownExceptionContentsAndValidateIds() {
        var result = MobileAgentAccess.errorResponse(new IllegalArgumentException("private-content"));
        assertFalse(String.valueOf(result.getBody()).contains("private-content")); assertEquals(503, result.getStatusCode().value());
        assertThrows(AgentRelay.Failure.class, () -> MobileAgentAccess.uuid("../invalid"));
        assertEquals(409, MobileAgentAccess.errorResponse(new AgentRelay.Failure(409, "WORK_CONFLICT", "工作已变化")).getStatusCode().value());
    }
}
