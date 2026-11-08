package cn.iocoder.yudao.server;

import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import jakarta.servlet.http.*;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.*;
import java.util.Map;
import cn.iocoder.yudao.module.system.service.oauth2.OAuth2ClientService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import cn.iocoder.yudao.framework.common.util.http.HttpUtils;

/** 应用令牌仅访问显式开放的公共能力，不因为用户是管理员就获得整个管理后台。 */
@Configuration
@RequiredArgsConstructor
public class ContainerApplicationBoundary implements WebMvcConfigurer {
    private final OAuth2ClientService clients;

    @Value("${container.security.require-app-binding:false}")
    private boolean requireBinding;

    private static final Map<String, String> SCOPES = Map.of(
            "GET /admin-api/system/user/profile/get", "user.read",
            "GET /admin-api/infra/config/get-value-by-key", "config.read",
            "GET /admin-api/system/notify-message/my-page", "notify.read",
            "GET /admin-api/system/notify-message/get-unread-count", "notify.read",
            "GET /admin-api/system/notify-message/get-unread-list", "notify.read",
            "PUT /admin-api/system/notify-message/update-read", "notify.write",
            "PUT /admin-api/system/notify-message/update-all-read", "notify.write",
            "POST /admin-api/infra/file/upload", "files.write");
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
                var user = SecurityFrameworkUtils.getLoginUser();
                String verifiedApp = request.getHeader("X-Container-App");
                String clientId = user == null ? null : user.getClientId();
                if (clientId == null) {
                    String[] basic = HttpUtils.obtainBasicAuthorization(request);
                    if (basic != null && basic.length == 2) clientId = basic[0];
                }
                boolean bound = verifiedApp != null && !verifiedApp.isBlank();
                if ((bound && !verifiedApp.equals(clientId)) ||
                        (requireBinding && clientId != null && !"default".equals(clientId) && !bound)) {
                    response.setStatus(403);response.setContentType("application/json;charset=UTF-8");response.getWriter().write("{\"code\":403,\"msg\":\"应用身份不匹配\"}");return false;
                }
                if (user == null || "default".equals(user.getClientId())) return true;
                var client = clients.getOAuth2ClientFromCache(user.getClientId());
                if (client == null || !Integer.valueOf(0).equals(client.getStatus())) {
                    response.setStatus(403);response.setContentType("application/json;charset=UTF-8");response.getWriter().write("{\"code\":403,\"msg\":\"当前应用已停用\"}");return false;
                }
                String scope = SCOPES.get(request.getMethod() + " " + request.getRequestURI());
                if (scope != null && user.getScopes() != null && user.getScopes().contains(scope)) return true;
                response.setStatus(403);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"code\":403,\"msg\":\"当前应用未获该公共接口授权\"}");
                return false;
            }
        }).addPathPatterns("/admin-api/**");
    }
}
