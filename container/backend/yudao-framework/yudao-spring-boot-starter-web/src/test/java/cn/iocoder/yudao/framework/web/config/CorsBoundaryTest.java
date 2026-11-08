package cn.iocoder.yudao.framework.web.config;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;

class CorsBoundaryTest {
    private YudaoWebAutoConfiguration config(String origins) {
        var config=new YudaoWebAutoConfiguration();ReflectionTestUtils.setField(config,"browserOrigins",origins);return config;
    }
    private MockHttpServletResponse preflight(String path,String origin) throws Exception {
        var request=new MockHttpServletRequest("OPTIONS",path);request.setServletPath(path);if(path.startsWith("/druid/")){request.setServletPath("/druid");request.setPathInfo(path.substring(6));}request.addHeader("Origin",origin);request.addHeader("Access-Control-Request-Method","GET");
        var response=new MockHttpServletResponse();config("https://pc.example").corsFilterBean().getFilter().doFilter(request,response,new MockFilterChain());return response;
    }
    @Test void unknownOriginCannotReadTokenApis() throws Exception {assertEquals(403,preflight("/admin-api/system/user/profile/get","https://evil.example").getStatus());}
    @Test void registeredOriginUsesTokenWithoutCrossOriginCookies() throws Exception {
        var response=preflight("/admin-api/system/user/profile/get","https://pc.example");assertEquals(200,response.getStatus());assertEquals("https://pc.example",response.getHeader("Access-Control-Allow-Origin"));assertNull(response.getHeader("Access-Control-Allow-Credentials"));
    }
    @Test void evenRegisteredBusinessOriginCannotReadMonitorSession() throws Exception {
        for(String path:new String[]{"/admin/login","/druid/basic.json","/druid;probe=1/basic.json","/actuator/health"})assertEquals(403,preflight(path,"https://pc.example").getStatus());
    }
    @Test void wildcardAndCredentialOriginsAreRejected() {
        for(String origin:new String[]{"*","https://*.example","https://user:password@example.com","https://example.com/extra"})assertThrows(IllegalStateException.class,()->config(origin).corsFilterBean());
    }
}
