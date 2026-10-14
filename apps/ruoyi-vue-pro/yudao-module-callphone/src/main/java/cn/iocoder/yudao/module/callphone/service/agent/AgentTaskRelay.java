package cn.iocoder.yudao.module.callphone.service.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.Semaphore;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Bounded JSON protocol client. Mobile credentials and caller internal headers never leave Java. */
@Service
@Slf4j
public class AgentTaskRelay {
    public static final int MAX_RESPONSE_BYTES = 1024 * 1024;
    @Value("${AGENT_SERVICE_URL:http://127.0.0.1:48082}") private String serviceUrl;
    @Value("${AGENT_INTERNAL_TOKEN:}") private String internalToken;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final ObjectMapper json = new ObjectMapper();
    private final Semaphore requests = new Semaphore(16);
    private static final ScheduledExecutorService BODY_TIMEOUTS = Executors.newSingleThreadScheduledExecutor(work -> {
        Thread thread = new Thread(work, "agent-relay-body-timeout"); thread.setDaemon(true); return thread;
    });

    public JsonNode request(String method, String path, JsonNode body, String key, AgentActor actor) {
        if (internalToken == null || internalToken.length() < 32) {
            throw new Failure(503, "AGENT_UNAVAILABLE", "任务服务尚未配置，请联系管理员");
        }
        if (!requests.tryAcquire()) throw new Failure(429, "RATE_LIMITED", "任务请求较多，请稍后再试");
        String phase = "send";
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(serviceUrl.replaceAll("/+$", "")
                            + "/internal/v1/agent/tasks" + path))
                    .timeout(Duration.ofSeconds(15)).header("Authorization", "Bearer " + internalToken)
                    .header("X-AI-Tenant", actor.tenantId().toString()).header("X-AI-User", actor.userId().toString())
                    .header("X-AI-Device", actor.deviceId()).header("Content-Type", "application/json")
                    .header("Accept", "application/json");
            if (key != null) builder.header("Idempotency-Key", key);
            builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body), StandardCharsets.UTF_8));
            HttpResponse<InputStream> upstream = client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
            phase = "body";
            try (InputStream input = upstream.body()) {
                // HttpRequest.timeout bounds receipt of headers, so bound streaming body reads separately.
                var deadline = BODY_TIMEOUTS.schedule(() -> {
                    try { input.close(); } catch (IOException ignored) { /* read reports the interrupted connection */ }
                }, 15, TimeUnit.SECONDS);
                byte[] bytes;
                try { bytes = input.readNBytes(MAX_RESPONSE_BYTES + 1); }
                finally { deadline.cancel(false); }
                if (bytes.length > MAX_RESPONSE_BYTES) throw new Failure(502, "AGENT_UNAVAILABLE", "任务服务响应过大");
                if (upstream.statusCode() < 200 || upstream.statusCode() >= 300) {
                    if (upstream.statusCode() >= 500) log.warn("AI task upstream status={}", upstream.statusCode());
                    throw upstreamFailure(upstream.statusCode());
                }
                phase = "json";
                JsonNode result = json.readTree(bytes);
                if (result == null || !result.isObject() || !result.has("data")) {
                    throw new Failure(502, "AGENT_UNAVAILABLE", "任务服务返回格式不正确");
                }
                return result;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Failure(503, "AGENT_UNAVAILABLE", "任务服务连接中断，请刷新状态");
        } catch (IOException | IllegalArgumentException e) {
            log.warn("AI task transport failure phase={} type={} cause={}", phase, e.getClass().getSimpleName(),
                    e.getCause() == null ? "none" : e.getCause().getClass().getSimpleName());
            throw new Failure(503, "AGENT_UNAVAILABLE", "任务服务暂时不可用，请稍后重试");
        } finally {
            requests.release();
        }
    }

    private Failure upstreamFailure(int status) {
        return switch (status) {
            case 400, 422 -> new Failure(400, "VALIDATION_ERROR", "任务输入不符合要求");
            case 403 -> new Failure(403, "FORBIDDEN", "当前账号无权访问该任务");
            case 404 -> new Failure(404, "NOT_FOUND", "任务或结果不存在");
            case 409 -> new Failure(409, "TASK_CONFLICT", "任务状态已变化，请刷新后重试");
            case 429 -> new Failure(429, "RATE_LIMITED", "任务请求较多，请稍后再试");
            default -> new Failure(503, "AGENT_UNAVAILABLE", "任务服务暂时不可用，请稍后重试");
        };
    }

    public static class Failure extends RuntimeException {
        public final int status;
        public final String code;
        public Failure(int status, String code, String message) { super(message); this.status = status; this.code = code; }
    }
}
