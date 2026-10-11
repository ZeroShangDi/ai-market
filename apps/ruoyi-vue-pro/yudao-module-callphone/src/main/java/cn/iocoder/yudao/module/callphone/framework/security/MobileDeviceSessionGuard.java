package cn.iocoder.yudao.module.callphone.framework.security;

import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.module.callphone.controller.mobile.MobileSessionController;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.PairedDeviceMapper;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.framework.common.biz.system.permission.PermissionCommonApi;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import java.util.Objects;
import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.common.exception.enums.GlobalErrorCodeConstants.FORBIDDEN;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.DEVICE_NOT_ONLINE;

/** QR-issued sessions cannot act as desktop admin sessions; revocation takes effect immediately. */
@Configuration
public class MobileDeviceSessionGuard implements WebMvcConfigurer, HandlerInterceptor {
    @Resource private PairedDeviceMapper devices;
    @Resource private AdminUserApi users;
    @Resource private PermissionCommonApi permissions;
    @Override public void addInterceptors(InterceptorRegistry registry) { registry.addInterceptor(this).addPathPatterns("/**"); }
    @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        var user = SecurityFrameworkUtils.getLoginUser();
        if (user == null || user.getScopes() == null) return true;
        String scope = user.getScopes().stream().filter(value -> value.startsWith(MobileSessionController.DEVICE_SCOPE)).findFirst().orElse(null);
        if (scope == null) return true;
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (path.equals("/admin-api/system/auth/logout")) return true;
        if (!path.startsWith("/api/v1/mobile/") && !path.equals("/admin-api/system/auth/refresh-token")) throw exception(FORBIDDEN);
        Long id;
        try { id = Long.valueOf(scope.substring(MobileSessionController.DEVICE_SCOPE.length())); }
        catch (NumberFormatException e) { throw exception(FORBIDDEN); }
        var device = devices.selectById(id);
        if (device == null || !"paired".equals(device.getStatus()) || !Objects.equals(device.getOwnerUserId(), user.getId())
                || !id.toString().equals(request.getHeader("X-Callphone-Device-Id"))
                || !MobileSessionController.matches(request.getHeader("X-Callphone-Device-Key"), device.getDeviceKeyHash())) throw exception(DEVICE_NOT_ONLINE);
        users.validateUser(user.getId());
        if (!permissions.hasAnyPermissions(user.getId(), "callphone:device:pair:manage")) throw exception(FORBIDDEN);
        return true;
    }
}
