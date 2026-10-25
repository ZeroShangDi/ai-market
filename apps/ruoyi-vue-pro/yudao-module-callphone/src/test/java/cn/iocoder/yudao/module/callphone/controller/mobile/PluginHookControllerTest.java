package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.module.callphone.service.agent.AgentRelay;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PluginHookControllerTest {
    @Test void publicReceiverBoundsInputAndDoesNotTrustIdentityFields() throws Exception {
        var relay=mock(AgentRelay.class);var controller=new PluginHookController();
        ReflectionTestUtils.setField(controller,"relay",relay);
        var request=new MockHttpServletRequest();request.setContentType("application/json");
        request.setContent(new byte[6001]);
        assertEquals(413,assertThrows(AgentRelay.Failure.class,()->controller.receive("event_trigger","id","a".repeat(64),request,null)).status);
        verifyNoInteractions(relay);
        request.setContent("not-json".getBytes());
        assertEquals(400,assertThrows(AgentRelay.Failure.class,()->controller.receive("event_trigger","id","a".repeat(64),request,null)).status);
        verifyNoInteractions(relay);
    }
}
