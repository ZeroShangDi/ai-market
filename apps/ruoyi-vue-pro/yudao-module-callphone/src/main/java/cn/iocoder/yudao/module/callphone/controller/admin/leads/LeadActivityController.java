package cn.iocoder.yudao.module.callphone.controller.admin.leads;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadActivityPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadActivityRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadActivitySaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadActivityDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadActivityMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Objects;
import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 线索跟进")
@RestController
@RequestMapping("/callphone/lead/activity")
@Validated
public class LeadActivityController {
    @Resource private LeadActivityMapper activityMapper;
    @Resource private LeadMapper leadMapper;
    @Resource private PiiCryptoService piiCryptoService;

    @GetMapping("/page")
    @Operation(summary = "本人线索跟进记录分页")
    @PreAuthorize("@ss.hasPermission('callphone:lead:follow')")
    public CommonResult<PageResult<LeadActivityRespVO>> page(@Valid LeadActivityPageReqVO reqVO) {
        PageResult<LeadActivityDO> page = activityMapper.selectPage(reqVO.getLeadId(), getLoginUserId(), reqVO);
        List<LeadActivityRespVO> rows = page.getList().stream().map(row -> {
            LeadActivityRespVO resp = new LeadActivityRespVO(); resp.setId(row.getId()); resp.setLeadId(row.getLeadId());
            resp.setActivityType(row.getActivityType()); resp.setOutcomeCode(row.getOutcomeCode());
            resp.setNote(piiCryptoService.decrypt(row.getNoteCiphertext())); resp.setNextFollowUpAt(row.getNextFollowUpAt());
            resp.setCallRecordId(row.getCallRecordId()); resp.setCreateTime(row.getCreateTime()); return resp;
        }).toList();
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @PostMapping("/save")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "记录线索跟进情况")
    @PreAuthorize("@ss.hasPermission('callphone:lead:follow')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Long> save(@RequestBody @Valid LeadActivitySaveReqVO reqVO) {
        LeadDO lead = leadMapper.selectById(reqVO.getLeadId());
        if (lead == null || !"claimed".equals(lead.getStatus()) || !Objects.equals(lead.getOwnerUserId(), getLoginUserId())) {
            return success(null);
        }
        int touched = leadMapper.update(null, new LambdaUpdateWrapper<LeadDO>()
                .set(LeadDO::getUpdateTime, java.time.LocalDateTime.now())
                .eq(LeadDO::getId, lead.getId())
                .eq(LeadDO::getOwnerUserId, getLoginUserId())
                .eq(LeadDO::getStatus, "claimed"));
        if (touched != 1) return success(null);
        LeadActivityDO activity = new LeadActivityDO(); activity.setId(IdUtil.getSnowflake().nextId());
        activity.setLeadId(lead.getId()); activity.setOwnerUserId(getLoginUserId()); activity.setActorUserId(getLoginUserId());
        activity.setActivityType(reqVO.getActivityType()); activity.setOutcomeCode(reqVO.getOutcomeCode());
        activity.setNoteCiphertext(piiCryptoService.encrypt(reqVO.getNote().trim()));
        activity.setNextFollowUpAt(reqVO.getNextFollowUpAt()); activityMapper.insert(activity);
        return success(activity.getId());
    }
}
