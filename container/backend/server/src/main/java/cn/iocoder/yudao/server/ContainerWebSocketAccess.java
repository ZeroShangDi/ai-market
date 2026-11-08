package cn.iocoder.yudao.server;

import cn.iocoder.yudao.framework.common.biz.system.oauth2.OAuth2TokenCommonApi;
import cn.iocoder.yudao.framework.common.biz.system.permission.PermissionCommonApi;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.framework.websocket.core.security.WebSocketSessionGuard;
import cn.iocoder.yudao.framework.websocket.core.util.WebSocketFrameworkUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.server.*;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.server.HandshakeInterceptor;
import java.util.Map;
import java.util.Objects;

/** 容器装配层的管理通信授权，不向通用通信框架加入业务权限标识。 */
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "yudao.websocket.enable", havingValue = "true")
public class ContainerWebSocketAccess implements HandshakeInterceptor, WebSocketSessionGuard {
    private static final String TOKEN_ATTRIBUTE = "container.socket.accessToken";
    private final OAuth2TokenCommonApi tokens;
    private final PermissionCommonApi permissions;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler, Map<String, Object> attributes) {
        LoginUser user = SecurityFrameworkUtils.getLoginUser();
        String token = request instanceof ServletServerHttpRequest servlet
                ? SecurityFrameworkUtils.obtainAuthorization(servlet.getServletRequest(), "Authorization", "token") : null;
        if (!allowed(user, token)) return false;
        attributes.put(TOKEN_ATTRIBUTE, token);
        return true;
    }
    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler, Exception error) { }
    @Override
    public boolean isAllowed(WebSocketSession session) {
        return allowed(WebSocketFrameworkUtils.getLoginUser(session), (String) session.getAttributes().get(TOKEN_ATTRIBUTE));
    }
    private boolean allowed(LoginUser user, String token) {
        if (user == null || !"default".equals(user.getClientId()) || user.getTenantId() == null || !Objects.equals(user.getUserType(), UserTypeEnum.ADMIN.getValue()) || token == null) return false;
        try {
            var checked = tokens.checkAccessToken(token);
            return checked != null && Objects.equals(checked.getUserId(), user.getId())
                    && Objects.equals(checked.getTenantId(), user.getTenantId())
                    && TenantUtils.execute(user.getTenantId(), () -> permissions.hasAnyPermissions(user.getId(), "infra:websocket:query"));
        } catch (RuntimeException error) { return false; }
    }
}
