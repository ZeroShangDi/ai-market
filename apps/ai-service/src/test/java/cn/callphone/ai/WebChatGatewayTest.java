package cn.callphone.ai;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;

class WebChatGatewayTest {
    @Test void streamsSearchActivityAndGroundedTextThroughAuthenticatedInternalBridge() throws Exception {
        HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        AtomicReference<String> body=new AtomicReference<>();
        server.createContext("/internal/v1/agent/chat/stream",exchange -> {
            assertEquals("Bearer "+"t".repeat(32),exchange.getRequestHeaders().getFirst("Authorization"));
            assertEquals("7",exchange.getRequestHeaders().getFirst("X-AI-User"));
            assertEquals("10",exchange.getRequestHeaders().getFirst("X-AI-Device"));
            body.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
            exchange.getResponseHeaders().set("Content-Type","text/event-stream"); exchange.sendResponseHeaders(200,0);
            exchange.getResponseBody().write(("data: {\"type\":\"activity\",\"stage\":\"searching\"}\n\n"
                +": ping\n\n"+"data: {\"type\":\"chunk\",\"text\":\"回答及来源\"}\n\n"
                +"data: {\"type\":\"usage\",\"input_tokens\":10,\"output_tokens\":3}\n\n"
                +"data: {\"type\":\"done\"}\n\n").getBytes(StandardCharsets.UTF_8)); exchange.close();
        }); server.start();
        try {
            var bridge=new WebChatGateway("http://127.0.0.1:"+server.getAddress().getPort(),"t".repeat(32));
            var chunks=bridge.stream(List.of(new ModelGateway.Turn("user","联网问题")),new Protocol.Actor("1","7","10"))
                .collectList().block(Duration.ofSeconds(5));
            assertEquals("searching",chunks.getFirst().activity());
            assertEquals("回答及来源",chunks.stream().map(ModelGateway.Chunk::text).reduce("",String::concat));
            assertEquals(10,chunks.getLast().inputTokens()); assertTrue(body.get().contains("联网问题"));
            assertFalse(body.get().contains("device_key"));
        } finally {server.stop(0);}
    }
    @Test void missingDoneAndProviderFailureCannotBecomeSuccessfulReplies() throws Exception {
        for(String stream:List.of("data: {\"type\":\"chunk\",\"text\":\"部分\"}\n\n", "data: {\"type\":\"error\"}\n\n")) {
            HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            server.createContext("/internal/v1/agent/chat/stream",exchange -> {
                exchange.getRequestBody().readAllBytes(); exchange.getResponseHeaders().set("Content-Type","text/event-stream"); exchange.sendResponseHeaders(200,0);
                exchange.getResponseBody().write(stream.getBytes(StandardCharsets.UTF_8)); exchange.close();
            }); server.start();
            try {
                var bridge=new WebChatGateway("http://127.0.0.1:"+server.getAddress().getPort(),"t".repeat(32));
                assertThrows(Protocol.Problem.class,()->bridge.stream(List.of(new ModelGateway.Turn("user","问题")),new Protocol.Actor("1","7","10"))
                    .collectList().block(Duration.ofSeconds(5)));
            } finally {server.stop(0);}
        }
    }
}
