package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController;
import cn.iocoder.yudao.module.callphone.service.ai.MobileAiRelay;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MobileAiChatControllerTest {
    @Test void internalIdentityComesFromAuthenticatedContextAndWrongDeviceScopeIsDenied() throws Exception {
        var devices=mock(CallPhoneMobileController.class);var relay=mock(MobileAiRelay.class);var controller=new MobileAiChatController();
        ReflectionTestUtils.setField(controller,"devices",devices);ReflectionTestUtils.setField(controller,"relay",relay);
        var user=new LoginUser();user.setId(7L);user.setTenantId(1L);user.setUserType(2);user.setScopes(List.of("callphone-device:10"));
        var request=new MockHttpServletRequest("POST","/api/v1/mobile/ai/messages/stream");
        request.addHeader("X-Callphone-Device-Id","10");request.addHeader("X-Callphone-Device-Key","device-key");request.addHeader("X-AI-User","999");
        var response=new MockHttpServletResponse();
        TenantContextHolder.setTenantId(1L);
        try(var security=mockStatic(SecurityFrameworkUtils.class)) {
            security.when(SecurityFrameworkUtils::getLoginUser).thenReturn(user);
            controller.forward(request,response,"{}");verify(devices).requireDevice(10L,"device-key");
            verify(relay).forward("POST","/messages/stream",null,null,"{}",null,"1","7","10",response);
            user.setScopes(List.of("callphone-device:11"));assertThrows(Exception.class,()->controller.forward(request,response,"{}"));
            user.setScopes(List.of("callphone-device:10"));TenantContextHolder.setTenantId(2L);assertThrows(Exception.class,()->controller.forward(request,response,"{}"));
            verifyNoMoreInteractions(relay);
        } finally {TenantContextHolder.clear();}
    }
    @Test void voiceTicketIsIssuedOnlyForVerifiedDeviceAndNeverRelayedAsChat() throws Exception {
        var controller=new MobileAiChatController();
        var devices=mock(CallPhoneMobileController.class);
        var relay=mock(MobileAiRelay.class);
        var voice=mock(cn.iocoder.yudao.module.callphone.service.ai.VoiceSessionIssuer.class);
        ReflectionTestUtils.setField(controller,"devices",devices);
        ReflectionTestUtils.setField(controller,"relay",relay);
        ReflectionTestUtils.setField(controller,"voice",voice);
        when(voice.issue("1","7","10", "")).thenReturn(java.util.Map.of("url","https://voice.test/","ticket","synthetic"));
        var user=new LoginUser();user.setId(7L);user.setTenantId(1L);user.setUserType(2);user.setScopes(List.of("callphone-device:10"));
        var request=new MockHttpServletRequest("POST","/api/v1/mobile/ai/voice/session");
        request.addHeader("X-Callphone-Device-Id","10");request.addHeader("X-Callphone-Device-Key","device-key");
        var response=new MockHttpServletResponse();
        TenantContextHolder.setTenantId(1L);
        try(var security=mockStatic(SecurityFrameworkUtils.class)) {
            security.when(SecurityFrameworkUtils::getLoginUser).thenReturn(user);
            controller.forward(request,response,"{}");
            verify(devices).requireDevice(10L,"device-key");
            verify(voice).issue("1","7","10", "");verifyNoInteractions(relay);
            assertEquals("no-store",response.getHeader("Cache-Control"));
            assertTrue(response.getContentAsString().contains("synthetic"));
            user.setScopes(List.of("callphone-device:11"));
            assertThrows(Exception.class,()->controller.forward(request,new MockHttpServletResponse(),"{}"));
            verifyNoMoreInteractions(voice);
        } finally {TenantContextHolder.clear();}
    }

}
