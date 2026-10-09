package cn.iocoder.yudao.module.callphone.controller.admin.customers;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.ServiceReviewPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.ServiceReviewPageRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.ServiceReviewRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.ServiceReviewSaveReqVO;
import cn.iocoder.yudao.module.callphone.service.outbound.CallRecordingAccessService;
import cn.iocoder.yudao.module.callphone.service.outbound.CallRecordingContent;
import cn.iocoder.yudao.module.callphone.service.customers.ServiceReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 服务质检")
@RestController
@RequestMapping("/callphone/service-review")
@Validated
public class ServiceReviewController {

    @Resource private ServiceReviewService serviceReviewService;
    @Resource private CallRecordingAccessService recordingAccessService;

    @GetMapping("/available-calls")
    @Operation(summary = "读取本人待质检通话")
    @PreAuthorize("@ss.hasPermission('callphone:service:review:list')")
    public CommonResult<List<ServiceReviewRespVO>> getAvailableCalls() {
        return success(serviceReviewService.getAvailableCalls(getLoginUserId()));
    }

    @GetMapping("/page")
    @Operation(summary = "读取本人质检记录")
    @PreAuthorize("@ss.hasPermission('callphone:service:review:list')")
    public CommonResult<ServiceReviewPageRespVO> getPage(@Valid ServiceReviewPageReqVO reqVO) {
        return success(serviceReviewService.getPage(reqVO, getLoginUserId()));
    }

    @PostMapping("/save")
    @Operation(summary = "保存本人通话质检结果")
    @PreAuthorize("@ss.hasPermission('callphone:service:review:save')")
    public CommonResult<Boolean> save(@Valid @RequestBody ServiceReviewSaveReqVO reqVO) {
        return success(serviceReviewService.save(reqVO, getLoginUserId()));
    }

    @GetMapping("/recording")
    @Operation(summary = "读取本人质检通话的本地录音")
    @PreAuthorize("@ss.hasPermission('callphone:service:review:recording')")
    public void getRecording(@RequestParam("id") Long id, HttpServletResponse response) throws IOException {
        CallRecordingContent recording = recordingAccessService.readForServiceReview(id, getLoginUserId());
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(recording.contentType());
        response.setContentLengthLong(recording.bytes().length);
        response.setHeader("Content-Disposition", "inline; filename=call-recording");
        response.setHeader("Cache-Control", "private, no-store, max-age=0");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.getOutputStream().write(recording.bytes());
    }
}
