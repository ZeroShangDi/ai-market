package cn.iocoder.yudao.module.callphone.controller.admin.wecom;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignActionReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignAuditRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignEstimateReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignEstimateRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignReviewReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignSaveReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComFollowUserRespVO;
import cn.iocoder.yudao.module.callphone.service.wecom.WeComCampaignService;
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

@Tag(name = "管理后台 - Call Phone 企业微信客户运营")
@RestController
@RequestMapping("/callphone/wecom/campaign")
@Validated
public class WeComCampaignController {
    @Resource private WeComCampaignService service;

    @PostMapping("/page")
    @Operation(summary = "分页查询本地加密运营草稿")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:campaign:list')")
    public CommonResult<PageResult<WeComCampaignRespVO>> getPage(@Valid @RequestBody WeComCampaignPageReqVO reqVO) {
        return success(service.getPage(reqVO));
    }

    @GetMapping("/get")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:campaign:list')")
    public CommonResult<WeComCampaignRespVO> get(@RequestParam("id") Long id) { return success(service.get(id)); }

    @GetMapping("/audit-list")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:campaign:list')")
    public CommonResult<java.util.List<WeComCampaignAuditRespVO>> getAuditList(@RequestParam("id") Long id) {
        return success(service.getAuditList(id));
    }

    @GetMapping("/audience-options")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:campaign:estimate')")
    public CommonResult<java.util.List<WeComFollowUserRespVO>> getAudienceOptions() { return success(service.getAudienceOptions()); }

    @PostMapping("/save")
    @Operation(summary = "保存本地加密的运营草稿")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:campaign:save')")
    public CommonResult<WeComCampaignRespVO> save(@Valid @RequestBody WeComCampaignSaveReqVO reqVO) {
        return success(service.save(reqVO, getLoginUserId()));
    }

    @PostMapping("/estimate")
    @Operation(summary = "按本地加密企微客户快照估算人群")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:campaign:estimate')")
    public CommonResult<WeComCampaignEstimateRespVO> estimate(@Valid @RequestBody WeComCampaignEstimateReqVO reqVO) {
        return success(service.estimate(reqVO, getLoginUserId()));
    }

    @PostMapping("/submit")
    @Operation(summary = "提交审批，不发送企微消息")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:campaign:submit')")
    public CommonResult<WeComCampaignRespVO> submit(@Valid @RequestBody WeComCampaignActionReqVO reqVO) {
        return success(service.submit(reqVO, getLoginUserId()));
    }

    @PostMapping("/withdraw")
    @Operation(summary = "撤回待审批草稿")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:campaign:withdraw')")
    public CommonResult<WeComCampaignRespVO> withdraw(@Valid @RequestBody WeComCampaignActionReqVO reqVO) {
        return success(service.withdraw(reqVO, getLoginUserId()));
    }

    @PostMapping("/approve")
    @Operation(summary = "内部审批通过，不发送企微消息")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:campaign:review')")
    public CommonResult<WeComCampaignRespVO> approve(@Valid @RequestBody WeComCampaignReviewReqVO reqVO) {
        return success(service.approve(reqVO, getLoginUserId()));
    }

    @PostMapping("/reject")
    @Operation(summary = "驳回运营草稿并记录原因")
    @PreAuthorize("@ss.hasPermission('callphone:wecom:campaign:review')")
    public CommonResult<WeComCampaignRespVO> reject(@Valid @RequestBody WeComCampaignReviewReqVO reqVO) {
        return success(service.reject(reqVO, getLoginUserId()));
    }
}
