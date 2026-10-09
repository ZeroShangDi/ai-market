package cn.iocoder.yudao.module.callphone.controller.admin.ai;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiUsageFeedbackReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiUsagePageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiUsageRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.AiFeedbackDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.AiRunDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.ai.AiFeedbackMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.ai.AiRunMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertSet;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone AI 使用记录")
@RestController
@RequestMapping("/callphone/ai-usage")
@Validated
public class AiUsageController {

    @Resource private AiRunMapper aiRunMapper;
    @Resource private AiFeedbackMapper aiFeedbackMapper;
    @Resource private AdminUserApi adminUserApi;
    @Resource private PiiCryptoService piiCryptoService;

    @GetMapping("/page")
    @Operation(summary = "AI 使用记录分页（仅元数据）")
    @PreAuthorize("@ss.hasPermission('callphone:ai:usage:list')")
    public CommonResult<PageResult<AiUsageRespVO>> getPage(@Valid AiUsagePageReqVO reqVO) {
        PageResult<AiRunDO> page = aiRunMapper.selectPage(reqVO);
        List<AiUsageRespVO> records = BeanUtils.toBean(page.getList(), AiUsageRespVO.class);
        Map<Long, AdminUserRespDTO> users = adminUserApi.getUserMap(convertSet(page.getList(), AiRunDO::getActorUserId));
        List<Long> runIds = convertSet(page.getList(), AiRunDO::getId).stream().toList();
        Map<Long, AiFeedbackDO> feedbackByRun = runIds.isEmpty() ? Map.of() : aiFeedbackMapper.selectList(
                        new LambdaQueryWrapperX<AiFeedbackDO>().in(AiFeedbackDO::getAiRunId, runIds))
                .stream().collect(java.util.stream.Collectors.toMap(AiFeedbackDO::getAiRunId, row -> row, (left, right) -> left));
        for (int i = 0; i < records.size(); i++) {
            AiUsageRespVO record = records.get(i);
            record.setCreatedAt(page.getList().get(i).getCreateTime());
            AdminUserRespDTO actor = users.get(record.getActorUserId());
            if (actor != null) record.setActorName(actor.getNickname());
            AiFeedbackDO feedback = feedbackByRun.get(record.getId());
            if (feedback != null) { record.setFeedbackRating(feedback.getRating()); record.setFeedbackReason(feedback.getReasonCode()); }
        }
        return success(new PageResult<>(records, page.getTotal()));
    }

    @GetMapping("/get")
    @Operation(summary = "AI 使用记录详情（不含提示词和模型原文）")
    @PreAuthorize("@ss.hasPermission('callphone:ai:usage:list')")
    public CommonResult<AiUsageRespVO> get(@RequestParam("id") Long id) {
        AiRunDO run = aiRunMapper.selectById(id);
        if (run == null) return success(null);
        AiUsageRespVO respVO = BeanUtils.toBean(run, AiUsageRespVO.class);
        respVO.setCreatedAt(run.getCreateTime());
        AdminUserRespDTO actor = adminUserApi.getUser(run.getActorUserId());
        if (actor != null) respVO.setActorName(actor.getNickname());
        AiFeedbackDO feedback = aiFeedbackMapper.selectOne(new LambdaQueryWrapperX<AiFeedbackDO>().eq(AiFeedbackDO::getAiRunId, id));
        if (feedback != null) { respVO.setFeedbackRating(feedback.getRating()); respVO.setFeedbackReason(feedback.getReasonCode()); }
        return success(respVO);
    }

    @PostMapping("/feedback")
    @Operation(summary = "提交 AI 使用反馈")
    @PreAuthorize("@ss.hasPermission('callphone:ai:usage:list')")
    public CommonResult<Boolean> feedback(@RequestParam("id") Long id, @Valid @RequestBody AiUsageFeedbackReqVO reqVO) {
        AiRunDO run = aiRunMapper.selectById(id);
        if (run == null || !Objects.equals(run.getActorUserId(), getLoginUserId())) return success(false);
        AiFeedbackDO row = aiFeedbackMapper.selectOne(new LambdaQueryWrapperX<AiFeedbackDO>().eq(AiFeedbackDO::getAiRunId, id));
        if (row == null) {
            row = new AiFeedbackDO(); row.setAiRunId(id); row.setActorUserId(getLoginUserId());
        }
        row.setRating(reqVO.getRating()); row.setReasonCode(reqVO.getReasonCode());
        row.setCommentCiphertext(piiCryptoService.encrypt(reqVO.getComment())); row.setSubmittedAt(LocalDateTime.now());
        if (row.getId() == null) aiFeedbackMapper.insert(row); else aiFeedbackMapper.updateById(row);
        return success(true);
    }
}
