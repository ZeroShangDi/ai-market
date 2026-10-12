package cn.callphone.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import reactor.core.publisher.Flux;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=jdbc:h2:mem:http-tests;DB_CLOSE_DELAY=-1",
    "ai.internal-token=internal-test-token-0123456789012345",
    "ai.storage-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
})
class ChatHttpTest {
    @LocalServerPort int port;
    final ObjectMapper json=new ObjectMapper();
    final HttpClient client=HttpClient.newHttpClient();
    @TestConfiguration static class TestModels {
        @Bean @Primary ModelGateway model() {
            return new ModelGateway() {
                public void checkAvailable() {}
                public Flux<Chunk> stream(List<Turn> turns) {return Flux.just(new Chunk("你好 😀",5,3)).delayElements(Duration.ofMillis(30));}
            };
        }
    }
    HttpRequest.Builder builder(String path,String token) {
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/internal/v1/ai"+path)).timeout(Duration.ofSeconds(10))
            .header("X-AI-Tenant","1").header("X-AI-User","7").header("X-AI-Device","10").header("Content-Type","application/json");
        if(token!=null) request.header("Authorization","Bearer "+token);return request;
    }
    @Test void internalIdentityRequiresServiceCredentialAndSseHasActualTerminalFrame() throws Exception {
        assertEquals(403,client.send(builder("/conversations",null).GET().build(),HttpResponse.BodyHandlers.ofString()).statusCode());
        assertEquals(403,client.send(builder("/conversations","wrong").GET().build(),HttpResponse.BodyHandlers.ofString()).statusCode());
        String token="internal-test-token-0123456789012345";
        var create=client.send(builder("/conversations",token).header("Idempotency-Key",UUID.randomUUID().toString())
            .POST(HttpRequest.BodyPublishers.ofString("{}")).build(),HttpResponse.BodyHandlers.ofString());
        assertEquals(200,create.statusCode());String id=json.readTree(create.body()).path("data").path("id").asText();
        String key=UUID.randomUUID().toString();
        String body=json.writeValueAsString(new Protocol.Send(key,id,"问题",null));
        var reply=client.send(builder("/messages/stream",token).header("Idempotency-Key",key).header("Accept","text/event-stream")
            .POST(HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
        assertEquals(200,reply.statusCode());assertTrue(reply.headers().firstValue("Content-Type").orElse("").contains("text/event-stream"));
        assertTrue(reply.body().contains("event:started"));assertTrue(reply.body().contains("event:delta"));assertTrue(reply.body().contains("event:completed"));
        String terminalLine=reply.body().lines().filter(line -> line.startsWith("data:") && line.contains("completed")).findFirst().orElseThrow();
        assertEquals("你好 😀",json.readTree(terminalLine.substring(5)).path("content").asText());assertFalse(reply.body().contains(token));
        var replay=client.send(builder("/messages/stream",token).header("Idempotency-Key",key).POST(HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
        assertEquals(200,replay.statusCode());assertTrue(replay.body().contains("event:completed"));
        var messages=client.send(builder("/conversations/"+id+"/messages",token).GET().build(),HttpResponse.BodyHandlers.ofString());
        assertEquals(2,json.readTree(messages.body()).path("data").path("items").size());
        var bad=client.send(builder("/messages/stream",token).header("Idempotency-Key",UUID.randomUUID().toString()).POST(HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
        assertEquals(400,bad.statusCode());assertEquals("VALIDATION_ERROR",json.readTree(bad.body()).path("error").path("code").asText());
    }
}
