package cn.iocoder.yudao.server;

import cn.iocoder.yudao.framework.ratelimiter.core.redis.RateLimiterRedisDAO;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.TimeUnit;

/** 有界的端点类别/IP配额；不以密码、参数或可伪造的转发头构造限流桶。 */
@Component
@Order(-110)
public class ContainerApiRateFilter extends OncePerRequestFilter {
    private final RateLimiterRedisDAO limiter;
    private final int loginLimit, apiLimit;
    public ContainerApiRateFilter(RateLimiterRedisDAO limiter,
            @Value("${container.security.login-per-minute:30}") int loginLimit,
            @Value("${container.security.api-per-minute:600}") int apiLimit) {
        this.limiter=limiter;this.loginLimit=loginLimit;this.apiLimit=apiLimit;
        if (loginLimit < 1 || apiLimit < 1) throw new IllegalArgumentException("限流额度必须为正数");
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String path=request.getRequestURI();
        if (!path.startsWith("/admin-api/")) { chain.doFilter(request,response); return; }
        boolean login=path.startsWith("/admin-api/system/auth/") || path.startsWith("/admin-api/system/oauth2/token");
        String digest;
        try { digest=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(request.getRemoteAddr().getBytes(StandardCharsets.UTF_8))); }
        catch (Exception error) { throw new ServletException(error); }
        boolean acquired;
        try { acquired=Boolean.TRUE.equals(limiter.tryAcquire("container-api:"+(login?"auth:":"api:")+digest,login?loginLimit:apiLimit,60,TimeUnit.SECONDS)); }
        catch (RuntimeException unavailable) {
            response.setStatus(503);response.setContentType("application/json;charset=UTF-8");response.getWriter().write("{\"code\":503,\"msg\":\"访问保护服务暂不可用\"}");return;
        }
        if (!acquired) {
            response.setStatus(429);response.setHeader("Retry-After","60");response.setContentType("application/json;charset=UTF-8");response.getWriter().write("{\"code\":429,\"msg\":\"请求过于频繁，请稍后重试\"}");return;
        }
        chain.doFilter(request,response);
    }
}
