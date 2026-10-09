package cn.iocoder.yudao.module.callphone.controller.admin.wecom;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComContactPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComContactRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComContactSyncReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComFollowUserRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComSyncJobRespVO;
import cn.iocoder.yudao.module.callphone.service.wecom.WeComContactService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 企业微信客户")
@RestController
@RequestMapping("/callphone/wecom")
@Validated
public class WeComContactController {
    @Resource private WeComContactService service;

    @PostMapping("/contact/page")
    @Operation(summary = "分页查询当前租户本地企微客户")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:contact:list')")
    public CommonResult<PageResult<WeComContactRespVO>> getPage(@Valid @RequestBody WeComContactPageReqVO reqVO) {
        return success(service.getPage(reqVO));
    }

    @GetMapping("/contact/get")
    @Operation(summary = "读取企微客户详情并按字段权限裁剪")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:contact:list')")
    public CommonResult<WeComContactRespVO> get(@RequestParam("id") Long id,
            @RequestParam(value = "includePii", defaultValue = "false") boolean includePii) {
        return success(service.get(id, includePii));
    }

    @GetMapping("/follow-user/options")
    @Operation(summary = "读取有权同步的企微跟进成员")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:contact:sync')")
    public CommonResult<List<WeComFollowUserRespVO>> getFollowUserOptions() {
        return success(service.getFollowUserOptions());
    }

    @GetMapping("/contact/pii-permission")
    @Operation(summary = "检查当前成员是否可查看企微客户敏感字段")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:contact:list')")
    public CommonResult<Boolean> hasPiiPermission() { return success(service.hasPiiPermission()); }

    @GetMapping("/contact/sync-permission")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:contact:list')")
    public CommonResult<Boolean> hasSyncPermission() { return success(service.hasSyncPermission()); }

    @PostMapping("/contact/sync")
    @Operation(summary = "异步同步指定成员的企微客户")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:contact:sync')")
    public CommonResult<WeComSyncJobRespVO> sync(@Valid @RequestBody WeComContactSyncReqVO reqVO) {
        return success(service.createSyncJob(reqVO, getLoginUserId()));
    }

    @GetMapping("/sync-job/get")
    @Operation(summary = "查询本人发起的企微同步任务")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:contact:list')")
    public CommonResult<WeComSyncJobRespVO> getSyncJob(@RequestParam("id") Long id) {
        return success(service.getSyncJob(id, getLoginUserId()));
    }
}
