package cn.iocoder.yudao.module.callphone.controller.app.outbound;

import cn.iocoder.yudao.framework.web.config.WebProperties;
import cn.iocoder.yudao.framework.web.config.YudaoWebAutoConfiguration;
import cn.iocoder.yudao.module.callphone.controller.mobile.CallPhoneMobileV1AdapterController;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockServletContext;
import org.springframework.web.context.support.StaticWebApplicationContext;

import static org.junit.jupiter.api.Assertions.*;

class CallPhoneMobilePathMappingTest {
    @Test
    void publicAdapterKeepsExactV1PathUnderActualYudaoPrefixRules() {
        var context = new StaticWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.getBeanFactory().registerSingleton("adapter", new CallPhoneMobileV1AdapterController());
        context.getBeanFactory().registerSingleton("legacyMobile", new CallPhoneMobileController());
        var mapping = new YudaoWebAutoConfiguration().webMvcRegistrations(new WebProperties()).getRequestMappingHandlerMapping();
        assertNotNull(mapping);
        mapping.setApplicationContext(context);
        mapping.afterPropertiesSet();
        var paths = mapping.getHandlerMethods().keySet().stream()
                .flatMap(info -> info.getPatternValues().stream()).toList();
        assertTrue(paths.contains("/api/v1/mobile/bootstrap"));
        assertTrue(paths.contains("/api/v1/mobile/pairings/claim"));
        assertTrue(paths.contains("/api/v1/mobile/calls/{callId}/complete"));
        assertFalse(paths.stream().anyMatch(path -> path.startsWith("/app-api/api/v1/mobile")));
        assertTrue(paths.contains("/app-api/callphone/mobile/calls/direct"));
        context.close();
    }
}
