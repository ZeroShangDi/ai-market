package cn.iocoder.yudao.framework.datasource.core.filter;

import com.alibaba.druid.util.Utils;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * Druid 底部广告过滤器
 *
 * @author 芋道源码
 */
public class DruidAdRemoveFilter extends OncePerRequestFilter {

    /**
     * common.js 的路径
     */
    private static final String COMMON_JS_ILE_PATH = "support/http/resources/js/common.js";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        chain.doFilter(request, response);
        // 重置缓冲区，响应头不会被重置
        response.resetBuffer();
        // 获取 common.js
        String text = Utils.readFromResource(COMMON_JS_ILE_PATH);
        // 正则替换 banner, 除去底部的广告信息
        text = text.replaceAll("<a.*?banner\"></a><br/>", "");
        text = text.replaceAll("powered.*?shrek.wang</a>", "");
        // 原监控页面用 POST 读取指标；带上独立监控会话的 CSRF 令牌，不关闭 CSRF。
        text += "\n;jQuery.ajaxSetup({beforeSend:function(xhr, settings){"
                + "if (!/^(GET|HEAD|OPTIONS)$/i.test(settings.type) && !settings.crossDomain) {"
                + "var token=document.cookie.split('; ').find(function(v){return v.indexOf('XSRF-TOKEN=')===0;});"
                + "if(token) xhr.setRequestHeader('X-XSRF-TOKEN',decodeURIComponent(token.substring(11)));"
                + "}}});\n";
        response.getWriter().write(text);
    }

}
