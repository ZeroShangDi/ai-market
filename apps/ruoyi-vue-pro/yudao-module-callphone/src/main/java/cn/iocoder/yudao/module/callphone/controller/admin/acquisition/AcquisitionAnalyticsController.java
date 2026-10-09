package cn.iocoder.yudao.module.callphone.controller.admin.acquisition;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionAnalyticsReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionAnalyticsRespVO;
import cn.iocoder.yudao.module.callphone.service.acquisition.AcquisitionAnalyticsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 渠道数据")
@RestController
@RequestMapping("/callphone/acquisition-analytics")
@Validated
public class AcquisitionAnalyticsController {

    @Resource private AcquisitionAnalyticsService analyticsService;

    @GetMapping("/summary")
    @Operation(summary = "渠道线索与转化汇总")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:analytics:list')")
    public CommonResult<AcquisitionAnalyticsRespVO> getSummary(@Valid AcquisitionAnalyticsReqVO reqVO) {
        return success(analyticsService.getSummary(reqVO, getLoginUserId()));
    }
}
