package cn.iocoder.yudao.module.callphone.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Semaphore;

/** Bounded streaming proxy. No model key, mobile bearer token or device secret is forwarded. */
@Service
public class MobileAiRelay {
    @Value("${AI_SERVICE_URL:http://127.0.0.1:48081}") private String serviceUrl;
    @Value("${AI_INTERNAL_TOKEN:}") private String internalToken;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
    private final Semaphore connections=new Semaphore(16);
    private final ObjectMapper json=new ObjectMapper();
    public void forward(String method,String path,String cursor,String limit,String body,String key,
                        String tenant,String user,String device,HttpServletResponse response) throws IOException {
        response.setHeader("Cache-Control","no-store");
        if(!allowed(method,path)) { error(response,405,"VALIDATION_ERROR","请求路径或方法不支持");return; }
        if(internalToken==null || internalToken.length()<32) {error(response,503,"AI_UNAVAILABLE","AI 服务尚未配置，请联系管理员");return;}
        if(body!=null && body.length()>8192) {error(response,400,"VALIDATION_ERROR","请求内容过长");return;}
        boolean stream=path.equals("/messages/stream");
        if(stream && !connections.tryAcquire()) {error(response,429,"RATE_LIMITED","AI 请求较多，请稍后再试");return;}
        try {
            String query="";
            if(cursor!=null) {
                if(cursor.length()>200) {error(response,400,"VALIDATION_ERROR","分页游标无效");return;}
                query="?cursor="+URLEncoder.encode(cursor,StandardCharsets.UTF_8);
            }
            if(limit!=null) {
                if(!limit.matches("[0-9]{1,3}")) {error(response,400,"VALIDATION_ERROR","分页大小无效");return;}
                query+=(query.isEmpty()?"?":"&")+"limit="+limit;
            }
            HttpRequest.Builder builder=HttpRequest.newBuilder(URI.create(serviceUrl.replaceAll("/+$","")+"/internal/v1/ai"+path+query))
                .timeout(Duration.ofSeconds(210)).header("Authorization","Bearer "+internalToken)
                .header("X-AI-Tenant",tenant).header("X-AI-User",user).header("X-AI-Device",device)
                .header("Content-Type","application/json").header("Accept",stream?"text/event-stream":"application/json");
            if(key!=null) {
                if(!key.matches("[a-fA-F0-9-]{36}")) {error(response,400,"VALIDATION_ERROR","幂等标识无效");return;}
                builder.header("Idempotency-Key",key);
            }
            builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body,StandardCharsets.UTF_8));
            var upstream=client.send(builder.build(),HttpResponse.BodyHandlers.ofInputStream());
            try(InputStream input=upstream.body()) {
                response.setStatus(upstream.statusCode());
                response.setContentType(stream && upstream.statusCode()==200?"text/event-stream;charset=UTF-8":"application/json;charset=UTF-8");
                if(stream) response.setHeader("X-Accel-Buffering","no");
                byte[] buffer=new byte[4096];int count;
                while((count=input.read(buffer))!=-1) {response.getOutputStream().write(buffer,0,count);response.getOutputStream().flush();}
            }
        } catch(InterruptedException e) {
            Thread.currentThread().interrupt(); if(!response.isCommitted()) error(response,503,stream?"STREAM_INTERRUPTED":"AI_UNAVAILABLE",stream?"连接中断，请刷新回复状态":"AI 服务暂时不可用");
        } catch(IOException | IllegalArgumentException e) {
            // Once SSE is established, the client queries persistent state rather than starting another completion.
            if(!response.isCommitted()) error(response,503,stream?"STREAM_INTERRUPTED":"AI_UNAVAILABLE",stream?"连接中断，请刷新回复状态":"AI 服务暂时不可达，请稍后重试");
        } finally {if(stream) connections.release();}
    }
    static boolean allowed(String method,String path) {
        return switch(method) {
            case "GET" -> path.equals("/conversations") || path.matches("/conversations/[0-9]+/messages") || path.matches("/requests/[a-fA-F0-9-]{36}");
            case "POST" -> path.equals("/conversations") || path.equals("/messages/stream") || path.matches("/requests/[a-fA-F0-9-]{36}/cancel");
            case "DELETE" -> path.matches("/conversations/[0-9]+");
            default -> false;
        };
    }
    private void error(HttpServletResponse response,int status,String code,String message) throws IOException {
        response.setStatus(status);response.setContentType("application/json;charset=UTF-8");
        json.writeValue(response.getOutputStream(),Map.of("error",Map.of("code",code,"message",message)));
    }
}
