package cn.iocoder.yudao.module.callphone.controller.admin.ai;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiReviewSuggestionDecisionReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiReviewSuggestionPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiReviewSuggestionPageRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiReviewSuggestionRespVO;
import cn.iocoder.yudao.module.callphone.service.ai.AiReviewSuggestionService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 人工复核建议")
@RestController
@RequestMapping("/callphone/ai-review-suggestion")
@Validated
public class AiReviewSuggestionController {

    @Resource private AiReviewSuggestionService service;

    @GetMapping("/page")
    @Operation(summary = "查询本人可复核的 AI 建议")
    @PreAuthorize("@ss.hasPermission('callphone:ai:review-suggestion:list')")
    public CommonResult<AiReviewSuggestionPageRespVO> getPage(@Valid AiReviewSuggestionPageReqVO reqVO) {
        if (reqVO.getQuery() != null && !reqVO.getQuery().isBlank()) reqVO.setCallRecordId(Long.valueOf(reqVO.getQuery()));
        return success(service.getPage(reqVO, getLoginUserId()));
    }

    @GetMapping("/get")
    @Operation(summary = "查看建议内容、风险和来源依据")
    @PreAuthorize("@ss.hasPermission('callphone:ai:review-suggestion:list')")
    public CommonResult<AiReviewSuggestionRespVO> get(@RequestParam("id") Long id) {
        return success(service.get(id, getLoginUserId()));
    }

    @PostMapping("/review")
    @Operation(summary = "通过、修改或拒绝待复核建议")
    @PreAuthorize("@ss.hasPermission('callphone:ai:review-suggestion:review')")
    public CommonResult<Boolean> review(@Valid @RequestBody AiReviewSuggestionDecisionReqVO reqVO) {
        return success(service.review(reqVO, getLoginUserId()));
    }
}
