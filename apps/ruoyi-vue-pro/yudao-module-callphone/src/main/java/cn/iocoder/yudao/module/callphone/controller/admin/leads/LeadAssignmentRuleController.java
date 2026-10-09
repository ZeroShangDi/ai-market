package cn.iocoder.yudao.module.callphone.controller.admin.leads;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageParam;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.service.leads.LeadAssignmentRuleApplyResult;
import cn.iocoder.yudao.module.callphone.service.leads.LeadAssignmentAutoConfigView;
import cn.iocoder.yudao.module.callphone.service.leads.LeadAssignmentRulePreviewRow;
import cn.iocoder.yudao.module.callphone.service.leads.LeadAssignmentRuleView;
import cn.iocoder.yudao.module.callphone.service.leads.LeadAssignmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import lombok.Data;
import lombok.EqualsAndHashCode;
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

@Tag(name = "管理后台 - Call Phone 线索分配规则")
@RestController
@RequestMapping("/callphone/lead/assignment-rule")
@Validated
public class LeadAssignmentRuleController {

    private final LeadAssignmentService leadAssignmentService;

    public LeadAssignmentRuleController(LeadAssignmentService leadAssignmentService) {
        this.leadAssignmentService = leadAssignmentService;
    }

    @GetMapping("/page")
    @Operation(summary = "线索分配规则分页")
    @PreAuthorize("@ss.hasPermission('callphone:lead:assign')")
    public CommonResult<PageResult<RuleRespVO>> page(@Valid RulePageReqVO reqVO) {
        PageResult<LeadAssignmentRuleView> page = leadAssignmentService.getRulePage(
                reqVO.getPageNo(), reqVO.getPageSize(), reqVO.getQuery());
        return success(new PageResult<>(page.getList().stream().map(this::toResp).toList(), page.getTotal()));
    }

    @PostMapping("/save")
    @Operation(summary = "新增或更新线索分配规则")
    @PreAuthorize("@ss.hasPermission('callphone:lead:assign')")
    public CommonResult<RuleRespVO> save(@RequestBody @Valid RuleSaveReqVO reqVO) {
        LeadAssignmentRuleView saved = leadAssignmentService.saveRule(reqVO.getId(), reqVO.getExpectedVersion(),
                reqVO.getRuleName(), reqVO.getEnabled(), reqVO.getMemberIds());
        return success(toResp(saved));
    }

    @GetMapping("/auto-config")
    @Operation(summary = "查询当前租户的新线索自动分配与超时回收设置")
    @PreAuthorize("@ss.hasPermission('callphone:lead:assign')")
    public CommonResult<AutoConfigRespVO> getAutoConfig() {
        return success(toAutoConfigResp(leadAssignmentService.getAutoAssignmentConfig()));
    }

    @PostMapping("/auto-config")
    @Operation(summary = "设置新线索自动分配与超时回收策略")
    @PreAuthorize("@ss.hasPermission('callphone:lead:assign')")
    public CommonResult<AutoConfigRespVO> saveAutoConfig(@RequestBody @Valid AutoConfigSaveReqVO reqVO) {
        LeadAssignmentAutoConfigView saved = leadAssignmentService.saveAutoAssignmentConfig(
                reqVO.getRuleId(), reqVO.getRecycleEnabled(), reqVO.getRecycleAfterDays(), reqVO.getExpectedVersion());
        return success(toAutoConfigResp(saved));
    }

    @PostMapping("/preview")
    @Operation(summary = "预览线索分配规则的轮转结果")
    @PreAuthorize("@ss.hasPermission('callphone:lead:assign')")
    public CommonResult<List<RulePreviewRowVO>> preview(@RequestBody @Valid RulePreviewReqVO reqVO) {
        return success(leadAssignmentService.previewRule(reqVO.getRuleId(), reqVO.getExpectedVersion(),
                reqVO.getLeadIds()).stream().map(this::toPreviewResp).toList());
    }

    @PostMapping("/apply")
    @Operation(summary = "按线索分配规则执行轮转分配")
    @PreAuthorize("@ss.hasPermission('callphone:lead:assign')")
    public CommonResult<RuleApplyRespVO> apply(@RequestBody @Valid RuleApplyReqVO reqVO) {
        List<LeadAssignmentRuleApplyResult> results = leadAssignmentService.applyRule(reqVO.getRuleId(),
                reqVO.getExpectedVersion(), reqVO.getLeadIds(), getLoginUserId(), reqVO.getReason());
        RuleApplyRespVO resp = new RuleApplyRespVO();
        resp.setResults(results.stream().map(this::toApplyResultResp).toList());
        resp.setSucceeded((int) results.stream().filter(LeadAssignmentRuleApplyResult::success).count());
        resp.setFailed(results.size() - resp.getSucceeded());
        return success(resp);
    }

    private RuleRespVO toResp(LeadAssignmentRuleView row) {
        RuleRespVO resp = new RuleRespVO();
        resp.setId(row.id());
        resp.setRuleName(row.name());
        resp.setEnabled(row.enabled());
        resp.setCursorIndex(row.cursorIndex());
        resp.setVersion(row.version());
        resp.setMemberIds(row.memberIds());
        resp.setMemberNames(row.memberNames());
        resp.setUpdateTime(row.updateTime());
        return resp;
    }

    private AutoConfigRespVO toAutoConfigResp(LeadAssignmentAutoConfigView row) {
        AutoConfigRespVO resp = new AutoConfigRespVO();
        resp.setRuleId(row.ruleId());
        resp.setVersion(row.version());
        resp.setRecycleEnabled(row.recycleEnabled());
        resp.setRecycleAfterDays(row.recycleAfterDays());
        return resp;
    }

    private RulePreviewRowVO toPreviewResp(LeadAssignmentRulePreviewRow row) {
        RulePreviewRowVO resp = new RulePreviewRowVO();
        resp.setLeadId(row.leadId());
        resp.setToUserId(row.toUserId());
        resp.setToUserName(row.toUserName());
        return resp;
    }

    private RuleApplyResultRespVO toApplyResultResp(LeadAssignmentRuleApplyResult row) {
        RuleApplyResultRespVO resp = new RuleApplyResultRespVO();
        resp.setLeadId(row.leadId());
        resp.setToUserId(row.toUserId());
        resp.setSuccess(row.success());
        resp.setOutcome(row.outcome());
        return resp;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class RulePageReqVO extends PageParam {
        @Size(max = 100)
        private String query;
    }

    @Data
    public static class RuleSaveReqVO {
        private Long id;
        @Min(1)
        private Integer expectedVersion;
        @NotBlank
        @Size(max = 100)
        private String ruleName;
        private Boolean enabled;
        @NotEmpty
        @Size(min = 2, max = 20)
        private List<@NotNull Long> memberIds;

        @AssertTrue(message = "memberIds must not contain duplicates")
        public boolean isMemberIdsUnique() {
            return memberIds != null && new HashSet<>(memberIds).size() == memberIds.size();
        }
    }

    @Data
    public static class AutoConfigSaveReqVO {
        private Long ruleId;
        @NotNull
        private Boolean recycleEnabled;
        @NotNull
        @Min(1)
        @jakarta.validation.constraints.Max(90)
        private Integer recycleAfterDays;
        @NotNull
        @Min(0)
        private Integer expectedVersion;
    }

    @Data
    public static class AutoConfigRespVO {
        private Long ruleId;
        private int version;
        private boolean recycleEnabled;
        private int recycleAfterDays;
    }

    @Data
    public static class RulePreviewReqVO {
        @NotNull
        private Long ruleId;
        @NotNull
        @Min(1)
        private Integer expectedVersion;
        @NotEmpty
        @Size(max = 100)
        private List<@NotNull Long> leadIds;

        @AssertTrue(message = "leadIds must not contain duplicates")
        public boolean isLeadIdsUnique() {
            return leadIds != null && new HashSet<>(leadIds).size() == leadIds.size();
        }
    }

    @Data
    public static class RuleApplyReqVO extends RulePreviewReqVO {
        @NotBlank
        @Size(max = 200)
        private String reason;
    }

    @Data
    public static class RuleRespVO {
        private Long id;
        private String ruleName;
        private boolean enabled;
        private int cursorIndex;
        private int version;
        private List<Long> memberIds;
        private List<String> memberNames;
        private LocalDateTime updateTime;
    }

    @Data
    public static class RulePreviewRowVO {
        private Long leadId;
        private Long toUserId;
        private String toUserName;
    }

    @Data
    public static class RuleApplyResultRespVO {
        private Long leadId;
        private Long toUserId;
        private boolean success;
        private String outcome;
    }

    @Data
    public static class RuleApplyRespVO {
        private List<RuleApplyResultRespVO> results;
        private int succeeded;
        private int failed;
    }
}
