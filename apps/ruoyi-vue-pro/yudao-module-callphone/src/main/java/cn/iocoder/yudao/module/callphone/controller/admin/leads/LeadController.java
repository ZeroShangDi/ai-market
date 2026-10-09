package cn.iocoder.yudao.module.callphone.controller.admin.leads;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadAssignmentPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadAssignmentHistoryPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadAssignmentHistoryRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadSaveReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadConversionPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadConversionRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadArchivePageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadArchiveRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadBatchAssignResultVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadAssignmentDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadConversionDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadArchiveEventDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadConversionMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadArchiveEventMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.callphone.service.leads.LeadAssignmentService;
import cn.iocoder.yudao.module.callphone.service.leads.LeadBatchAssignmentResult;
import cn.iocoder.yudao.module.callphone.service.leads.LeadLifecycleService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.HashSet;
import java.time.LocalDateTime;
import java.util.stream.Collectors;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 线索池")
@RestController
@RequestMapping("/callphone/lead")
@Validated
public class LeadController {
    @Resource private LeadMapper leadMapper;
    @Resource private LeadConversionMapper leadConversionMapper;
    @Resource private LeadArchiveEventMapper leadArchiveEventMapper;
    @Resource private PiiCryptoService piiCryptoService;
    @Resource private AdminUserApi adminUserApi;
    @Resource private LeadAssignmentService leadAssignmentService;
    @Resource private LeadLifecycleService leadLifecycleService;

    @GetMapping("/page")
    @Operation(summary = "待领取及数据范围内线索分页")
    @PreAuthorize("@ss.hasPermission('callphone:lead:list')")
    public CommonResult<PageResult<LeadRespVO>> page(@Valid LeadPageReqVO reqVO) {
        PageResult<LeadDO> page = leadMapper.selectVisiblePage(reqVO);
        List<LeadRespVO> rows = page.getList().stream().map(this::toResp).toList();
        Set<Long> ownerIds = rows.stream().map(LeadRespVO::getOwnerUserId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, AdminUserRespDTO> owners = ownerIds.isEmpty() ? Map.of() : adminUserApi.getUserMap(ownerIds);
        rows.forEach(row -> {
            Long ownerUserId = row.getOwnerUserId();
            if (ownerUserId == null) return;
            AdminUserRespDTO owner = owners.get(ownerUserId);
            if (owner != null) row.setOwnerName(owner.getNickname());
        });
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @PostMapping("/save")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "新增线索到公共池")
    @PreAuthorize("@ss.hasPermission('callphone:lead:create')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Long> save(@RequestHeader("Idempotency-Key") @NotBlank @Size(max = 80) String idempotencyKey,
                                  @RequestBody @Valid LeadSaveReqVO reqVO) {
        LeadDO prior = leadMapper.selectOne(new LambdaQueryWrapperX<LeadDO>().eq(LeadDO::getIdempotencyKey, idempotencyKey));
        if (prior != null) return success(prior.getId());
        String phone = reqVO.getPhone().replaceAll("[ -]", "");
        LeadDO lead = new LeadDO();
        lead.setId(IdUtil.getSnowflake().nextId());
        lead.setNameCiphertext(piiCryptoService.encrypt(reqVO.getName().trim()));
        lead.setPhoneCiphertext(piiCryptoService.encrypt(phone));
        lead.setPhoneDisplay(maskPhone(phone));
        lead.setSourceCode(reqVO.getSourceCode()); lead.setScore(reqVO.getScore() == null ? 0 : reqVO.getScore());
        lead.setStatus("new"); lead.setIdempotencyKey(idempotencyKey);
        leadMapper.insert(lead);
        leadAssignmentService.autoAssignNewLead(lead.getId(), getLoginUserId());
        return success(lead.getId());
    }

    @PostMapping("/claim")
    @Operation(summary = "原子领取待分配线索")
    @PreAuthorize("@ss.hasPermission('callphone:lead:claim')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Boolean> claim(@RequestBody @Valid LeadClaimReqVO reqVO) {
        Long userId = getLoginUserId();
        LeadDO current = leadMapper.selectById(reqVO.getId());
        if (current == null) return success(false);
        if (Objects.equals(current.getOwnerUserId(), userId) && "claimed".equals(current.getStatus())) return success(true);
        if (!"new".equals(current.getStatus()) || current.getOwnerUserId() != null) return success(false);
        int updated = leadMapper.update(null, new LambdaUpdateWrapper<LeadDO>()
                .set(LeadDO::getOwnerUserId, userId).set(LeadDO::getStatus, "claimed")
                .set(LeadDO::getUpdateTime, LocalDateTime.now())
                .eq(LeadDO::getId, reqVO.getId()).eq(LeadDO::getStatus, "new").isNull(LeadDO::getOwnerUserId));
        if (updated == 1) leadAssignmentService.recordAssignment(current.getId(), null, userId, userId,
                "claim", "成员自行领取");
        return success(updated == 1);
    }

    @GetMapping("/assignment-page")
    @Operation(summary = "线索分配与回收分页")
    @PreAuthorize("@ss.hasPermission('callphone:lead:assign')")
    public CommonResult<PageResult<LeadRespVO>> assignmentPage(@Valid LeadAssignmentPageReqVO reqVO) {
        PageResult<LeadDO> page = leadMapper.selectAssignmentPage(reqVO);
        List<LeadRespVO> rows = page.getList().stream().map(this::toResp).toList();
        Set<Long> ownerIds = rows.stream().map(LeadRespVO::getOwnerUserId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, AdminUserRespDTO> owners = ownerIds.isEmpty() ? Map.of() : adminUserApi.getUserMap(ownerIds);
        rows.forEach(row -> {
            Long ownerUserId = row.getOwnerUserId();
            if (ownerUserId == null) return;
            AdminUserRespDTO owner = owners.get(ownerUserId);
            if (owner != null) row.setOwnerName(owner.getNickname());
        });
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @GetMapping("/assignment-history")
    @Operation(summary = "线索分配、改派与回收流转历史分页")
    @PreAuthorize("@ss.hasPermission('callphone:lead:assign')")
    public CommonResult<PageResult<LeadAssignmentHistoryRespVO>> assignmentHistory(
            @Valid LeadAssignmentHistoryPageReqVO reqVO) {
        PageResult<LeadAssignmentDO> page = leadAssignmentService.getHistory(reqVO);
        Set<Long> userIds = page.getList().stream()
                .flatMap(event -> java.util.stream.Stream.of(event.getFromUserId(), event.getToUserId(), event.getActorUserId()))
                .filter(Objects::nonNull).filter(id -> id != 0L).collect(Collectors.toSet());
        Map<Long, AdminUserRespDTO> users = userIds.isEmpty() ? Map.of() : adminUserApi.getUserMap(userIds);
        List<LeadAssignmentHistoryRespVO> rows = page.getList().stream().map(event -> {
            LeadAssignmentHistoryRespVO resp = new LeadAssignmentHistoryRespVO();
            resp.setId(event.getId());
            resp.setLeadId(event.getLeadId());
            resp.setFromUserId(event.getFromUserId());
            resp.setFromUserName(event.getFromUserId() == null ? "公共池" : memberName(event.getFromUserId(), users));
            resp.setToUserId(event.getToUserId());
            resp.setToUserName(event.getToUserId() == null ? "公共池" : memberName(event.getToUserId(), users));
            resp.setActorUserId(event.getActorUserId());
            resp.setActorName(Objects.equals(event.getActorUserId(), 0L)
                    ? "系统自动回收" : memberName(event.getActorUserId(), users));
            resp.setRuleId(event.getRuleId());
            resp.setAction(event.getAction());
            resp.setReason(event.getReason());
            resp.setOccurredAt(event.getCreateTime());
            return resp;
        }).toList();
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @PostMapping("/assign")
    @Operation(summary = "分配或改派线索")
    @PreAuthorize("@ss.hasPermission('callphone:lead:assign')")
    public CommonResult<Boolean> assign(@RequestBody @Valid LeadAssignReqVO reqVO) {
        return success(leadAssignmentService.assign(reqVO.getId(), reqVO.getToUserId(), getLoginUserId(),
                reqVO.getReason()));
    }

    @PostMapping("/assign-batch")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "批量分配或改派线索")
    @PreAuthorize("@ss.hasPermission('callphone:lead:assign')")
    public CommonResult<List<LeadBatchAssignResultVO>> assignBatch(@RequestBody @Valid LeadBatchAssignReqVO reqVO) {
        List<LeadBatchAssignmentResult> results = leadAssignmentService.assignBatch(reqVO.getLeadIds(),
                reqVO.getToUserId(), getLoginUserId(), reqVO.getReason());
        return success(results.stream().map(result -> {
            LeadBatchAssignResultVO resp = new LeadBatchAssignResultVO();
            resp.setId(result.id());
            resp.setSuccess(result.success());
            resp.setOutcome(result.outcome());
            return resp;
        }).toList());
    }

    @PostMapping("/assign-round-robin")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "按成员轮转分配线索")
    @PreAuthorize("@ss.hasPermission('callphone:lead:assign')")
    public CommonResult<List<LeadRoundRobinAssignResultVO>> assignRoundRobin(
            @RequestBody @Valid LeadRoundRobinAssignReqVO reqVO) {
        return success(leadAssignmentService.assignRoundRobin(reqVO.getLeadIds(), reqVO.getToUserIds(),
                getLoginUserId(), reqVO.getReason()).stream().map(result -> {
            LeadRoundRobinAssignResultVO resp = new LeadRoundRobinAssignResultVO();
            resp.setId(result.id());
            resp.setToUserId(result.toUserId());
            resp.setSuccess(result.success());
            resp.setOutcome(result.outcome());
            return resp;
        }).toList());
    }

    @PostMapping("/recycle")
    @Operation(summary = "回收本人或已分配线索至公共池")
    @PreAuthorize("@ss.hasPermission('callphone:lead:recycle')")
    public CommonResult<Boolean> recycle(@RequestBody @Valid LeadRecycleReqVO reqVO) {
        return success(leadAssignmentService.recycle(reqVO.getId(), getLoginUserId(), reqVO.getReason()));
    }

    @PostMapping("/convert")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "将本人已领取线索转为客户")
    @PreAuthorize("@ss.hasPermission('callphone:lead:convert')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Long> convert(@RequestHeader("Idempotency-Key") @NotBlank @Size(max = 80) String idempotencyKey,
                                      @RequestBody @Valid LeadConvertReqVO reqVO) {
        return success(leadLifecycleService.convert(reqVO.getId(), idempotencyKey, getLoginUserId(), reqVO.getNote()));
    }

    @GetMapping("/conversion-page")
    @Operation(summary = "线索转化记录分页")
    @PreAuthorize("@ss.hasPermission('callphone:lead:convert')")
    public CommonResult<PageResult<LeadConversionRespVO>> conversionPage(@Valid LeadConversionPageReqVO reqVO) {
        PageResult<LeadConversionDO> page = leadConversionMapper.selectPage(reqVO, getLoginUserId());
        List<LeadConversionRespVO> rows = page.getList().stream().map(row -> {
            LeadConversionRespVO resp = new LeadConversionRespVO();
            resp.setId(row.getId()); resp.setLeadId(row.getLeadId()); resp.setCustomerId(row.getCustomerId());
            resp.setLeadName(piiCryptoService.decrypt(row.getLeadNameCiphertext()));
            resp.setCustomerName(piiCryptoService.decrypt(row.getCustomerNameCiphertext())); resp.setPhoneDisplay(row.getPhoneDisplay());
            resp.setSourceCode(row.getSourceCode());
            resp.setConvertedBy(row.getConvertedBy()); resp.setNote(row.getNoteCiphertext() == null ? null : piiCryptoService.decrypt(row.getNoteCiphertext()));
            resp.setConvertedAt(row.getConvertedAt()); return resp;
        }).toList();
        Map<Long, AdminUserRespDTO> users = rows.isEmpty() ? Map.of() : adminUserApi.getUserMap(rows.stream().map(LeadConversionRespVO::getConvertedBy).collect(Collectors.toSet()));
        rows.forEach(row -> { AdminUserRespDTO user = users.get(row.getConvertedBy()); if (user != null) row.setConverterName(user.getNickname()); });
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @GetMapping("/archive-page")
    @Operation(summary = "本人线索归档记录分页")
    @PreAuthorize("@ss.hasPermission('callphone:lead:archive')")
    public CommonResult<PageResult<LeadArchiveRespVO>> archivePage(@Valid LeadArchivePageReqVO reqVO) {
        PageResult<LeadArchiveEventDO> page = leadArchiveEventMapper.selectPage(getLoginUserId(), reqVO.getArchiveType(), reqVO);
        List<LeadArchiveRespVO> rows = page.getList().stream().map(row -> {
            LeadArchiveRespVO resp = new LeadArchiveRespVO(); resp.setId(row.getId()); resp.setLeadId(row.getLeadId());
            resp.setLeadName(piiCryptoService.decrypt(row.getLeadNameCiphertext())); resp.setPhoneDisplay(row.getPhoneDisplay());
            resp.setArchiveType(row.getArchiveType()); resp.setReason(piiCryptoService.decrypt(row.getReasonCiphertext()));
            resp.setTargetLeadId(row.getTargetLeadId()); resp.setPreviousStatus(row.getPreviousStatus());
            resp.setArchivedAt(row.getArchivedAt()); resp.setRestoredAt(row.getRestoredAt()); return resp;
        }).toList();
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @PostMapping("/archive")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "将线索归档为无效或重复")
    @PreAuthorize("@ss.hasPermission('callphone:lead:archive')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Long> archive(@RequestHeader("Idempotency-Key") @NotBlank @Size(max = 80) String idempotencyKey,
                                      @RequestBody @Valid LeadArchiveReqVO reqVO) {
        return success(leadLifecycleService.archive(reqVO.getLeadId(), reqVO.getArchiveType(), reqVO.getTargetLeadId(),
                reqVO.getReason(), idempotencyKey, getLoginUserId()));
    }

    @PostMapping("/restore")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "恢复本人归档线索")
    @PreAuthorize("@ss.hasPermission('callphone:lead:restore')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Boolean> restore(@RequestBody @Valid LeadRestoreReqVO reqVO) {
        return success(leadLifecycleService.restore(reqVO.getId(), reqVO.getReason(), getLoginUserId()));
    }

    private LeadRespVO toResp(LeadDO lead) {
        LeadRespVO resp = new LeadRespVO();
        resp.setId(lead.getId()); resp.setName(piiCryptoService.decrypt(lead.getNameCiphertext()));
        resp.setPhoneDisplay(lead.getPhoneDisplay()); resp.setSourceCode(lead.getSourceCode());
        resp.setScore(lead.getScore()); resp.setOwnerUserId(lead.getOwnerUserId()); resp.setStatus(lead.getStatus());
        resp.setCreateTime(lead.getCreateTime()); resp.setUpdateTime(lead.getUpdateTime());
        return resp;
    }

    private String memberName(Long userId, Map<Long, AdminUserRespDTO> users) {
        AdminUserRespDTO user = userId == null ? null : users.get(userId);
        return user == null ? "成员已停用" : user.getNickname();
    }

    private String maskPhone(String phone) { return phone.length() > 7 ? phone.substring(0, 3) + " **** " + phone.substring(phone.length() - 4) : "****"; }

    @lombok.Data public static class LeadClaimReqVO { @jakarta.validation.constraints.NotNull private Long id; }
    @lombok.Data public static class LeadAssignReqVO {
        @jakarta.validation.constraints.NotNull private Long id;
        @jakarta.validation.constraints.NotNull private Long toUserId;
        @NotBlank @Size(max = 200) private String reason;
    }
    @lombok.Data public static class LeadBatchAssignReqVO {
        @jakarta.validation.constraints.NotEmpty @Size(max = 100)
        private List<@jakarta.validation.constraints.NotNull Long> leadIds;
        @jakarta.validation.constraints.NotNull private Long toUserId;
        @NotBlank @Size(max = 200) private String reason;

        @jakarta.validation.constraints.AssertTrue(message = "leadIds must not contain duplicates")
        public boolean isLeadIdsUnique() {
            return leadIds != null && new HashSet<>(leadIds).size() == leadIds.size();
        }
    }
    @lombok.Data public static class LeadRoundRobinAssignReqVO {
        @jakarta.validation.constraints.NotEmpty @Size(max = 100)
        private List<@jakarta.validation.constraints.NotNull Long> leadIds;
        @jakarta.validation.constraints.NotEmpty @Size(min = 2, max = 20)
        private List<@jakarta.validation.constraints.NotNull Long> toUserIds;
        @NotBlank @Size(max = 200) private String reason;

        @jakarta.validation.constraints.AssertTrue(message = "leadIds must not contain duplicates")
        public boolean isLeadIdsUnique() {
            return leadIds != null && new HashSet<>(leadIds).size() == leadIds.size();
        }

        @jakarta.validation.constraints.AssertTrue(message = "toUserIds must not contain duplicates")
        public boolean isToUserIdsUnique() {
            return toUserIds != null && new HashSet<>(toUserIds).size() == toUserIds.size();
        }
    }
    @lombok.Data public static class LeadRoundRobinAssignResultVO {
        private Long id;
        private Long toUserId;
        private boolean success;
        private String outcome;
    }
    @lombok.Data public static class LeadRecycleReqVO {
        @jakarta.validation.constraints.NotNull private Long id;
        @NotBlank @Size(max = 200) private String reason;
    }
    @lombok.Data public static class LeadConvertReqVO {
        @jakarta.validation.constraints.NotNull private Long id;
        @Size(max = 1000) private String note;
    }
    @lombok.Data public static class LeadArchiveReqVO {
        @jakarta.validation.constraints.NotNull private Long leadId;
        @NotBlank @jakarta.validation.constraints.Pattern(regexp = "invalid|duplicate|rejected|other") private String archiveType;
        @NotBlank @Size(max = 1000) private String reason;
        private Long targetLeadId;
    }
    @lombok.Data public static class LeadRestoreReqVO {
        @jakarta.validation.constraints.NotNull private Long id;
        @NotBlank @Size(max = 200) private String reason;
    }
}
