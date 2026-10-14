package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController;
import cn.iocoder.yudao.module.callphone.service.agent.AgentActor;
import cn.iocoder.yudao.module.callphone.service.agent.AgentFollowUpService;
import cn.iocoder.yudao.module.callphone.service.agent.AgentTaskRelay;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

import static cn.iocoder.yudao.framework.common.exception.enums.GlobalErrorCodeConstants.FORBIDDEN;
import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

/** Authenticated mobile adapter. Tasks are owned by the independent execution service. */
@RestController
@RequestMapping("/api/v1/mobile/ai/tasks")
@PreAuthorize("@ss.hasPermission('callphone:ai:chat')")
public class MobileAgentTaskController {
    @Resource private CallPhoneMobileController devices;
    @Resource private AgentTaskRelay relay;
    @Resource private AgentFollowUpService followUps;
    private final ObjectMapper json = new ObjectMapper();

    @PostMapping
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> create(HttpServletRequest request, @RequestBody JsonNode input) {
        AgentActor actor = actor(request);
        ObjectNode body = validateCreate(input);
        Long customerId = AgentFollowUpService.numericId(body.path("customer_id"));
        body.set("customer_snapshot", followUps.customerSnapshot(customerId, actor));
        return ok(relay.request("POST", "", body, body.path("request_id").asText(), actor));
    }

    @GetMapping
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> list(HttpServletRequest request, @RequestParam("conversation_id") String conversationId) {
        AgentActor actor = actor(request);
        AgentFollowUpService.numericId(json.getNodeFactory().textNode(conversationId));
        JsonNode result = relay.request("GET", "?conversation_id=" + conversationId, null, null, actor);
        JsonNode items = result.path("data").path("items");
        if (items.isArray()) {
            var reconciled = json.createArrayNode();
            for (JsonNode item : items) reconciled.add(reconcileReceipt(item, actor));
            ((ObjectNode) result.path("data")).set("items", reconciled);
        }
        return ok(result);
    }

    @GetMapping("/{taskId}")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> get(HttpServletRequest request, @PathVariable String taskId) {
        AgentActor actor = actor(request);
        JsonNode result = relay.request("GET", "/" + uuid(taskId), null, null, actor);
        ((ObjectNode) result).set("data", reconcileReceipt(result.path("data"), actor));
        return ok(result);
    }

    @GetMapping("/{taskId}/artifact")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> artifact(HttpServletRequest request, @PathVariable String taskId) {
        AgentActor actor = actor(request);
        return ok(relay.request("GET", "/" + uuid(taskId) + "/artifact", null, null, actor));
    }

    @PostMapping("/{taskId}/cancel")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<JsonNode> cancel(HttpServletRequest request, @PathVariable String taskId) {
        AgentActor actor = actor(request);
        return ok(relay.request("POST", "/" + uuid(taskId) + "/cancel", json.createObjectNode(), null, actor));
    }

    @PostMapping("/{taskId}/confirm")
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    @PreAuthorize("@ss.hasPermission('callphone:ai:chat') && @ss.hasPermission('callphone:followup:save')")
    public ResponseEntity<JsonNode> confirm(HttpServletRequest request, @PathVariable String taskId) {
        AgentActor actor = actor(request);
        String id = uuid(taskId);
        JsonNode task = relay.request("GET", "/" + id, null, null, actor).path("data");
        Long followUpId = followUps.confirm(id, task, actor);
        ObjectNode receipt = json.createObjectNode().put("follow_up_task_id", followUpId.toString());
        // The transaction has committed. If receipt delivery fails, repeat confirmation reuses it.
        try {
            return ok(relay.request("POST", "/" + id + "/confirm", receipt, null, actor));
        } catch (AgentTaskRelay.Failure unavailable) {
            return ok(json.createObjectNode().set("data", pendingReceipt(task, followUpId)));
        }
    }

    private ResponseEntity<JsonNode> ok(JsonNode body) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }

    private JsonNode reconcileReceipt(JsonNode task, AgentActor actor) {
        String status = task.path("status").asText();
        if (!"awaiting_confirmation".equals(status) && !"cancelled".equals(status)) return task;
        Long receipt = followUps.committedReceipt(uuid(task.path("id").asText()), task, actor);
        if (receipt == null) return task;
        try {
            return relay.request("POST", "/" + task.path("id").asText() + "/confirm",
                    json.createObjectNode().put("follow_up_task_id", receipt.toString()), null, actor).path("data");
        } catch (AgentTaskRelay.Failure unavailable) {
            // Return the committed business outcome even when execution-service receipt delivery is down.
            return pendingReceipt(task, receipt);
        }
    }

    private ObjectNode pendingReceipt(JsonNode task, Long receipt) {
        ObjectNode pending = task.deepCopy();
        pending.put("follow_up_task_id", receipt.toString()); pending.put("confirmation_pending", true);
        return pending;
    }

    AgentActor actor(HttpServletRequest request) {
        var user = SecurityFrameworkUtils.getLoginUser();
        if (user == null || user.getId() == null || !Objects.equals(user.getUserType(), UserTypeEnum.ADMIN.getValue())) throw exception(FORBIDDEN);
        String deviceId = request.getHeader("X-Callphone-Device-Id");
        String deviceKey = request.getHeader("X-Callphone-Device-Key");
        if (deviceId == null || !deviceId.matches("[0-9]{1,19}") || deviceKey == null) throw exception(FORBIDDEN);
        if (user.getScopes() != null && user.getScopes().stream().anyMatch(scope -> scope.startsWith(MobileSessionController.DEVICE_SCOPE))
                && !user.getScopes().contains(MobileSessionController.DEVICE_SCOPE + deviceId)) throw exception(FORBIDDEN);
        long numericId;
        try { numericId = Long.parseLong(deviceId); }
        catch (NumberFormatException e) { throw exception(FORBIDDEN); }
        devices.requireDevice(numericId, deviceKey);
        Long tenantId = TenantContextHolder.getTenantId();
        if (tenantId == null || (user.getTenantId() != null && !tenantId.equals(user.getTenantId()))) throw exception(FORBIDDEN);
        return new AgentActor(tenantId, user.getId(), deviceId);
    }

    static ObjectNode validateCreate(JsonNode input) {
        if (input == null || !input.isObject()) throw invalid("请求格式不正确");
        String requestId = uuid(requiredText(input, "request_id", 36));
        AgentFollowUpService.numericId(input.path("conversation_id"));
        AgentFollowUpService.numericId(input.path("customer_id"));
        String prompt = requiredText(input, "prompt", 2000);
        JsonNode attachment = input.path("attachment");
        String name = requiredText(attachment, "name", 120);
        String lowerName = name.toLowerCase(Locale.ROOT);
        if (name.contains("/") || name.contains("\\") || name.chars().anyMatch(ch -> ch < 32 || ch == 127)
                || !(lowerName.endsWith(".txt") || lowerName.endsWith(".md"))) throw invalid("请上传 TXT 或 Markdown 文本资料");
        String content = requiredText(attachment, "content", 65536);
        if (content.getBytes(StandardCharsets.UTF_8).length > 65536) throw invalid("资料内容不能超过 64 KiB");
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode body = mapper.createObjectNode().put("request_id", requestId)
                .put("conversation_id", input.path("conversation_id").textValue())
                .put("customer_id", input.path("customer_id").textValue()).put("prompt", prompt);
        body.set("attachment", mapper.createObjectNode().put("name", name).put("content", content));
        return body;
    }

    private static String requiredText(JsonNode input, String field, int limit) {
        JsonNode value = input.path(field);
        if (!value.isTextual() || value.textValue().isBlank() || value.textValue().length() > limit) throw invalid("请求字段缺失或过长：" + field);
        return value.textValue();
    }

    static String uuid(String value) {
        if (value == null || !value.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")) throw invalid("任务标识无效");
        return UUID.fromString(value).toString();
    }

    private static AgentTaskRelay.Failure invalid(String message) { return new AgentTaskRelay.Failure(400, "VALIDATION_ERROR", message); }

    /** Prevent exception logging from retaining attachment contents or proposals. */
    @ExceptionHandler(Exception.class)
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<?> failure(Exception reason) {
        int status = 503; String code = "AGENT_UNAVAILABLE", message = "任务服务暂时不可用";
        if (reason instanceof AgentTaskRelay.Failure relayFailure) {
            status = relayFailure.status; code = relayFailure.code; message = relayFailure.getMessage();
        } else if (reason instanceof cn.iocoder.yudao.framework.common.exception.ServiceException service) {
            status = 403; code = "FORBIDDEN"; message = "当前账号无权使用 AI 任务";
            if (service.getCode().equals(cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.DEVICE_NOT_ONLINE.getCode())) {
                code = "DEVICE_REVOKED"; message = "设备已失效，请重新扫码连接";
            }
        } else if (reason instanceof org.springframework.security.access.AccessDeniedException) {
            status = 403; code = "FORBIDDEN"; message = "当前账号无权使用 AI 任务";
        } else if (reason instanceof org.springframework.http.converter.HttpMessageNotReadableException
                || reason instanceof org.springframework.web.bind.MissingServletRequestParameterException) {
            status = 400; code = "VALIDATION_ERROR"; message = "请求格式不正确";
        }
        return ResponseEntity.status(status).header("Cache-Control", "no-store")
                .body(Map.of("error", Map.of("code", code, "message", message)));
    }
}
