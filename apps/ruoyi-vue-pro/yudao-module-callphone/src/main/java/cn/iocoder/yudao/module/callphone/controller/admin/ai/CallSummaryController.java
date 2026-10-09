package cn.iocoder.yudao.module.callphone.controller.admin.ai;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.CallSummaryPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.CallSummaryRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.CallSummaryReviewReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.CallSummarySaveReqVO;
import cn.iocoder.yudao.module.callphone.service.ai.CallSummaryService;
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

@Tag(name = "管理后台 - Call Phone 通话总结")
@RestController
@RequestMapping("/callphone/ai-call-summary")
@Validated
public class CallSummaryController {

    @Resource private CallSummaryService callSummaryService;

    @GetMapping("/page")
    @Operation(summary = "本人通话总结分页")
    @PreAuthorize("@ss.hasPermission('callphone:ai:summary:list')")
    public CommonResult<PageResult<CallSummaryRespVO>> getPage(@Valid CallSummaryPageReqVO reqVO) {
        if (reqVO.getQuery() != null && !reqVO.getQuery().isBlank()) reqVO.setCallRecordId(Long.valueOf(reqVO.getQuery()));
        return success(callSummaryService.getPage(reqVO, getLoginUserId()));
    }

    @GetMapping("/get")
    @Operation(summary = "读取本人通话总结")
    @PreAuthorize("@ss.hasPermission('callphone:ai:summary:list')")
    public CommonResult<CallSummaryRespVO> get(@RequestParam("callRecordId") Long callRecordId) {
        return success(callSummaryService.get(callRecordId, getLoginUserId()));
    }

    @GetMapping("/available-calls")
    @Operation(summary = "读取本人可创建总结的已结束通话")
    @PreAuthorize("@ss.hasPermission('callphone:ai:summary:list')")
    public CommonResult<List<CallSummaryRespVO>> getAvailableCalls() {
        return success(callSummaryService.getAvailableCalls(getLoginUserId()));
    }

    @PostMapping("/save")
    @Operation(summary = "保存本人通话人工总结")
    @PreAuthorize("@ss.hasPermission('callphone:ai:summary:edit')")
    public CommonResult<Boolean> save(@Valid @RequestBody CallSummarySaveReqVO reqVO) {
        return success(callSummaryService.save(reqVO, getLoginUserId()));
    }

    @PostMapping("/review")
    @Operation(summary = "确认本人通话总结")
    @PreAuthorize("@ss.hasPermission('callphone:ai:summary:review')")
    public CommonResult<Boolean> review(@Valid @RequestBody CallSummaryReviewReqVO reqVO) {
        return success(callSummaryService.review(reqVO, getLoginUserId()));
    }
}
