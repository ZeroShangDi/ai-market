package cn.iocoder.yudao.module.callphone.controller.admin.customers;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskAlertPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskAlertPageRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskAlertResolveReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskAlertRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskRuleRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskRuleSaveReqVO;
import cn.iocoder.yudao.module.callphone.service.customers.RiskAlertService;
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

@Tag(name = "管理后台 - Call Phone 风险预警")
@RestController
@RequestMapping("/callphone/risk-alert")
@Validated
public class RiskAlertController {

    @Resource private RiskAlertService service;

    @GetMapping("/page")
    @Operation(summary = "本人风险预警分页及状态统计")
    @PreAuthorize("@ss.hasPermission('callphone:risk:alert:list')")
    public CommonResult<RiskAlertPageRespVO> getPage(@Valid RiskAlertPageReqVO reqVO) {
        return success(service.getPage(reqVO, getLoginUserId()));
    }

    @GetMapping("/get")
    @Operation(summary = "查询本人风险预警详情")
    @PreAuthorize("@ss.hasPermission('callphone:risk:alert:list')")
    public CommonResult<RiskAlertRespVO> get(@RequestParam("id") Long id) {
        return success(service.get(id, getLoginUserId()));
    }

    @GetMapping("/rule-list")
    @Operation(summary = "查询当前租户风险规则")
    @PreAuthorize("@ss.hasPermission('callphone:risk:rule:manage')")
    public CommonResult<List<RiskRuleRespVO>> getRules() {
        return success(service.getRules(getLoginUserId()));
    }

    @PostMapping("/rule-save")
    @Operation(summary = "更新当前租户内置风险规则")
    @PreAuthorize("@ss.hasPermission('callphone:risk:rule:manage')")
    public CommonResult<RiskRuleRespVO> saveRule(@Valid @RequestBody RiskRuleSaveReqVO reqVO) {
        return success(service.saveRule(reqVO, getLoginUserId()));
    }

    @PostMapping("/scan")
    @Operation(summary = "按当前用户权限扫描逾期跟进和长期未更新客户")
    @PreAuthorize("@ss.hasPermission('callphone:risk:alert:scan')")
    public CommonResult<Integer> scan() {
        return success(service.scan(getLoginUserId()));
    }

    @PostMapping("/resolve")
    @Operation(summary = "记录风险预警处置结果")
    @PreAuthorize("@ss.hasPermission('callphone:risk:alert:resolve')")
    public CommonResult<Boolean> resolve(@Valid @RequestBody RiskAlertResolveReqVO reqVO) {
        return success(service.resolve(reqVO, getLoginUserId()));
    }
}
