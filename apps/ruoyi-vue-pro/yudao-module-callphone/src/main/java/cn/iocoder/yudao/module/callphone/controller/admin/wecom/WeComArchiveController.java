package cn.iocoder.yudao.module.callphone.controller.admin.wecom;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveContentReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveContentRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveCleanupRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchivePageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveSyncStatusRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveRetentionRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveRetentionSaveReqVO;
import cn.iocoder.yudao.module.callphone.service.wecom.WeComArchiveService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 企业微信会话存档")
@RestController
@RequestMapping("/callphone/wecom/archive")
@Validated
public class WeComArchiveController {
    @Resource private WeComArchiveService service;

    @PostMapping("/page")
    @Operation(summary = "分页查询已授权且未过期的存档元数据")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:archive:list')")
    public CommonResult<PageResult<WeComArchiveRespVO>> getPage(@Valid @RequestBody WeComArchivePageReqVO reqVO) {
        return success(service.getPage(reqVO));
    }

    @GetMapping("/sync-status")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:archive:list')")
    public CommonResult<WeComArchiveSyncStatusRespVO> getSyncStatus() { return success(service.getSyncStatus()); }

    @GetMapping("/retention")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:archive:list')")
    public CommonResult<WeComArchiveRetentionRespVO> getRetention() { return success(service.getRetention()); }

    @PostMapping("/retention/save")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:archive:manage-retention')")
    public CommonResult<WeComArchiveRetentionRespVO> saveRetention(@Valid @RequestBody WeComArchiveRetentionSaveReqVO reqVO) {
        return success(service.saveRetention(reqVO));
    }

    @PostMapping("/retention/cleanup")
    @Operation(summary = "按当前保留期限清理一批过期会话正文")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:archive:manage-retention')")
    public CommonResult<WeComArchiveCleanupRespVO> cleanupExpired() {
        return success(service.cleanupExpired(getLoginUserId()));
    }

    @PostMapping("/content")
    @Operation(summary = "经权限校验、用途说明和审计后读取存档正文")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:archive:view-content')")
    public CommonResult<WeComArchiveContentRespVO> getContent(@Valid @RequestBody WeComArchiveContentReqVO reqVO) {
        return success(service.getContent(reqVO));
    }
}
