package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.module.callphone.service.agent.AgentActor;
import cn.iocoder.yudao.module.callphone.service.agent.AgentRelay;
import cn.iocoder.yudao.module.callphone.service.ai.MobileAiRelay;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Base64;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MobileWorkControllerTest {
    private final ObjectMapper json = new ObjectMapper();
    private final AgentActor actor = new AgentActor(1L, 7L, "10");
    private static final String SID = "b1bfce16-1bfc-4f00-8407-3aef4278ead2";
    private final AgentRelay relay = mock(AgentRelay.class);
    private final MobileAiRelay chat = mock(MobileAiRelay.class);
    private MobileWorkController controller() {
        var controller = new MobileWorkController() { @Override AgentActor actor(jakarta.servlet.http.HttpServletRequest request) { return actor; } };
        ReflectionTestUtils.setField(controller, "relay", relay); ReflectionTestUtils.setField(controller, "chat", chat); return controller;
    }
    private ObjectNode envelope(ObjectNode data) { return json.createObjectNode().set("data", data); }
    private void owned() { when(relay.request("GET", "/" + SID, null, null, actor)).thenReturn(envelope(json.createObjectNode().put("conversation_id", "123"))); }

    @Test void creationRequiresOwnedConversationAndDropsCallerIdentityAndConfiguration() {
        var controller = controller(); var request = new MockHttpServletRequest();
        var input = json.createObjectNode().put("conversation_id", "123").put("tenant", "999").put("cwd", "/etc");
        when(relay.request(eq("POST"), eq(""), any(), isNull(), eq(actor))).thenReturn(envelope(json.createObjectNode().put("id", SID)));
        assertEquals(200, controller.create(request, input).getStatusCode().value());
        verify(chat).requireConversation("123", "1", "7", "10");
        verify(relay).request("POST", "", json.createObjectNode().put("conversation_id", "123"), null, actor);
        doThrow(new MobileAiRelay.ConversationFailure(403)).when(chat).requireConversation("123", "1", "7", "10");
        assertThrows(MobileAiRelay.ConversationFailure.class, () -> controller.create(request, input));
    }
    @Test void mutationsRequireOwnedProductConversationAndMatchingIdempotencyKey() {
        var controller = controller(); owned(); var request = new MockHttpServletRequest();
        var body = json.createObjectNode().put("request_id", SID).put("prompt", "工作");
        assertThrows(AgentRelay.Failure.class, () -> controller.action(request, SID, "messages", body));
        request.addHeader("Idempotency-Key", SID);
        when(relay.request("POST", "/" + SID + "/messages", body, SID, actor)).thenReturn(envelope(json.createObjectNode().put("status", "running")));
        assertEquals("running", controller.action(request, SID, "messages", body).getBody().path("data").path("status").asText());
        doThrow(new MobileAiRelay.ConversationFailure(403)).when(chat).requireConversation("123", "1", "7", "10");
        assertThrows(MobileAiRelay.ConversationFailure.class, () -> controller.answer(request, SID, SID, json.createObjectNode()));
        verify(relay, never()).request(eq("POST"), contains("interactions"), any(), any(), any());
    }
    @Test void artifactDownloadPreservesBytesAndForcesDownloadWithNoCacheOrSniffing() {
        var controller = controller(); owned(); byte[] bytes = {0, -1, 1, 2};
        when(relay.request("GET", "/" + SID + "/artifacts/" + SID, null, null, actor)).thenReturn(envelope(json.createObjectNode().put("name", "结果.xlsx").put("content_base64", Base64.getEncoder().encodeToString(bytes))));
        var response = controller.artifact(new MockHttpServletRequest(), SID, SID);
        assertArrayEquals(bytes, response.getBody()); assertEquals("no-store", response.getHeaders().getFirst("Cache-Control"));
        assertEquals("nosniff", response.getHeaders().getFirst("X-Content-Type-Options")); assertTrue(response.getHeaders().getFirst("Content-Disposition").startsWith("attachment"));
        assertThrows(AgentRelay.Failure.class, () -> controller.get(new MockHttpServletRequest(), "../escape"));
    }
    @Test void inboxOmitsDeletedConversationsButDoesNotHideServiceFailures() {
        var controller = controller();
        var items = json.createArrayNode().add(json.createObjectNode().put("conversation_id", "123"))
                .add(json.createObjectNode().put("conversation_id", "124"));
        when(relay.request("GET", "", null, null, actor)).thenReturn(envelope(json.createObjectNode().set("items", items)));
        doThrow(new MobileAiRelay.ConversationFailure(403)).when(chat).requireConversation("124", "1", "7", "10");
        assertEquals(1, controller.list(new MockHttpServletRequest()).getBody().path("data").path("items").size());
        doThrow(new MobileAiRelay.ConversationFailure(503)).when(chat).requireConversation("123", "1", "7", "10");
        assertThrows(MobileAiRelay.ConversationFailure.class, () -> controller.list(new MockHttpServletRequest()));
    }
}
