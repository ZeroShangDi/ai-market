package cn.callphone.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import static cn.callphone.ai.Protocol.*;

/** Only the customer-side authenticated adapter may assert tenant/user/device identity. */
@Component
public final class InternalAuthentication extends OncePerRequestFilter {
    private final AiSettings settings;
    private final ObjectMapper json;
    public InternalAuthentication(AiSettings settings,ObjectMapper json) { this.settings=settings;this.json=json; }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) { return !request.getRequestURI().startsWith("/internal/"); }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws IOException,ServletException {
        if(settings.internalToken()==null || settings.internalToken().length()<32) {
            reject(response,503,"AI_UNAVAILABLE","AI 内部认证尚未配置"); return;
        }
        String expected="Bearer "+settings.internalToken(); String actual=request.getHeader("Authorization");
        if(actual==null || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),actual.getBytes(StandardCharsets.UTF_8))) {
            reject(response,403,"FORBIDDEN","无权访问 AI 服务"); return;
        }
        for(String header:new String[]{"X-AI-Tenant","X-AI-User","X-AI-Device"}) {
            String value=request.getHeader(header);
            if(value==null || !value.matches("[0-9]{1,19}")) { reject(response,400,"VALIDATION_ERROR","缺少有效的账号上下文");return; }
        }
        response.setHeader("Cache-Control","no-store"); chain.doFilter(request,response);
    }
    private void reject(HttpServletResponse response,int status,String code,String message) throws IOException {
        response.setStatus(status);response.setContentType("application/json;charset=UTF-8");json.writeValue(response.getOutputStream(),error(code,message));
    }
    static Actor actor(HttpServletRequest request) { return new Actor(request.getHeader("X-AI-Tenant"),request.getHeader("X-AI-User"),request.getHeader("X-AI-Device")); }
}
