package cn.callphone.ai;

import com.sun.net.httpserver.HttpServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;

class SpringAiModelGatewayTest {
    @Test void sdkStreamsCompatibleProviderAndSendsModelAndOutputLimit() throws Exception {
        verifySdk("/v1/chat/completions","test-model","");
    }
    @Test void deepSeekUsesOfficialPathDisablesThinkingAndReadsFinalChunkUsage() throws Exception {
        verifySdk("/chat/completions","deepseek-flash","disabled");
    }
    private void verifySdk(String completionPath,String model,String thinking) throws Exception {
        HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        AtomicReference<String> request=new AtomicReference<>(); AtomicInteger calls=new AtomicInteger();
        server.createContext(completionPath,exchange -> {
            calls.incrementAndGet();request.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
            assertEquals("Bearer model-test-key",exchange.getRequestHeaders().getFirst("Authorization"));
            exchange.getResponseHeaders().add("Content-Type","text/event-stream;charset=UTF-8");exchange.sendResponseHeaders(200,0);
            String event="data: {\"id\":\"test\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"test-model\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"你好 😀\"},\"finish_reason\":null}]}\n\n";
            exchange.getResponseBody().write(event.getBytes(StandardCharsets.UTF_8));exchange.getResponseBody().flush();
            // DeepSeek includes usage on the final choice chunk, including an empty content delta and null role.
            String usage="data: {\"id\":\"test\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"test-model\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"\",\"role\":null},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":17,\"completion_tokens\":9,\"total_tokens\":26,\"prompt_cache_hit_tokens\":0,\"prompt_cache_miss_tokens\":17}}\n\n";
            exchange.getResponseBody().write(usage.getBytes(StandardCharsets.UTF_8));
            exchange.getResponseBody().write("data: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));exchange.close();
        });server.start();
        try {
            var settings=new AiSettings("i".repeat(32),"","model-test-key","http://127.0.0.1:"+server.getAddress().getPort(),model,completionPath,321,12,12000,32000,8,10,180,true,thinking);
            var gateway=new SpringAiModelGateway(settings);
            var chunks=gateway.stream(List.of(new ModelGateway.Turn("user","问题"))).collectList().block(Duration.ofSeconds(10));
            assertEquals("你好 😀",chunks.stream().map(ModelGateway.Chunk::text).reduce("",String::concat));
            var body=new ObjectMapper().readTree(request.get());assertEquals(model,body.path("model").asText());
            assertEquals(321,body.path("max_tokens").asInt());assertTrue(body.path("stream").asBoolean());assertEquals(1,calls.get());
            if(thinking.isEmpty()) assertFalse(body.has("thinking"));
            else assertEquals("disabled",body.path("thinking").path("type").asText());
            assertFalse(body.has("extra_body"));
            assertEquals(17,chunks.stream().mapToInt(ModelGateway.Chunk::inputTokens).max().orElse(0));
            assertEquals(9,chunks.stream().mapToInt(ModelGateway.Chunk::outputTokens).max().orElse(0));
        } finally {server.stop(0);}
    }
}
