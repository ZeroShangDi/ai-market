package cn.iocoder.yudao.module.callphone.controller.admin.customer;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.FollowUpTaskPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.FollowUpTaskPageRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.FollowUpTaskRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.FollowUpTaskSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.FollowUpTaskDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.FollowUpTaskEventDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.FollowUpTaskMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.FollowUpTaskEventMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.Map;
import java.util.stream.Collectors;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 跟进事项")
@RestController
@RequestMapping("/callphone/follow-up-task")
@Validated
public class FollowUpTaskController {
    @Resource private FollowUpTaskMapper taskMapper;
    @Resource private FollowUpTaskEventMapper eventMapper;
    @Resource private CustomerMapper customerMapper;
    @Resource private CallRecordMapper callRecordMapper;
    @Resource private PiiCryptoService piiCryptoService;

    @GetMapping("/page")
    @Operation(summary = "数据范围内跟进事项分页")
    @PreAuthorize("@ss.hasPermission('callphone:followup:list')")
    public CommonResult<FollowUpTaskPageRespVO> page(@Valid FollowUpTaskPageReqVO reqVO) {
        Long userId = getLoginUserId();
        PageResult<FollowUpTaskDO> page = taskMapper.selectPage(reqVO);
        Set<Long> customerIds = page.getList().stream().map(FollowUpTaskDO::getCustomerId).collect(Collectors.toSet());
        Map<Long, CustomerDO> customers = customerIds.isEmpty() ? Map.of() : customerMapper.selectBatchIds(customerIds)
                .stream().collect(Collectors.toMap(CustomerDO::getId, customer -> customer));
        List<FollowUpTaskRespVO> rows = page.getList().stream().map(task -> {
            FollowUpTaskRespVO vo = new FollowUpTaskRespVO();
            vo.setId(task.getId()); vo.setCustomerId(task.getCustomerId()); vo.setOwnerUserId(task.getOwnerUserId());
            vo.setTitle(piiCryptoService.decrypt(task.getTitleCiphertext())); vo.setContent(piiCryptoService.decrypt(task.getContentCiphertext()));
            vo.setDueAt(task.getDueAt()); vo.setStatus(resolveStatus(task)); vo.setSourceCallRecordId(task.getSourceCallRecordId());
            vo.setCompletedAt(task.getCompletedAt());
            CustomerDO customer = customers.get(task.getCustomerId());
            if (customer != null) { vo.setCustomerName(piiCryptoService.decrypt(customer.getNameCiphertext())); vo.setPhoneDisplay(customer.getPhoneDisplay()); }
            return vo;
        }).toList();
        FollowUpTaskPageRespVO resp = new FollowUpTaskPageRespVO();
        resp.setList(rows); resp.setTotal(page.getTotal());
        resp.setPendingCount(taskMapper.countByStatus("pending") - taskMapper.countOverdue());
        resp.setOverdueCount(taskMapper.countOverdue());
        resp.setCompletedCount(taskMapper.countByStatus("completed"));
        resp.setCancelledCount(taskMapper.countByStatus("cancelled"));
        return success(resp);
    }

    @PostMapping("/save")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "新建或修改跟进事项")
    @PreAuthorize("@ss.hasPermission('callphone:followup:save')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Long> save(@RequestBody @Valid FollowUpTaskSaveReqVO reqVO) {
        CustomerDO customer = customerMapper.selectById(reqVO.getCustomerId());
        if (customer == null || !"active".equals(customer.getStatus())) {
            throw exception(cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CUSTOMER_NOT_CALLABLE);
        }
        if (reqVO.getSourceCallRecordId() != null) {
            CallRecordDO callRecord = callRecordMapper.selectById(reqVO.getSourceCallRecordId());
            if (callRecord == null || !Objects.equals(callRecord.getCustomerId(), customer.getId())) {
                throw exception(cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CUSTOMER_NOT_CALLABLE);
            }
        }
        FollowUpTaskDO task = reqVO.getId() == null ? new FollowUpTaskDO() : taskMapper.selectById(reqVO.getId());
        if (task == null) {
            return success(null);
        }
        task.setCustomerId(customer.getId()); task.setTitleCiphertext(piiCryptoService.encrypt(reqVO.getTitle().trim()));
        task.setContentCiphertext(piiCryptoService.encrypt(reqVO.getContent())); task.setDueAt(reqVO.getDueAt());
        task.setSourceCallRecordId(reqVO.getSourceCallRecordId());
        if (reqVO.getId() == null) {
            task.setId(IdUtil.getSnowflake().nextId()); task.setOwnerUserId(getLoginUserId()); task.setStatus("pending");
            taskMapper.insert(task);
        } else {
            if (!"pending".equals(task.getStatus())) return success(null);
            int updated = taskMapper.update(null, new LambdaUpdateWrapper<FollowUpTaskDO>()
                    .eq(FollowUpTaskDO::getId, task.getId())
                    .eq(FollowUpTaskDO::getOwnerUserId, task.getOwnerUserId())
                    .eq(FollowUpTaskDO::getStatus, "pending")
                    .set(FollowUpTaskDO::getCustomerId, task.getCustomerId())
                    .set(FollowUpTaskDO::getTitleCiphertext, task.getTitleCiphertext())
                    .set(FollowUpTaskDO::getContentCiphertext, task.getContentCiphertext())
                    .set(FollowUpTaskDO::getDueAt, task.getDueAt())
                    .set(FollowUpTaskDO::getSourceCallRecordId, task.getSourceCallRecordId()));
            if (updated != 1) return success(null);
        }
        return success(task.getId());
    }

    @PostMapping("/complete")
    @Operation(summary = "完成跟进事项")
    @PreAuthorize("@ss.hasPermission('callphone:followup:complete')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Boolean> complete(@RequestParam("id") Long id) {
        FollowUpTaskDO task = taskMapper.selectById(id);
        if (task == null) return success(false);
        if ("completed".equals(task.getStatus())) return success(true);
        if (!"pending".equals(task.getStatus())) return success(false);
        LocalDateTime completedAt = LocalDateTime.now(ZoneOffset.UTC);
        int updated = taskMapper.update(null, new LambdaUpdateWrapper<FollowUpTaskDO>()
                .eq(FollowUpTaskDO::getId, id)
                .eq(FollowUpTaskDO::getOwnerUserId, task.getOwnerUserId())
                .eq(FollowUpTaskDO::getStatus, "pending")
                .set(FollowUpTaskDO::getStatus, "completed")
                .set(FollowUpTaskDO::getCompletedAt, completedAt));
        if (updated != 1) return success(false);
        FollowUpTaskEventDO event = new FollowUpTaskEventDO();
        event.setId(IdUtil.getSnowflake().nextId()); event.setTaskId(id); event.setActorUserId(getLoginUserId());
        event.setEventType("completed"); event.setFromStatus("pending"); event.setToStatus("completed");
        eventMapper.insert(event);
        return success(true);
    }

    @PostMapping("/cancel")
    @Operation(summary = "取消跟进事项")
    @PreAuthorize("@ss.hasPermission('callphone:followup:cancel')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Boolean> cancel(@RequestParam("id") Long id) {
        Long userId = getLoginUserId();
        FollowUpTaskDO task = taskMapper.selectById(id);
        if (task == null || !"pending".equals(task.getStatus())) return success(false);
        int changed = taskMapper.update(null, new LambdaUpdateWrapper<FollowUpTaskDO>()
                .eq(FollowUpTaskDO::getId, id)
                .eq(FollowUpTaskDO::getOwnerUserId, task.getOwnerUserId())
                .eq(FollowUpTaskDO::getStatus, "pending")
                .set(FollowUpTaskDO::getStatus, "cancelled"));
        if (changed == 0) return success(false);
        FollowUpTaskEventDO event = new FollowUpTaskEventDO();
        event.setId(IdUtil.getSnowflake().nextId()); event.setTaskId(id); event.setActorUserId(userId);
        event.setEventType("cancelled"); event.setFromStatus("pending"); event.setToStatus("cancelled");
        eventMapper.insert(event);
        return success(true);
    }

    private String resolveStatus(FollowUpTaskDO task) {
        if ("pending".equals(task.getStatus()) && task.getDueAt() != null && task.getDueAt().isBefore(LocalDateTime.now())) return "overdue";
        return task.getStatus();
    }
}
