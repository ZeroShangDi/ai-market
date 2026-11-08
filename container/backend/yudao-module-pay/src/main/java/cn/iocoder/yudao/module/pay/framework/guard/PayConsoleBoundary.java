package cn.iocoder.yudao.module.pay.framework.guard;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.*;
import org.springframework.web.servlet.config.annotation.*;
import jakarta.servlet.http.*;

@Configuration
@RequiredArgsConstructor
public class PayConsoleBoundary implements WebMvcConfigurer {
    private final PayActivationGuard activation;
    @Override
    public void addInterceptors(InterceptorRegistry registry){
        registry.addInterceptor(new HandlerInterceptor(){
            @Override public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler) throws Exception {
                String uri=request.getRequestURI();
                boolean configuration=uri.startsWith("/admin-api/pay/app/")||uri.startsWith("/admin-api/pay/channel/");
                if(configuration||request.getMethod().equals("GET")||activation.enabled())return true;
                response.setStatus(503);response.setContentType("application/json;charset=UTF-8");response.getWriter().write("{\"code\":503,\"msg\":\"支付资金处理未启用\"}");return false;
            }
        }).addPathPatterns("/admin-api/pay/**","/app-api/pay/**");
    }
}
