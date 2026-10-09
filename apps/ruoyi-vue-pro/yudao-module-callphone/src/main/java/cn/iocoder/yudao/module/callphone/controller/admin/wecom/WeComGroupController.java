package cn.iocoder.yudao.module.callphone.controller.admin.wecom;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComFollowUserRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComGroupPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComGroupRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComGroupSyncReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComSyncJobRespVO;
import cn.iocoder.yudao.module.callphone.service.wecom.WeComGroupService;
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

@Tag(name = "管理后台 - Call Phone 企业微信群")
@RestController
@RequestMapping("/callphone/wecom/group")
@Validated
public class WeComGroupController {
    @Resource private WeComGroupService service;

    @PostMapping("/page")
    @Operation(summary = "分页查询本地企业微信群")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:group:list')")
    public CommonResult<PageResult<WeComGroupRespVO>> getPage(@Valid @RequestBody WeComGroupPageReqVO reqVO) {
        return success(service.getPage(reqVO));
    }

    @GetMapping("/get")
    @Operation(summary = "读取企微群及授权可见的成员详情")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:group:list')")
    public CommonResult<WeComGroupRespVO> get(@RequestParam("id") Long id,
            @RequestParam(value = "includePii", defaultValue = "false") boolean includePii) {
        return success(service.get(id, includePii));
    }

    @GetMapping("/pii-permission")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:group:list')")
    public CommonResult<Boolean> hasPiiPermission() { return success(service.hasPiiPermission()); }

    @GetMapping("/sync-permission")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:group:list')")
    public CommonResult<Boolean> hasSyncPermission() { return success(service.hasSyncPermission()); }

    @GetMapping("/follow-user/options")
    @Operation(summary = "读取企微群同步范围成员")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:group:sync')")
    public CommonResult<List<WeComFollowUserRespVO>> getFollowUsers() { return success(service.getFollowUserOptions()); }

    @PostMapping("/sync")
    @Operation(summary = "异步只读同步成员可见的企微群")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:group:sync')")
    public CommonResult<WeComSyncJobRespVO> sync(@Valid @RequestBody WeComGroupSyncReqVO reqVO) {
        return success(service.createSyncJob(reqVO, getLoginUserId()));
    }

    @GetMapping("/sync-job/get")
    @Operation(summary = "查询本人发起的企微群同步任务")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:group:list')")
    public CommonResult<WeComSyncJobRespVO> getSyncJob(@RequestParam("id") Long id) {
        return success(service.getSyncJob(id, getLoginUserId()));
    }
}
