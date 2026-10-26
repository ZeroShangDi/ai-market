package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController;
import cn.iocoder.yudao.module.callphone.service.agent.AgentActor;
import cn.iocoder.yudao.module.callphone.service.agent.AgentRelay;
import cn.iocoder.yudao.module.callphone.service.ai.MobileAiRelay;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ContentDisposition;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Work has its own lifetime. Closing an observer never interrupts execution. */
@RestController
@RequestMapping("/api/v1/mobile/work/sessions")
@PreAuthorize("@ss.hasPermission('callphone:ai:chat')")
public class MobileWorkController {
    @Resource private CallPhoneMobileController devices;
    @Resource private AgentRelay relay;
    @Resource private MobileAiRelay chat;
    private final ObjectMapper json = new ObjectMapper();
    private final Semaphore observers = new Semaphore(8);
    private static final ExecutorService EVENTS = Executors.newFixedThreadPool(8, work -> {
        Thread thread = new Thread(work, "mobile-work-observer"); thread.setDaemon(true); return thread;
    });

    AgentActor actor(HttpServletRequest request) { return MobileAgentAccess.requireActor(request, devices); }
    private String id(String value) { return MobileAgentAccess.uuid(value); }
    private JsonNode conversation(JsonNode data, AgentActor actor) {
        String value = data.path("conversation_id").asText();
        if (!value.matches("[1-9][0-9]{0,18}")) throw new AgentRelay.Failure(400, "VALIDATION_ERROR", "会话标识无效");
        return chat.requireConversation(value, actor.tenantId().toString(), actor.userId().toString(), actor.deviceId());
    }
    private JsonNode owned(AgentActor actor, String id) {
        JsonNode result = relay.request("GET", "/" + id, null, null, actor);
        conversation(result.path("data"), actor); return result;
    }
    private ResponseEntity<JsonNode> ok(JsonNode value) { return ResponseEntity.ok().header("Cache-Control", "no-store").body(value); }

    @GetMapping
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> list(HttpServletRequest request) {
        AgentActor actor = actor(request);
        var items = json.createArrayNode();
        for (JsonNode item : relay.request("GET", "", null, null, actor).path("data").path("items")) {
            try {
                JsonNode metadata=conversation(item, actor);
                var row=(com.fasterxml.jackson.databind.node.ObjectNode)item.deepCopy();
                if(metadata!=null && metadata.hasNonNull("source_type")) row.put("source_type",metadata.path("source_type").asText());
                if(metadata!=null && metadata.hasNonNull("parent_id")) row.put("parent_id",metadata.path("parent_id").asText());
                items.add(row);
            }
            catch (MobileAiRelay.ConversationFailure error) { if (error.status != 403) throw error; }
        }
        return ok(json.createObjectNode().set("data", json.createObjectNode().set("items", items)));
    }

    @GetMapping("/capabilities")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> capabilities(HttpServletRequest request) {
        return ok(relay.request("GET", "/capabilities", null, null, actor(request)));
    }
    @PostMapping("/capabilities")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> configureCapability(HttpServletRequest request, @RequestBody JsonNode body) {
        return ok(relay.request("POST", "/capabilities", body, null, actor(request)));
    }

    @PostMapping("/extensions/{plugin:[a-z_]+}/{operation:[a-z_]+}")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> extension(HttpServletRequest request,@PathVariable String plugin,@PathVariable String operation,@RequestBody JsonNode body) {
        if ("receive".equals(operation)) throw new AgentRelay.Failure(400,"VALIDATION_ERROR","回调须使用独立入口");
        return ok(relay.request("POST","/extensions/"+plugin+"/"+operation,body,null,actor(request)));
    }

    @PostMapping
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> create(HttpServletRequest request, @RequestBody JsonNode body) {
        AgentActor actor = actor(request); JsonNode metadata = conversation(body, actor);
        var input = json.createObjectNode().put("conversation_id", body.path("conversation_id").asText());
        input.put("source_type", metadata == null ? "manual" : metadata.path("source_type").asText("manual"));
        if(metadata != null && metadata.hasNonNull("parent_id")) input.put("parent_id",metadata.path("parent_id").asText());
        return ok(relay.request("POST", "", input, null, actor));
    }
    @GetMapping("/{sessionId}")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> get(HttpServletRequest request, @PathVariable String sessionId) { return ok(owned(actor(request), id(sessionId))); }

    @GetMapping("/{sessionId}/plugins")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> plugins(HttpServletRequest request, @PathVariable String sessionId) {
        AgentActor actor = actor(request); String sid = id(sessionId); owned(actor, sid);
        return ok(relay.request("GET", "/" + sid + "/plugins", null, null, actor));
    }

    @PostMapping("/{sessionId}/{operation:messages|files|interrupt|close|seen|plugins}")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> action(HttpServletRequest request, @PathVariable String sessionId, @PathVariable String operation, @RequestBody JsonNode body) {
        AgentActor actor = actor(request); String sid = id(sessionId); owned(actor, sid);
        String key = null;
        if ("messages".equals(operation)) {
            key = id(body.path("request_id").asText());
            if (!key.equals(request.getHeader("Idempotency-Key"))) throw new AgentRelay.Failure(400, "VALIDATION_ERROR", "请求标识不一致");
        }
        if ("files".equals(operation) && body.path("content_base64").asText().length() > 11184812) throw new AgentRelay.Failure(413, "VALIDATION_ERROR", "文件超过 8 MiB");
        return ok(relay.request("POST", "/" + sid + "/" + operation, body, key, actor));
    }
    @PostMapping("/{sessionId}/interactions/{interactionId}")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> answer(HttpServletRequest request, @PathVariable String sessionId, @PathVariable String interactionId, @RequestBody JsonNode body) {
        AgentActor actor = actor(request); String sid = id(sessionId); owned(actor, sid);
        return ok(relay.request("POST", "/" + sid + "/interactions/" + id(interactionId), body, null, actor));
    }
    @GetMapping("/{sessionId}/artifacts/{artifactId}")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<byte[]> artifact(HttpServletRequest request, @PathVariable String sessionId, @PathVariable String artifactId) {
        AgentActor actor = actor(request); String sid = id(sessionId); owned(actor, sid);
        JsonNode artifact = relay.request("GET", "/" + sid + "/artifacts/" + id(artifactId), null, null, actor).path("data");
        byte[] bytes = Base64.getDecoder().decode(artifact.path("content_base64").asText());
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_TYPE, "application/octet-stream")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(artifact.path("name").asText(), StandardCharsets.UTF_8).build().toString()).body(bytes);
    }
    @GetMapping("/{sessionId}/artifacts/{artifactId}/content")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> artifactContent(HttpServletRequest request, @PathVariable String sessionId, @PathVariable String artifactId) {
        AgentActor actor = actor(request); String sid = id(sessionId); owned(actor, sid);
        return ok(relay.request("GET", "/" + sid + "/artifacts/" + id(artifactId), null, null, actor));
    }
    @GetMapping("/{sessionId}/events/batch")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> eventBatch(HttpServletRequest request, @PathVariable String sessionId, @RequestParam(defaultValue = "0") long after) {
        AgentActor actor = actor(request); String sid = id(sessionId); owned(actor, sid);
        if (after < 0) throw new AgentRelay.Failure(400, "VALIDATION_ERROR", "事件游标无效");
        return ok(relay.request("GET", "/" + sid + "/events?after=" + after, null, null, actor));
    }
    @GetMapping(value = "/{sessionId}/events", produces = "text/event-stream")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public SseEmitter events(HttpServletRequest request, @PathVariable String sessionId, @RequestParam(defaultValue = "0") long after) {
        AgentActor actor = actor(request); String sid = id(sessionId); owned(actor, sid);
        if (after < 0 || !observers.tryAcquire()) throw new AgentRelay.Failure(429, "RATE_LIMITED", "观察连接较多，请稍后再试");
        SseEmitter emitter = new SseEmitter(60000L);
        AtomicBoolean stopped = new AtomicBoolean();
        emitter.onCompletion(() -> stopped.set(true)); emitter.onTimeout(() -> { stopped.set(true); emitter.complete(); }); emitter.onError(error -> stopped.set(true));
        // Reuse the authenticated, bounded JSON relay. This observer projects the durable event log to SSE;
        // reconnects use sequence cursors, and transport failures never retry an operation.
        EVENTS.execute(() -> {
            long cursor = after; long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(55); int idle = 0;
            try {
                while (!stopped.get() && System.nanoTime() < until) {
                    JsonNode batch = relay.request("GET", "/" + sid + "/events?after=" + cursor, null, null, actor).path("data");
                    for (JsonNode event : batch.path("items")) {
                        emitter.send(SseEmitter.event().name("work").id(event.path("sequence").asText()).data(event.toString()));
                        cursor = event.path("sequence").asLong(); idle = 0;
                    }
                    if (++idle % 10 == 0) emitter.send(SseEmitter.event().comment("ping"));
                    if (cursor >= batch.path("sequence").asLong()) Thread.sleep(500);
                }
                emitter.complete();
            } catch (Exception error) {
                // No upstream messages, tool parameters, credentials or file contents enter ordinary logs.
                if (!stopped.get()) emitter.completeWithError(new IllegalStateException("Work observation interrupted"));
            } finally { observers.release(); }
        });
        return emitter;
    }
    @ExceptionHandler(Exception.class)
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<?> failure(Exception error) { return MobileAgentAccess.errorResponse(error); }
}
