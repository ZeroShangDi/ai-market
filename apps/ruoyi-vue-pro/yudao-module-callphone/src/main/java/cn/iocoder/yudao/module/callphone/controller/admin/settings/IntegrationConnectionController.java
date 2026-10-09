package cn.iocoder.yudao.module.callphone.controller.admin.settings;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.module.callphone.controller.admin.settings.vo.IntegrationConnectionRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.settings.vo.IntegrationConnectionSaveReqVO;
import cn.iocoder.yudao.module.callphone.service.settings.IntegrationConnectionService;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Base64;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;

@Tag(name = "管理后台 - Call Phone 扩展服务")
@RestController
@RequestMapping("/callphone/integration")
@Validated
public class IntegrationConnectionController {
    @Resource private IntegrationConnectionService service;

    @GetMapping("/list")
    @Operation(summary = "读取扩展服务配置")
    @PreAuthorize("@ss.hasPermission('callphone:integration:list')")
    public CommonResult<List<IntegrationConnectionRespVO>> getList() { return success(service.getList()); }

    @PostMapping("/save")
    @Operation(summary = "保存加密后的扩展服务凭据")
    @PreAuthorize("@ss.hasPermission('callphone:integration:manage')")
    public CommonResult<Boolean> save(@Valid @RequestBody IntegrationConnectionSaveReqVO req,
            @RequestHeader(value = "X-CallPhone-Integration-Credentials", required = false) String encodedCredentials) {
        if (encodedCredentials != null && !encodedCredentials.isBlank()) {
            if (encodedCredentials.length() > 16_384) {
                throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
            }
            try {
                JSONObject credentialsJson = JSONUtil.parseObj(new String(Base64.getDecoder().decode(encodedCredentials), StandardCharsets.UTF_8));
                Map<String, String> credentials = new HashMap<>();
                credentialsJson.forEach((key, value) -> {
                    if (!(value instanceof String)) throw new IllegalArgumentException("Credential values must be strings");
                    credentials.put(key, (String) value);
                });
                req.setCredentials(credentials);
            } catch (RuntimeException exception) {
                throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(ErrorCodeConstants.INTEGRATION_CONFIG_INVALID);
            }
        }
        return success(service.save(req));
    }

    @PostMapping("/revoke")
    @Operation(summary = "撤销扩展服务并删除凭据密文")
    @PreAuthorize("@ss.hasPermission('callphone:integration:manage')")
    public CommonResult<Boolean> revoke(@RequestParam("id") Long id, @RequestParam("expectedVersion") Integer expectedVersion) {
        return success(service.revoke(id, expectedVersion));
    }

    @PostMapping("/test")
    @Operation(summary = "检测企业微信只读权限或 AI 核心服务授权")
    @PreAuthorize("@ss.hasPermission('callphone:integration:manage')")
    public CommonResult<IntegrationConnectionRespVO> test(@RequestParam("id") Long id,
            @RequestParam("expectedVersion") Integer expectedVersion) {
        return success(service.test(id, expectedVersion));
    }
}
