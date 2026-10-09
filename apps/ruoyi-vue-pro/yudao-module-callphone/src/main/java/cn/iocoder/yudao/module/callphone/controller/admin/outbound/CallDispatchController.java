package cn.iocoder.yudao.module.callphone.controller.admin.outbound;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchEventDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.PairedDeviceDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallDispatchMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallDispatchEventMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.PairedDeviceMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.callphone.service.outbound.CallDispatchWorkflowService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 外呼派发")
@RestController
@RequestMapping("/callphone")
@Validated
public class CallDispatchController {

    private static final int CUSTOMER_OPTION_SCAN_BATCH_SIZE = 200;
    private static final int CUSTOMER_OPTION_RESULT_LIMIT = 20;

    @Resource private CustomerMapper customerMapper;
    @Resource private LeadMapper leadMapper;
    @Resource private PairedDeviceMapper deviceMapper;
    @Resource private CallDispatchMapper dispatchMapper;
    @Resource private CallRecordMapper callRecordMapper;
    @Resource private CallDispatchEventMapper dispatchEventMapper;
    @Resource private PiiCryptoService piiCryptoService;
    @Resource private CallDispatchWorkflowService callDispatchWorkflowService;

    @GetMapping("/customer/simple-list")
    @Operation(summary = "搜索本人可见客户供外呼选择")
    @PreAuthorize("@ss.hasPermission('callphone:customer:query')")
    public CommonResult<List<CustomerOptionRespVO>> getCustomerOptions(
            @RequestParam(value = "query", required = false) @Size(max = 128) String query) {
        Long userId = getLoginUserId();
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        List<CustomerOptionRespVO> result = new ArrayList<>(CUSTOMER_OPTION_RESULT_LIMIT);
        LocalDateTime cursorUpdateTime = null;
        Long cursorId = null;

        // Keep the decryption workload scoped to the caller and process it in small batches.
        // The previous fixed 100-row candidate window made older customers impossible to find.
        while (result.size() < CUSTOMER_OPTION_RESULT_LIMIT) {
            LambdaQueryWrapperX<CustomerDO> pageQuery = new LambdaQueryWrapperX<CustomerDO>()
                    .eq(CustomerDO::getOwnerUserId, userId)
                    .eq(CustomerDO::getStatus, "active")
                    .orderByDesc(CustomerDO::getUpdateTime)
                    .orderByDesc(CustomerDO::getId);
            if (cursorUpdateTime != null && cursorId != null) {
                LocalDateTime beforeUpdateTime = cursorUpdateTime;
                Long beforeId = cursorId;
                pageQuery.and(wrapper -> wrapper.lt(CustomerDO::getUpdateTime, beforeUpdateTime)
                        .or(tie -> tie.eq(CustomerDO::getUpdateTime, beforeUpdateTime)
                                .lt(CustomerDO::getId, beforeId)));
            }
            List<CustomerDO> candidates = customerMapper.selectList(pageQuery.last(
                    "LIMIT " + CUSTOMER_OPTION_SCAN_BATCH_SIZE));
            if (candidates.isEmpty()) break;

            for (CustomerDO customer : candidates) {
                String name = piiCryptoService.decrypt(customer.getNameCiphertext());
                String phone = piiCryptoService.decrypt(customer.getPhoneCiphertext());
                if (!needle.isEmpty() && !(name != null && name.toLowerCase(Locale.ROOT).contains(needle))
                        && !(phone != null && phone.endsWith(needle))) continue;
                CustomerOptionRespVO vo = new CustomerOptionRespVO();
                vo.setCustomerId(customer.getId());
                vo.setCustomerName(name);
                vo.setPhoneDisplay(customer.getPhoneDisplay());
                vo.setOwnerName("我");
                result.add(vo);
                if (result.size() == CUSTOMER_OPTION_RESULT_LIMIT) break;
            }

            CustomerDO last = candidates.get(candidates.size() - 1);
            cursorUpdateTime = last.getUpdateTime();
            cursorId = last.getId();
            if (candidates.size() < CUSTOMER_OPTION_SCAN_BATCH_SIZE) break;
        }
        return success(result);
    }

    @GetMapping("/device/paired-list")
    @Operation(summary = "获取本人有效配对设备")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    public CommonResult<List<PairedDeviceRespVO>> getPairedDevices() {
        LocalDateTime onlineAfter = LocalDateTime.now(ZoneOffset.UTC).minusMinutes(2);
        List<PairedDeviceRespVO> result = deviceMapper.selectList(new LambdaQueryWrapperX<PairedDeviceDO>()
                        .eq(PairedDeviceDO::getOwnerUserId, getLoginUserId())
                        .eq(PairedDeviceDO::getStatus, "paired").orderByDesc(PairedDeviceDO::getLastSeenAt))
                .stream().map(device -> {
                    PairedDeviceRespVO vo = BeanUtils.toBean(device, PairedDeviceRespVO.class);
                    vo.setStatus(device.getLastSeenAt() != null && device.getLastSeenAt().isAfter(onlineAfter) ? "online" : "offline");
                    return vo;
                }).toList();
        return success(result);
    }

    @PostMapping("/call-dispatch/create")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "创建手机外呼派发")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<CallDispatchRespVO> create(@RequestHeader("Idempotency-Key") @NotBlank @Size(max = 80) String idempotencyKey,
                                                   @RequestBody @Valid CallDispatchCreateReqVO reqVO) {
        Long userId = getLoginUserId();
        if ((reqVO.getCustomerId() == null) == (reqVO.getLeadId() == null)) {
            throw exception(ErrorCodeConstants.CALL_TARGET_NOT_CALLABLE);
        }
        if (!isSourceCompatibleWithTarget(reqVO)) {
            throw exception(ErrorCodeConstants.CALL_TARGET_NOT_CALLABLE);
        }
        // Resolve retries before checking mutable target state. A queued dispatch remains
        // the result of the original command even if its customer/lead was later archived.
        CallDispatchDO prior = findPriorDispatch(userId, idempotencyKey, false);
        if (prior != null) {
            if (!sameDispatchRequest(prior, reqVO)) {
                throw exception(ErrorCodeConstants.IDEMPOTENCY_CONFLICT);
            }
            PairedDeviceDO priorDevice = deviceMapper.selectById(prior.getDeviceId());
            return success(toResp(prior, priorDevice == null ? null : priorDevice.getDisplayName()));
        }

        CustomerDO customer = reqVO.getCustomerId() == null ? null : customerMapper.selectById(reqVO.getCustomerId());
        LeadDO lead = reqVO.getLeadId() == null ? null : leadMapper.selectById(reqVO.getLeadId());
        if (customer != null && (!Objects.equals(customer.getOwnerUserId(), userId)
                || !"active".equals(customer.getStatus()))) {
            throw exception(ErrorCodeConstants.CALL_TARGET_NOT_CALLABLE);
        }
        if (lead != null && (!Objects.equals(lead.getOwnerUserId(), userId)
                || !"claimed".equals(lead.getStatus()))) {
            throw exception(ErrorCodeConstants.CALL_TARGET_NOT_CALLABLE);
        }
        if ((reqVO.getCustomerId() != null && customer == null) || (reqVO.getLeadId() != null && lead == null)) {
            throw exception(ErrorCodeConstants.CALL_TARGET_NOT_CALLABLE);
        }
        PairedDeviceDO device = deviceMapper.selectById(reqVO.getDeviceId());
        if (device == null || !Objects.equals(device.getOwnerUserId(), userId) || !"paired".equals(device.getStatus())
                || device.getLastSeenAt() == null || device.getLastSeenAt().isBefore(LocalDateTime.now(ZoneOffset.UTC).minusMinutes(2))) {
            throw exception(ErrorCodeConstants.DEVICE_NOT_ONLINE);
        }

        CallDispatchDO dispatch = new CallDispatchDO();
        dispatch.setId(IdUtil.getSnowflake().nextId());
        dispatch.setCustomerId(customer == null ? null : customer.getId());
        dispatch.setLeadId(lead == null ? null : lead.getId());
        dispatch.setDeviceId(device.getId()); dispatch.setRequestedBy(userId);
        dispatch.setPhoneCiphertext(customer != null ? customer.getPhoneCiphertext() : lead.getPhoneCiphertext());
        dispatch.setPhoneDisplay(customer != null ? customer.getPhoneDisplay() : lead.getPhoneDisplay());
        dispatch.setStatus("queued"); dispatch.setSource(reqVO.getSource());
        dispatch.setScriptCode(reqVO.getScriptCode()); dispatch.setFollowUpStatus(reqVO.getFollowUpStatus());
        dispatch.setRequestNote(reqVO.getRequestNote()); dispatch.setNextFollowUpAt(reqVO.getNextFollowUpAt());
        dispatch.setIdempotencyKey(idempotencyKey);
        dispatch.setExpiresAt(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(5));
        try {
            dispatchMapper.insert(dispatch);
        } catch (DuplicateKeyException concurrentRequest) {
            // The unique tenant/requester/key index arbitrates two simultaneous first attempts.
            // Use a locking current read so MySQL REPEATABLE READ sees the winner's committed row.
            CallDispatchDO concurrent = findPriorDispatch(userId, idempotencyKey, true);
            if (concurrent == null) throw concurrentRequest;
            if (!sameDispatchRequest(concurrent, reqVO)) {
                throw exception(ErrorCodeConstants.IDEMPOTENCY_CONFLICT);
            }
            PairedDeviceDO concurrentDevice = deviceMapper.selectById(concurrent.getDeviceId());
            return success(toResp(concurrent,
                    concurrentDevice == null ? null : concurrentDevice.getDisplayName()));
        }
        appendEvent(dispatch.getId(), "created", null, "queued", "admin", userId, device.getId(), null);
        return success(toResp(dispatch, device.getDisplayName()));
    }

    private CallDispatchDO findPriorDispatch(Long userId, String idempotencyKey, boolean lockForUpdate) {
        LambdaQueryWrapperX<CallDispatchDO> query = new LambdaQueryWrapperX<CallDispatchDO>()
                .eq(CallDispatchDO::getRequestedBy, userId)
                .eq(CallDispatchDO::getIdempotencyKey, idempotencyKey);
        if (lockForUpdate) query.last("FOR UPDATE");
        return dispatchMapper.selectOne(query);
    }

    static boolean sameDispatchRequest(CallDispatchDO prior, CallDispatchCreateReqVO reqVO) {
        return Objects.equals(prior.getCustomerId(), reqVO.getCustomerId())
                && Objects.equals(prior.getLeadId(), reqVO.getLeadId())
                && Objects.equals(prior.getDeviceId(), reqVO.getDeviceId())
                && Objects.equals(prior.getSource(), reqVO.getSource())
                && Objects.equals(prior.getScriptCode(), reqVO.getScriptCode())
                && Objects.equals(prior.getFollowUpStatus(), reqVO.getFollowUpStatus())
                && Objects.equals(prior.getRequestNote(), reqVO.getRequestNote())
                && Objects.equals(prior.getNextFollowUpAt(), reqVO.getNextFollowUpAt());
    }

    static boolean isSourceCompatibleWithTarget(CallDispatchCreateReqVO reqVO) {
        return reqVO.getLeadId() != null
                ? "lead_followup".equals(reqVO.getSource())
                : "customer_detail".equals(reqVO.getSource()) || "customer_list".equals(reqVO.getSource());
    }

    @GetMapping("/call-dispatch/get")
    @Operation(summary = "获取本人外呼派发状态")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<CallDispatchRespVO> get(@RequestParam("id") Long id) {
        CallDispatchDO dispatch = dispatchMapper.selectById(id);
        if (dispatch == null || !Objects.equals(dispatch.getRequestedBy(), getLoginUserId())) return success(null);
        if ("queued".equals(dispatch.getStatus())) {
            callDispatchWorkflowService.expireIfDue(dispatch.getId(), getLoginUserId(), null,
                    LocalDateTime.now(ZoneOffset.UTC));
        }
        PairedDeviceDO device = deviceMapper.selectById(dispatch.getDeviceId());
        CallDispatchDO current = dispatchMapper.selectById(id);
        CallDispatchDO latest = current == null ? dispatch : current;
        CallDispatchRespVO resp = toResp(latest, device == null ? null : device.getDisplayName());
        if (latest.getCallRecordId() != null) {
            var record = callRecordMapper.selectById(latest.getCallRecordId());
            resp.setCallRecordId(latest.getCallRecordId());
            if (record != null) {
                // Compatibility for rows written by older builds that stored call completion
                // as a dispatch status. Keep the public dispatch lifecycle canonical.
                if ("completed".equals(latest.getStatus())) resp.setStatus("accepted");
                resp.setCallStage(switch (record.getStatus()) {
                    case "ended" -> "completed";
                    case "dialing", "connected" -> "dialing";
                    default -> "waiting";
                });
            }
        }
        return success(resp);
    }

    @PostMapping("/call-dispatch/cancel")
    @Operation(summary = "撤回尚未接受的外呼派发")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Boolean> cancel(@RequestBody @Valid CallDispatchCancelReqVO reqVO) {
        Long userId = getLoginUserId();
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        return success(callDispatchWorkflowService.cancel(reqVO.getId(), userId, now));
    }

    private CallDispatchRespVO toResp(CallDispatchDO dispatch, String deviceName) {
        CallDispatchRespVO vo = BeanUtils.toBean(dispatch, CallDispatchRespVO.class);
        vo.setDeviceName(deviceName);
        vo.setEvents(dispatchEventMapper.selectByDispatchId(dispatch.getId()).stream()
                // Earlier builds mislabeled a call completion as a dispatch state transition.
                // The call-record event API remains the source for that historical call event.
                .filter(event -> !"completed".equals(event.getEventType()))
                .map(event -> BeanUtils.toBean(event, CallDispatchEventRespVO.class)).toList());
        return vo;
    }

    private void appendEvent(Long dispatchId, String eventType, String fromStatus, String toStatus,
                             String actorType, Long actorId, Long deviceId, String reasonCode) {
        CallDispatchEventDO event = new CallDispatchEventDO();
        event.setId(IdUtil.getSnowflake().nextId()); event.setDispatchId(dispatchId); event.setEventType(eventType);
        event.setFromStatus(fromStatus); event.setToStatus(toStatus); event.setActorType(actorType);
        event.setActorId(actorId); event.setDeviceId(deviceId); event.setReasonCode(reasonCode);
        event.setOccurredAt(LocalDateTime.now(ZoneOffset.UTC));
        dispatchEventMapper.insert(event);
    }

    @Data public static class CallDispatchCreateReqVO {
        private Long customerId;
        private Long leadId;
        @NotNull private Long deviceId;
        @NotBlank @Pattern(regexp = "customer_detail|customer_list|lead_followup") private String source;
        @Size(max = 64) private String scriptCode;
        @Size(max = 32) private String followUpStatus;
        @Size(max = 200) private String requestNote;
        private LocalDateTime nextFollowUpAt;
    }
    @Data public static class CallDispatchCancelReqVO { @NotNull private Long id; }
    @Data public static class CallDispatchRespVO {
        private Long id; private String status; private LocalDateTime expiresAt; private String deviceName;
        private Long customerId; private Long leadId; private Long callRecordId; private String callStage;
        private List<CallDispatchEventRespVO> events;
    }
    @Data public static class CallDispatchEventRespVO {
        private Long id; private String eventType; private String fromStatus; private String toStatus;
        private String actorType; private String reasonCode; private LocalDateTime occurredAt;
    }
    @Data public static class CustomerOptionRespVO {
        private Long customerId; private String customerName; private String phoneDisplay; private String ownerName;
    }
    @Data public static class PairedDeviceRespVO {
        private Long id; private String displayName; private String platform; private String status; private LocalDateTime lastSeenAt;
    }
}
