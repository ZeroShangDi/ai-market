package cn.iocoder.yudao.module.callphone.controller.admin.ai;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationAdoptReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationDismissReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationPageRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationPrepareReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationSourceRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationUpdateReqVO;
import cn.iocoder.yudao.module.callphone.service.ai.FollowUpRecommendationService;
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

@Tag(name = "管理后台 - Call Phone 跟进建议")
@RestController
@RequestMapping("/callphone/ai-recommendation")
@Validated
public class FollowUpRecommendationController {

    @Resource private FollowUpRecommendationService recommendationService;

    @GetMapping("/page")
    @Operation(summary = "本人跟进建议分页")
    @PreAuthorize("@ss.hasPermission('callphone:ai:recommendation:list')")
    public CommonResult<RecommendationPageRespVO> getPage(@Valid RecommendationPageReqVO reqVO) {
        if (reqVO.getQuery() != null && !reqVO.getQuery().isBlank()) reqVO.setCallRecordId(Long.valueOf(reqVO.getQuery()));
        return success(recommendationService.getPage(reqVO, getLoginUserId()));
    }

    @GetMapping("/available-summaries")
    @Operation(summary = "查询本人可提取下一步的已复核通话总结")
    @PreAuthorize("@ss.hasPermission('callphone:ai:recommendation:prepare')")
    public CommonResult<List<RecommendationSourceRespVO>> getAvailableSources() {
        return success(recommendationService.getAvailableSources(getLoginUserId()));
    }

    @PostMapping("/prepare")
    @Operation(summary = "从已复核总结中提取待确认建议")
    @PreAuthorize("@ss.hasPermission('callphone:ai:recommendation:prepare')")
    public CommonResult<Long> prepare(@Valid @RequestBody RecommendationPrepareReqVO reqVO) {
        return success(recommendationService.prepare(reqVO.getCallRecordId(), getLoginUserId()));
    }

    @PostMapping("/update")
    @Operation(summary = "编辑本人待确认建议")
    @PreAuthorize("@ss.hasPermission('callphone:ai:recommendation:edit')")
    public CommonResult<Boolean> update(@Valid @RequestBody RecommendationUpdateReqVO reqVO) {
        return success(recommendationService.update(reqVO, getLoginUserId()));
    }

    @PostMapping("/adopt")
    @Operation(summary = "采纳建议并创建跟进事项")
    @PreAuthorize("@ss.hasPermission('callphone:ai:recommendation:adopt')")
    public CommonResult<Long> adopt(@Valid @RequestBody RecommendationAdoptReqVO reqVO) {
        return success(recommendationService.adopt(reqVO, getLoginUserId()));
    }

    @PostMapping("/dismiss")
    @Operation(summary = "驳回本人待确认建议")
    @PreAuthorize("@ss.hasPermission('callphone:ai:recommendation:review')")
    public CommonResult<Boolean> dismiss(@Valid @RequestBody RecommendationDismissReqVO reqVO) {
        return success(recommendationService.dismiss(reqVO, getLoginUserId()));
    }
}
