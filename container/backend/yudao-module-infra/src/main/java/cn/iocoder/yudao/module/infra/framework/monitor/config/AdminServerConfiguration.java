package cn.iocoder.yudao.module.infra.framework.monitor.config;

import de.codecentric.boot.admin.server.config.EnableAdminServer;
import jakarta.servlet.DispatcherType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

/**
 * Spring Boot Admin Server 配置
 *
 * 包含 Admin Server 的启用配置和安全配置
 * 安全配置独立于 {@link cn.iocoder.yudao.framework.security.config.YudaoWebSecurityConfigurerAdapter}，
 * 使用 HTTP Basic 认证保护 Admin Server 端点，不影响现有的 Token 认证机制
 *
 * @author 芋道源码
 */
@Configuration(proxyBeanMethods = false)
@EnableAdminServer
@ConditionalOnClass(name = "de.codecentric.boot.admin.server.config.AdminServerProperties") // 目的：按需启动 spring boot admin 监控服务
public class AdminServerConfiguration {

    @Value("${spring.boot.admin.context-path:''}")
    private String adminSeverContextPath;

    @Value("${CONTAINER_MONITOR_USER}")
    private String username;

    @Value("${CONTAINER_MONITOR_PASSWORD}")
    private String password;

    @Value("${spring.boot.admin.frame-ancestors:'self'}")
    private String frameAncestors;

    /**
     * Spring Boot Admin 专用的 InMemoryUserDetailsManager
     * 使用内存存储，与系统用户隔离
     */
    @Bean("adminUserDetailsManager")
    public InMemoryUserDetailsManager adminUserDetailsManager(PasswordEncoder passwordEncoder) {
        if (username == null || username.isBlank() || password == null || password.length() < 16) {
            throw new IllegalStateException("监控需要独立账号及至少16位密码，禁止空密码或默认弱密码");
        }
        UserDetails adminUser = User.builder()
                .username(username)
                .password(passwordEncoder.encode(password))
                .roles("ADMIN_SERVER")
                .build();
        return new InMemoryUserDetailsManager(adminUser);
    }

    /**
     * Spring Boot Admin Server 的 SecurityFilterChain
     * 使用 @Order(1) 确保优先于默认的 SecurityFilterChain 匹配
     */
    @Bean("adminServerSecurityFilterChain")
    @Order(1)
    public SecurityFilterChain adminServerSecurityFilterChain(HttpSecurity httpSecurity,
                                                               InMemoryUserDetailsManager adminUserDetailsManager) throws Exception {
        // 登录成功后的处理器
        SavedRequestAwareAuthenticationSuccessHandler successHandler = new SavedRequestAwareAuthenticationSuccessHandler();
        successHandler.setTargetUrlParameter("redirectTo");
        successHandler.setDefaultTargetUrl(adminSeverContextPath + "/");

        // 监控使用独立有状态会话，明确仓库，不能继承业务 Token 链的无状态策略。
        var monitorContexts = new org.springframework.security.web.context.DelegatingSecurityContextRepository(
                new org.springframework.security.web.context.RequestAttributeSecurityContextRepository(),
                new org.springframework.security.web.context.HttpSessionSecurityContextRepository());
        // 配置 HttpSecurity 对象
        httpSecurity
                // 仅匹配 Admin Server 的路径
                // Druid 由独立 Servlet 提供，不能使用相对 MVC Servlet 的匹配器。
                .securityMatcher(new org.springframework.security.web.util.matcher.OrRequestMatcher(
                        new org.springframework.security.web.util.matcher.AntPathRequestMatcher(adminSeverContextPath + "/**"),
                        new org.springframework.security.web.util.matcher.AntPathRequestMatcher("/actuator/**"),
                        new org.springframework.security.web.util.matcher.AntPathRequestMatcher("/druid/**")))
                .sessionManagement(session -> session.sessionCreationPolicy(
                        org.springframework.security.config.http.SessionCreationPolicy.IF_REQUIRED))
                .securityContext(context -> context.securityContextRepository(monitorContexts))
                // 使用独立的 UserDetailsManager
                .userDetailsService(adminUserDetailsManager)
                // 授权配置
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(adminSeverContextPath + "/assets/**").permitAll() // 静态资源允许匿名访问
                        .requestMatchers(adminSeverContextPath + "/login").permitAll() // 登录页面允许匿名访问
                        .dispatcherTypeMatchers(DispatcherType.ASYNC).permitAll() // 异步请求允许
                        .anyRequest().hasRole("ADMIN_SERVER") // 只接受独立监控身份
                )
                // 表单登录配置（用于 Admin UI 访问）
                .formLogin(form -> form
                        .securityContextRepository(monitorContexts)
                        .loginPage(adminSeverContextPath + "/login")
                        .successHandler(successHandler)
                        .permitAll()
                )
                // 登出配置
                .logout(logout -> logout
                        .logoutUrl(adminSeverContextPath + "/logout")
                        .logoutSuccessUrl(adminSeverContextPath + "/login")
                )
                // HTTP Basic 认证（用于 Admin Client 注册）
                .httpBasic(Customizer.withDefaults())
                // CSRF 配置
                .csrf(csrf -> csrf
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(new org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler())
                        .ignoringRequestMatchers(
                                adminSeverContextPath + "/instances", // Admin Client 注册端点忽略 CSRF
                                adminSeverContextPath + "/actuator/**" // Actuator 端点忽略 CSRF
                        )
                )
                // 登录成功会轮换 CSRF 令牌，首次打开监控页时即生成新 Cookie。
                .addFilterAfter(new org.springframework.web.filter.OncePerRequestFilter() {
                    @Override
                    protected void doFilterInternal(jakarta.servlet.http.HttpServletRequest request,
                                                    jakarta.servlet.http.HttpServletResponse response,
                                                    jakarta.servlet.FilterChain chain)
                            throws jakarta.servlet.ServletException, java.io.IOException {
                        var token = (org.springframework.security.web.csrf.CsrfToken)
                                request.getAttribute(org.springframework.security.web.csrf.CsrfToken.class.getName());
                        if (token != null) token.getToken();
                        chain.doFilter(request, response);
                    }
                }, org.springframework.security.web.csrf.CsrfFilter.class)
                .headers(headers -> headers
                        // 特殊：Spring Boot Admin 前端基于 Vue，需 unsafe-inline ／ unsafe-eval 支持内联脚本与表达式
                        .contentSecurityPolicy(csp -> csp.policyDirectives(
                                "default-src 'self'; "
                                        + "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                                        + "style-src 'self' 'unsafe-inline'; "
                                        + "frame-ancestors " + frameAncestors))
                        .frameOptions(HeadersConfigurer.FrameOptionsConfig::sameOrigin) // 显式设置 X-Frame-Options 为 SAMEORIGIN
                        .cacheControl(HeadersConfigurer.CacheControlConfig::disable) // 禁用缓存，避免旧配置生效
                );
        return httpSecurity.build();
    }

}
