package cn.iocoder.yudao.framework.apilog.core.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StopWatch;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/** Request diagnostics contain operation identity and duration only, never user input. */
@Slf4j
public class ApiAccessLogInterceptor implements HandlerInterceptor {
    public static final String ATTRIBUTE_HANDLER_METHOD = "HANDLER_METHOD";
    private static final String WATCH = "ApiAccessLogInterceptor.StopWatch";
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (handler instanceof HandlerMethod method) {
            request.setAttribute(ATTRIBUTE_HANDLER_METHOD, method);
            log.info("request.started method={} operation={}.{}", request.getMethod(), method.getBeanType().getSimpleName(), method.getMethod().getName());
        }
        StopWatch watch = new StopWatch(); watch.start(); request.setAttribute(WATCH, watch);
        return true;
    }
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        Object value = request.getAttribute(WATCH);
        if (value instanceof StopWatch watch) {
            watch.stop(); log.info("request.finished status={} durationMs={}", response.getStatus(), watch.getTotalTimeMillis());
        }
    }
}
