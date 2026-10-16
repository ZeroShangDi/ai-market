package cn.iocoder.yudao.module.callphone.controller.admin.leads;

import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.service.leads.LeadPluginImportService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.permission.PermissionApi;
import jakarta.annotation.Resource;
import jakarta.annotation.security.PermitAll;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

/** Internal, fixed-purpose bridge. Never accepts a caller-supplied URL or arbitrary operation. */
@RestController
@RequestMapping("/callphone/plugin/leads")
public class LeadPluginController {
    @Value("${AGENT_INTERNAL_TOKEN:}") private String internalToken;
    @Resource private AdminUserApi users;
    @Resource private PermissionApi permissions;
    @Resource private LeadPluginImportService imports;

    @PostMapping("/import")
    @PermitAll
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<?> importRows(HttpServletRequest request, @RequestBody LeadPluginImportService.Input input) {
        return perform(request, input);
    }
    @GetMapping("/connection")
    @PermitAll
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<?> connection(HttpServletRequest request) { return perform(request, null); }

    private ResponseEntity<?> perform(HttpServletRequest request, LeadPluginImportService.Input input) {
        String supplied = request.getHeader("X-Work-Internal-Token");
        if (internalToken == null || internalToken.length() < 32 || supplied == null
                || !MessageDigest.isEqual(internalToken.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8)))
            return failure(401, "内部认证失败");
        Long actor;
        try {
            String value = request.getHeader("X-AI-User");
            if (value == null || !value.matches("[1-9][0-9]{0,18}") || TenantContextHolder.getTenantId() == null) return failure(403, "工作身份无效");
            actor = Long.valueOf(value);
        } catch (NumberFormatException error) { return failure(403, "工作身份无效"); }
        // Tenant filter validates tenant-id; user lookup remains tenant-scoped. Recheck permissions on every batch.
        var user = users.getUser(actor);
        if (user == null || !Integer.valueOf(0).equals(user.getStatus())
                || !permissions.hasAnyPermissions(actor, "callphone:ai:chat")
                || !permissions.hasAnyPermissions(actor, "callphone:lead:create")) return failure(403, "当前账号无权导入线索");
        if (input == null) return ResponseEntity.ok().header("Cache-Control", "no-store").body(Map.of("data", Map.of("account", "用户 " + actor + " · 租户 " + TenantContextHolder.getTenantId())));
        var previous = SecurityContextHolder.getContext();
        SecurityContextHolder.setContext(SecurityContextHolder.createEmptyContext());
        try {
            LoginUser login = new LoginUser(); login.setId(actor); login.setUserType(2); login.setTenantId(TenantContextHolder.getTenantId());
            SecurityFrameworkUtils.setLoginUser(login, request);
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(Map.of("data", imports.execute(input, actor)));
        } catch (IllegalArgumentException error) { return failure(400, "导入批次格式无效"); }
        finally { SecurityContextHolder.setContext(previous); }
    }
    private ResponseEntity<?> failure(int status, String message) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(Map.of("error", Map.of("message", message)));
    }
}
