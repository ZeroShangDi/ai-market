package cn.iocoder.yudao.module.callphone.controller.admin.leads;

import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.module.callphone.service.leads.LeadPluginImportService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import cn.iocoder.yudao.module.system.api.permission.PermissionApi;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class LeadPluginControllerTest {
    @Test void requiresServiceCredentialTenantActiveUserAndBothPermissionsThenRestoresContext() {
        var controller = new LeadPluginController(); var users = mock(AdminUserApi.class);
        var permissions = mock(PermissionApi.class); var imports = mock(LeadPluginImportService.class);
        ReflectionTestUtils.setField(controller, "internalToken", "x".repeat(32));
        ReflectionTestUtils.setField(controller, "users", users); ReflectionTestUtils.setField(controller, "permissions", permissions);
        ReflectionTestUtils.setField(controller, "imports", imports);
        var request = new MockHttpServletRequest(); request.addHeader("X-AI-User", "7");
        var input = new LeadPluginImportService.Input("a".repeat(64), List.of());
        assertEquals(401, controller.connection(request).getStatusCode().value());
        assertEquals(401, controller.importRows(request, input).getStatusCode().value());
        request.addHeader("X-Work-Internal-Token", "x".repeat(32));
        assertEquals(403, controller.importRows(request, input).getStatusCode().value());
        TenantContextHolder.setTenantId(1L);
        try {
            assertEquals(403, controller.importRows(request, input).getStatusCode().value());
            var user = new AdminUserRespDTO(); user.setId(7L); user.setStatus(0); when(users.getUser(7L)).thenReturn(user);
            when(permissions.hasAnyPermissions(7L, "callphone:ai:chat")).thenReturn(true);
            assertEquals(403, controller.importRows(request, input).getStatusCode().value()); verifyNoInteractions(imports);
            when(permissions.hasAnyPermissions(7L, "callphone:lead:create")).thenReturn(true);
            when(imports.execute(input, 7L)).thenAnswer(call -> { assertEquals(7L, SecurityFrameworkUtils.getLoginUserId()); return List.of(); });
            var prior = SecurityContextHolder.getContext();
            assertEquals(200, controller.connection(request).getStatusCode().value());
            verifyNoInteractions(imports);
            assertEquals(200, controller.importRows(request, input).getStatusCode().value()); assertSame(prior, SecurityContextHolder.getContext());
            user.setStatus(1); assertEquals(403, controller.connection(request).getStatusCode().value()); assertEquals(403, controller.importRows(request, input).getStatusCode().value());
        } finally { TenantContextHolder.clear(); SecurityContextHolder.clearContext(); }
    }
}
