package cn.iocoder.yudao.module.callphone.service.ai;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.Semaphore;
import static org.junit.jupiter.api.Assertions.*;

class MobileAiRelayTest {
    @Test void forwardsTrustedContextAndStreamWithoutMobileCredentials() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var calls=new AtomicInteger();
        var captured=new AtomicReference<String>();
        server.createContext("/internal/v1/ai/messages/stream",exchange -> {
            calls.incrementAndGet();captured.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
            assertEquals("Bearer "+"i".repeat(32),exchange.getRequestHeaders().getFirst("Authorization"));
            assertEquals("7",exchange.getRequestHeaders().getFirst("X-AI-User"));
            assertNull(exchange.getRequestHeaders().getFirst("X-Callphone-Device-Key"));
            exchange.getResponseHeaders().add("Content-Type","text/event-stream");exchange.sendResponseHeaders(200,0);
            exchange.getResponseBody().write("event: completed\ndata: {}\n\n".getBytes(StandardCharsets.UTF_8));exchange.close();
        });server.start();
        try {
            var relay=new MobileAiRelay();ReflectionTestUtils.setField(relay,"serviceUrl","http://127.0.0.1:"+server.getAddress().getPort());
            ReflectionTestUtils.setField(relay,"internalToken","i".repeat(32));
            var response=new MockHttpServletResponse();
            relay.forward("POST","/messages/stream",null,null,"{\"content\":\"问题\"}","d26a7f1e-79e9-4045-8ae6-78fdfd76706c","1","7","10",response);
            assertEquals(200,response.getStatus());assertEquals("no",response.getHeader("X-Accel-Buffering"));
            assertTrue(response.getContentAsString().contains("event: completed"));assertTrue(captured.get().contains("问题"));assertEquals(1,calls.get());
        } finally {server.stop(0);}
    }
    @Test void missingConfigAndUnapprovedRoutesNeverMakeAnUpstreamRequest() throws Exception {
        var relay=new MobileAiRelay();ReflectionTestUtils.setField(relay,"internalToken","");
        var missing=new MockHttpServletResponse();relay.forward("GET","/conversations",null,null,null,null,"1","7","10",missing);
        assertEquals(503,missing.getStatus());assertTrue(missing.getContentAsString().contains("AI_UNAVAILABLE"));
        var denied=new MockHttpServletResponse();relay.forward("POST","/../../admin",null,null,null,null,"1","7","10",denied);
        assertEquals(405,denied.getStatus());
        assertFalse(MobileAiRelay.allowed("GET","/messages/stream"));assertFalse(MobileAiRelay.allowed("DELETE","/requests/"+"a".repeat(36)));
    }
    @Test void activeStreamsCannotConsumeCancellationCapacity() throws Exception {
        var relay=new MobileAiRelay();ReflectionTestUtils.setField(relay,"internalToken","i".repeat(32));
        ReflectionTestUtils.setField(relay,"serviceUrl","http://127.0.0.1:1");ReflectionTestUtils.setField(relay,"connections",new Semaphore(0));
        var busy=new MockHttpServletResponse();relay.forward("POST","/messages/stream",null,null,"{}",null,"1","7","10",busy);
        assertEquals(429,busy.getStatus());
        var cancel=new MockHttpServletResponse();relay.forward("POST","/requests/d26a7f1e-79e9-4045-8ae6-78fdfd76706c/cancel",null,null,"{}",null,"1","7","10",cancel);
        assertEquals(503,cancel.getStatus()); // It attempted the unavailable service instead of rejecting at capacity.
    }
}
