package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.tenant.core.aop.TenantIgnore;
import cn.iocoder.yudao.module.callphone.service.agent.AgentActor;
import cn.iocoder.yudao.module.callphone.service.agent.AgentRelay;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import jakarta.annotation.security.PermitAll;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Capability URL transport only. The plugin binds the secret to its persisted owner. */
@RestController
@RequestMapping("/api/v1/plugin-hooks")
@TenantIgnore
public class PluginHookController {
    @Resource private AgentRelay relay;
    private final ObjectMapper json = new ObjectMapper();
    @PostMapping("/{plugin:[a-z_]+}/{id:[a-f0-9-]+}/{secret:[a-f0-9]{64}}")
    @PermitAll
    @ApiAccessLog(enable=false,requestEnable=false,responseEnable=false)
    public ResponseEntity<JsonNode> receive(@PathVariable String plugin,@PathVariable String id,@PathVariable String secret,
        HttpServletRequest request,@RequestHeader(value="Idempotency-Key",required=false) String key) throws IOException {
        if(request.getContentType()==null || !request.getContentType().toLowerCase().startsWith("application/json")) throw new AgentRelay.Failure(415,"VALIDATION_ERROR","需要 JSON 通知");
        byte[] bytes=request.getInputStream().readNBytes(6001);
        if(bytes.length>6000 || key!=null && key.length()>200) throw new AgentRelay.Failure(413,"VALIDATION_ERROR","通知参数过大");
        JsonNode payload;
        try {payload=json.readTree(bytes);if(payload==null)throw new IOException();}
        catch(IOException invalid) {throw new AgentRelay.Failure(400,"VALIDATION_ERROR","JSON 无效");}
        var input=json.createObjectNode().put("id",id).put("secret",secret).put("key",key);input.set("payload",payload);
        return ResponseEntity.accepted().header("Cache-Control","no-store").body(relay.request("POST","/extensions/"+plugin+"/receive",input,null,new AgentActor(0L,1L,"1")));
    }
    @ExceptionHandler(Exception.class)
    @ApiAccessLog(enable=false,requestEnable=false,responseEnable=false)
    public ResponseEntity<?> failure(Exception error) { return MobileAgentAccess.errorResponse(error); }
}
