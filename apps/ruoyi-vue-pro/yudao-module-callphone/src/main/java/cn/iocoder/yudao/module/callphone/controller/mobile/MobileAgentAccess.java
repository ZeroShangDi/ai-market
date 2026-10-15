package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController;
import cn.iocoder.yudao.module.callphone.service.agent.AgentActor;
import cn.iocoder.yudao.module.callphone.service.agent.AgentRelay;
import cn.iocoder.yudao.module.callphone.service.ai.MobileAiRelay;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import static cn.iocoder.yudao.framework.common.exception.enums.GlobalErrorCodeConstants.FORBIDDEN;
import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

/** Shared trusted mobile identity and safe error envelopes; no task lifecycle or business writes. */
@Slf4j
final class MobileAgentAccess {
    private MobileAgentAccess() {}
    static AgentActor requireActor(HttpServletRequest request, CallPhoneMobileController devices) {
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

    static String uuid(String value) {
        if (value == null || !value.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")) throw new AgentRelay.Failure(400, "VALIDATION_ERROR", "工作标识无效");
        return UUID.fromString(value).toString();
    }

    static ResponseEntity<?> errorResponse(Exception reason) {
        if (!(reason instanceof AgentRelay.Failure) && !(reason instanceof MobileAiRelay.ConversationFailure)
                && !(reason instanceof cn.iocoder.yudao.framework.common.exception.ServiceException)
                && !(reason instanceof org.springframework.security.access.AccessDeniedException)) {
            StackTraceElement origin = reason.getStackTrace().length == 0 ? null : reason.getStackTrace()[0];
            // Never log exception messages: database/validation errors can contain private input.
            log.warn("AI Work failure type={} origin={}", reason.getClass().getSimpleName(),
                    origin == null ? "unknown" : origin.getClassName() + "." + origin.getMethodName());
        }
        int status = 503; String code = "AGENT_UNAVAILABLE", message = "工作服务暂时不可用";
        if (reason instanceof AgentRelay.Failure relayFailure) {
            status = relayFailure.status; code = relayFailure.code; message = relayFailure.getMessage();
        } else if (reason instanceof MobileAiRelay.ConversationFailure unavailable) {
            status = unavailable.status; code = status == 403 ? "FORBIDDEN" : "AI_UNAVAILABLE";
            message = status == 403 ? "当前会话不可用，请重新打开会话" : "会话服务暂时不可用，请稍后重试";
        } else if (reason instanceof cn.iocoder.yudao.framework.common.exception.ServiceException service) {
            status = 403; code = "FORBIDDEN"; message = "当前账号无权使用 AI 工作";
            if (service.getCode().equals(cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.DEVICE_NOT_ONLINE.getCode())) {
                code = "DEVICE_REVOKED"; message = "设备已失效，请重新扫码连接";
            }
        } else if (reason instanceof org.springframework.security.access.AccessDeniedException) {
            status = 403; code = "FORBIDDEN"; message = "当前账号无权使用 AI 工作";
        } else if (reason instanceof org.springframework.http.converter.HttpMessageNotReadableException
                || reason instanceof org.springframework.web.bind.MissingServletRequestParameterException) {
            status = 400; code = "VALIDATION_ERROR"; message = "请求格式不正确";
        }
        return ResponseEntity.status(status).header("Cache-Control", "no-store")
                .body(Map.of("error", Map.of("code", code, "message", message)));
    }
}
