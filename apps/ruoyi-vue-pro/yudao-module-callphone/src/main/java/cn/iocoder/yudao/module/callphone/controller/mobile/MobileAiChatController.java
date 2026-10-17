package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController;
import cn.iocoder.yudao.module.callphone.service.ai.MobileAiRelay;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.util.Objects;
import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.common.exception.enums.GlobalErrorCodeConstants.FORBIDDEN;

/** Mobile protocol adapter only. The independent AI service owns all conversation state. */
@RestController
@RequestMapping("/api/v1/mobile/ai")
public class MobileAiChatController {
    @Resource private CallPhoneMobileController devices;
    @Resource private MobileAiRelay relay;
    @Resource private cn.iocoder.yudao.module.callphone.service.ai.VoiceSessionIssuer voice;

    @RequestMapping(value={"/conversations","/conversations/{id:[0-9]+}","/conversations/{id:[0-9]+}/messages",
        "/voice/session","/messages/stream","/requests/{requestId:[a-fA-F0-9-]+}","/requests/{requestId:[a-fA-F0-9-]+}/cancel"},
        method={RequestMethod.GET,RequestMethod.POST,RequestMethod.DELETE})
    @PreAuthorize("@ss.hasPermission('callphone:ai:chat')")
    @ApiAccessLog(requestEnable=false,responseEnable=false)
    public void forward(HttpServletRequest request,HttpServletResponse response,@RequestBody(required=false) String body) throws IOException {
        var user=SecurityFrameworkUtils.getLoginUser();
        if(user==null || !Objects.equals(user.getUserType(),UserTypeEnum.ADMIN.getValue())) throw exception(FORBIDDEN);
        String deviceId=request.getHeader("X-Callphone-Device-Id");
        String deviceKey=request.getHeader("X-Callphone-Device-Key");
        if(deviceId==null || !deviceId.matches("[0-9]{1,19}") || deviceKey==null) throw exception(FORBIDDEN);
        if(user.getScopes()!=null && user.getScopes().stream().anyMatch(s -> s.startsWith(MobileSessionController.DEVICE_SCOPE))
            && !user.getScopes().contains(MobileSessionController.DEVICE_SCOPE+deviceId)) throw exception(FORBIDDEN);
        long numericId;
        try { numericId=Long.parseLong(deviceId); } catch(NumberFormatException e) { throw exception(FORBIDDEN); }
        devices.requireDevice(numericId,deviceKey);
        Long tenant=TenantContextHolder.getTenantId();
        // Derive identity from the authenticated tenant context; ignore caller-supplied internal headers.
        if(tenant==null || (user.getTenantId()!=null && !tenant.equals(user.getTenantId()))) throw exception(FORBIDDEN);
        String path=request.getRequestURI().substring(request.getContextPath().length()+"/api/v1/mobile/ai".length());
        if (path.equals("/voice/session")) {
            if (!request.getMethod().equals("POST")) { response.setStatus(405); return; }
            response.setHeader("Cache-Control", "no-store");
            response.setContentType("application/json;charset=UTF-8");
            new com.fasterxml.jackson.databind.ObjectMapper().writeValue(response.getOutputStream(),
                java.util.Map.of("data", voice.issue(tenant.toString(), user.getId().toString(), deviceId)));
            return;
        }
        relay.forward(request.getMethod(),path,request.getParameter("cursor"),request.getParameter("limit"),body,
            request.getHeader("Idempotency-Key"),tenant.toString(),user.getId().toString(),deviceId,response);
    }
    /** Prevent the shared exception logger from retaining a chat request body. */
    @ExceptionHandler(Exception.class)
    @ApiAccessLog(requestEnable=false,responseEnable=false)
    public org.springframework.http.ResponseEntity<?> failure(Exception reason) {
        String code="AI_UNAVAILABLE",message="AI 服务暂时不可用"; int status=503;
        if(reason instanceof cn.iocoder.yudao.module.callphone.service.ai.VoiceSessionIssuer.Unavailable) {
            code="VOICE_UNAVAILABLE";message="语音服务尚未配置，请联系管理员";
        } else if(reason instanceof cn.iocoder.yudao.framework.common.exception.ServiceException service) {
            status=403;code="FORBIDDEN";message="当前账号无权使用 AI 对话";
            if(service.getCode().equals(cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.DEVICE_NOT_ONLINE.getCode())) {
                code="DEVICE_REVOKED";message="设备已失效，请重新扫码连接";
            }
        } else if(reason instanceof org.springframework.security.access.AccessDeniedException) {
            status=403;code="FORBIDDEN";message="当前账号无权使用 AI 对话";
        } else if(reason instanceof org.springframework.http.converter.HttpMessageNotReadableException) {
            status=400;code="VALIDATION_ERROR";message="请求格式不正确";
        }
        return org.springframework.http.ResponseEntity.status(status).body(java.util.Map.of("error",java.util.Map.of("code",code,"message",message)));
    }
}
