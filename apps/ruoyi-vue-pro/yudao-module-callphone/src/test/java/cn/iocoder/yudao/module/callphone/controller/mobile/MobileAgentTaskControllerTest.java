package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController;
import cn.iocoder.yudao.module.callphone.service.agent.AgentActor;
import cn.iocoder.yudao.module.callphone.service.agent.AgentFollowUpService;
import cn.iocoder.yudao.module.callphone.service.agent.AgentTaskRelay;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MobileAgentTaskControllerTest {
    private final ObjectMapper json = new ObjectMapper();
    private static final String TASK_ID = "b1bfce16-1bfc-4f00-8407-3aef4278ead2";

    private ObjectNode input() {
        ObjectNode input = json.createObjectNode().put("request_id", TASK_ID).put("conversation_id", "123")
                .put("customer_id", "456").put("prompt", "生成跟进建议");
        input.set("attachment", json.createObjectNode().put("name", "客户沟通.md").put("content", "客户希望了解方案"));
        return input;
    }

    @Test void stripsClientSnapshotAndInternalIdentityFromTaskPayload() {
        ObjectNode input = input();
        input.put("tenant_id", "999"); input.set("customer_snapshot", json.createObjectNode().put("name", "伪造客户"));
        ObjectNode validated = MobileAgentTaskController.validateCreate(input);
        assertFalse(validated.has("tenant_id")); assertFalse(validated.has("customer_snapshot"));
        assertEquals("456", validated.path("customer_id").asText());
        assertTrue(validated.path("customer_id").isTextual());
    }

    @Test void enforcesUtf8BytesDecimalStringIdsAndFileType() {
        ObjectNode input = input();
        ((ObjectNode) input.path("attachment")).put("content", "中".repeat(21846));
        ObjectNode utf8 = input;
        assertThrows(AgentTaskRelay.Failure.class, () -> MobileAgentTaskController.validateCreate(utf8));
        input = input(); input.put("customer_id", 456);
        ObjectNode numeric = input;
        assertThrows(AgentTaskRelay.Failure.class, () -> MobileAgentTaskController.validateCreate(numeric));
        input = input(); ((ObjectNode) input.path("attachment")).put("name", "../../秘密.txt");
        ObjectNode path = input;
        assertThrows(AgentTaskRelay.Failure.class, () -> MobileAgentTaskController.validateCreate(path));
        assertThrows(AgentTaskRelay.Failure.class, () -> MobileAgentTaskController.uuid("not-a-task"));
    }

    @Test void derivesActorFromSessionAndRejectsDeviceOrTenantMismatch() {
        var controller = new MobileAgentTaskController(); var devices = mock(CallPhoneMobileController.class);
        ReflectionTestUtils.setField(controller, "devices", devices);
        var user = new LoginUser(); user.setId(7L); user.setTenantId(1L); user.setUserType(2);
        user.setScopes(List.of("callphone-device:10"));
        var request = new MockHttpServletRequest("POST", "/api/v1/mobile/ai/tasks");
        request.addHeader("X-Callphone-Device-Id", "10"); request.addHeader("X-Callphone-Device-Key", "device-key");
        request.addHeader("X-AI-User", "999"); request.addHeader("X-AI-Tenant", "999");
        TenantContextHolder.setTenantId(1L);
        try (var security = mockStatic(SecurityFrameworkUtils.class)) {
            security.when(SecurityFrameworkUtils::getLoginUser).thenReturn(user);
            assertEquals(new AgentActor(1L, 7L, "10"), controller.actor(request));
            verify(devices).requireDevice(10L, "device-key");
            user.setScopes(List.of("callphone-device:11"));
            assertThrows(Exception.class, () -> controller.actor(request));
            user.setScopes(List.of("callphone-device:10")); TenantContextHolder.setTenantId(2L);
            assertThrows(Exception.class, () -> controller.actor(request));
        } finally { TenantContextHolder.clear(); }
    }

    @Test void confirmationUsesUpstreamProposalAndStringBusinessReceipt() {
        var controller = new MobileAgentTaskController(); var devices = mock(CallPhoneMobileController.class);
        var relay = mock(AgentTaskRelay.class); var business = mock(AgentFollowUpService.class);
        ReflectionTestUtils.setField(controller, "devices", devices); ReflectionTestUtils.setField(controller, "relay", relay);
        ReflectionTestUtils.setField(controller, "followUps", business);
        var user = new LoginUser(); user.setId(7L); user.setTenantId(1L); user.setUserType(2);
        var request = new MockHttpServletRequest(); request.addHeader("X-Callphone-Device-Id", "10");
        request.addHeader("X-Callphone-Device-Key", "device-key");
        AgentActor actor = new AgentActor(1L, 7L, "10"); ObjectNode authoritativeTask = json.createObjectNode().put("id", TASK_ID);
        ObjectNode envelope = json.createObjectNode().set("data", authoritativeTask);
        when(relay.request("GET", "/" + TASK_ID, null, null, actor)).thenReturn(envelope);
        when(business.confirm(TASK_ID, authoritativeTask, actor)).thenReturn(9223372036854775806L);
        when(relay.request(eq("POST"), eq("/" + TASK_ID + "/confirm"), any(), isNull(), eq(actor))).thenReturn(envelope);
        TenantContextHolder.setTenantId(1L);
        try (var security = mockStatic(SecurityFrameworkUtils.class)) {
            security.when(SecurityFrameworkUtils::getLoginUser).thenReturn(user);
            controller.confirm(request, TASK_ID);
            var order = inOrder(relay, business);
            order.verify(relay).request("GET", "/" + TASK_ID, null, null, actor);
            order.verify(business).confirm(TASK_ID, authoritativeTask, actor);
            order.verify(relay).request("POST", "/" + TASK_ID + "/confirm",
                    json.createObjectNode().put("follow_up_task_id", "9223372036854775806"), null, actor);
        } finally { TenantContextHolder.clear(); }
    }

    @Test void reloadReconcilesCommittedCancelledReceiptAndPreservesPendingOutcomeDuringOutage() {
        var controller = new MobileAgentTaskController(); var devices = mock(CallPhoneMobileController.class);
        var relay = mock(AgentTaskRelay.class); var business = mock(AgentFollowUpService.class);
        ReflectionTestUtils.setField(controller, "devices", devices); ReflectionTestUtils.setField(controller, "relay", relay);
        ReflectionTestUtils.setField(controller, "followUps", business);
        var user = new LoginUser(); user.setId(7L); user.setTenantId(1L); user.setUserType(2);
        var request = new MockHttpServletRequest(); request.addHeader("X-Callphone-Device-Id", "10");
        request.addHeader("X-Callphone-Device-Key", "device-key");
        AgentActor actor = new AgentActor(1L, 7L, "10");
        ObjectNode cancelled = json.createObjectNode().put("id", TASK_ID).put("customer_id", "456").put("status", "cancelled");
        ObjectNode completed = cancelled.deepCopy(); completed.put("status", "completed").put("follow_up_task_id", "999");
        when(relay.request("GET", "/" + TASK_ID, null, null, actor))
                .thenAnswer(call -> json.createObjectNode().set("data", cancelled.deepCopy()));
        when(business.committedReceipt(TASK_ID, cancelled, actor)).thenReturn(999L);
        when(relay.request(eq("POST"), eq("/" + TASK_ID + "/confirm"), any(), isNull(), eq(actor)))
                .thenReturn(json.createObjectNode().set("data", completed))
                .thenThrow(new AgentTaskRelay.Failure(503, "AGENT_UNAVAILABLE", "unavailable"));
        TenantContextHolder.setTenantId(1L);
        try (var security = mockStatic(SecurityFrameworkUtils.class)) {
            security.when(SecurityFrameworkUtils::getLoginUser).thenReturn(user);
            assertEquals("completed", controller.get(request, TASK_ID).getBody().path("data").path("status").asText());
            var pending = controller.get(request, TASK_ID).getBody().path("data");
            assertEquals("999", pending.path("follow_up_task_id").asText());
            assertTrue(pending.path("confirmation_pending").asBoolean());
            verify(business, never()).confirm(anyString(), any(), any());
        } finally { TenantContextHolder.clear(); }
    }
}
