package cn.iocoder.yudao.module.callphone.controller.admin.system;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupCreateRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupPreviewRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupRestorePreviewReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupRestoreReqVO;
import cn.iocoder.yudao.module.callphone.service.system.CallPhoneLocalBackupService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.nio.file.Files;
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

@Tag(name = "管理后台 - Call Phone 本地备份与恢复")
@RestController
@RequestMapping("/callphone/system/local-backup")
@Validated
public class CallPhoneLocalBackupController {

    @Resource private CallPhoneLocalBackupService backupService;

    @GetMapping("/page")
    @Operation(summary = "分页读取本租户的加密备份")
    @PreAuthorize("@ss.hasPermission('callphone:backup:list')")
    public CommonResult<PageResult<CallPhoneLocalBackupRespVO>> page(@Valid CallPhoneLocalBackupPageReqVO reqVO) {
        return success(backupService.getPage(reqVO));
    }

    @GetMapping("/get")
    @Operation(summary = "读取备份摘要")
    @PreAuthorize("@ss.hasPermission('callphone:backup:list')")
    public CommonResult<CallPhoneLocalBackupRespVO> get(@RequestParam("id") Long id) {
        return success(backupService.get(id));
    }

    @PostMapping("/create")
    @Operation(summary = "创建本地加密备份")
    @PreAuthorize("@ss.hasPermission('callphone:backup:create')")
    public CommonResult<CallPhoneLocalBackupCreateRespVO> create() {
        return success(backupService.create(getLoginUserId()));
    }

    @GetMapping("/download")
    @Operation(summary = "下载校验过的加密备份文件")
    @PreAuthorize("@ss.hasPermission('callphone:backup:download')")
    public void download(@RequestParam("id") Long id, HttpServletResponse response) throws IOException {
        var file = backupService.getVerifiedArtifact(id, getLoginUserId());
        response.setContentType("application/octet-stream");
        response.setHeader("Content-Disposition", "attachment; filename=\"callphone-backup-" + id + ".cpbak\"");
        response.setContentLengthLong(Files.size(file));
        Files.copy(file, response.getOutputStream());
    }

    @PostMapping("/restore-preview")
    @Operation(summary = "预览备份将替换的当前租户数据")
    @PreAuthorize("@ss.hasPermission('callphone:backup:restore')")
    public CommonResult<CallPhoneLocalBackupPreviewRespVO> previewRestore(@Valid @RequestBody CallPhoneLocalBackupRestorePreviewReqVO reqVO) {
        return success(backupService.previewRestore(reqVO.getBackupId(), getLoginUserId()));
    }

    @PostMapping("/restore")
    @Operation(summary = "经明确确认后恢复当前租户 Call Phone 数据")
    @PreAuthorize("@ss.hasPermission('callphone:backup:restore')")
    public CommonResult<CallPhoneLocalBackupRespVO> restore(@Valid @RequestBody CallPhoneLocalBackupRestoreReqVO reqVO) {
        return success(backupService.restore(reqVO, getLoginUserId()));
    }
}
