package cn.iocoder.yudao.module.callphone.controller.admin.settings;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.module.callphone.controller.admin.settings.vo.EntitlementSnapshotRespVO;
import cn.iocoder.yudao.module.callphone.service.settings.EntitlementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;

@Tag(name = "管理后台 - Call Phone 账户与授权")
@RestController
@RequestMapping("/callphone/entitlement")
@Validated
public class EntitlementController {

    @Resource private EntitlementService entitlementService;

    @GetMapping("/current")
    @Operation(summary = "读取当前核心服务授权摘要")
    @PreAuthorize("@ss.hasPermission('callphone:entitlement:view')")
    public CommonResult<EntitlementSnapshotRespVO> getCurrent() {
        return success(entitlementService.getCurrent());
    }

    @PostMapping("/refresh")
    @Operation(summary = "从核心服务刷新授权摘要")
    @PreAuthorize("@ss.hasPermission('callphone:entitlement:view')")
    public CommonResult<EntitlementSnapshotRespVO> refresh() {
        return success(entitlementService.getCurrent());
    }
}
