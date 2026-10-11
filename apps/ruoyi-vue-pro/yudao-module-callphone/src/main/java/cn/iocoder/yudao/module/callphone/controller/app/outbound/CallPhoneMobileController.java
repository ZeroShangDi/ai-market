package cn.iocoder.yudao.module.callphone.controller.app.outbound;

import cn.hutool.core.util.IdUtil;
import com.fasterxml.jackson.annotation.JsonAlias;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.web.core.util.WebFrameworkUtils;
import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadActivityDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.DesktopPairingCodeDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.MobileCallEventDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.PairedDeviceDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.FollowUpTaskDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallDispatchMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.DesktopPairingCodeMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadActivityMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.MobileCallEventMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.PairedDeviceMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.FollowUpTaskMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.callphone.service.outbound.CallDispatchAcceptance;
import cn.iocoder.yudao.module.callphone.service.outbound.CallDispatchWorkflowService;
import cn.iocoder.yudao.module.callphone.util.DeviceCredentialUtils;
import cn.iocoder.yudao.module.callphone.util.MobileCallEventFingerprint;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.security.MessageDigest;
import java.util.List;
import java.util.Objects;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "用户 App - Call Phone 外呼")
@RestController
@RequestMapping("/callphone/mobile")
@Validated
public class CallPhoneMobileController {

    @Resource private PairedDeviceMapper deviceMapper;
    @Resource private CallDispatchMapper dispatchMapper;
    @Resource private DesktopPairingCodeMapper pairingCodeMapper;
    @Resource private CustomerMapper customerMapper;
    @Resource private LeadMapper leadMapper;
    @Resource private LeadActivityMapper leadActivityMapper;
    @Resource private CallRecordMapper recordMapper;
    @Resource private MobileCallEventMapper eventMapper;
    @Resource private PiiCryptoService piiCryptoService;
    @Resource private FollowUpTaskMapper followUpTaskMapper;
    @Resource private AdminUserApi adminUserApi;
    @Resource private CallDispatchWorkflowService callDispatchWorkflowService;

    @PostMapping("/pairings/claim")
    @Operation(summary = "手机认领电脑生成的一次性配对码")
    @PreAuthorize("@ss.hasPermission('callphone:device:pair:manage')")
    @ApiAccessLog(requestEnable = false)
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<PairingClaimRespVO> claimPairing(@RequestBody @Valid PairingClaimReqVO reqVO) {
        requireAdminIdentity();
        adminUserApi.validateUser(getLoginUserId());
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        DesktopPairingCodeDO pairing = pairingCodeMapper.selectPendingByCodeHash(DeviceCredentialUtils.sha256(reqVO.getPairingCode()), now);
        if (pairing == null || !Objects.equals(pairing.getOwnerUserId(), getLoginUserId())
                || !"pending".equals(pairing.getStatus())) return success(null);
        String rawDeviceKey = DeviceCredentialUtils.createDeviceKey();
        PairedDeviceDO device = new PairedDeviceDO(); device.setId(IdUtil.getSnowflake().nextId());
        device.setOwnerUserId(getLoginUserId()); device.setDisplayName(reqVO.getDisplayName().trim());
        device.setPlatform(reqVO.getPlatform()); device.setStatus("paired"); device.setLastSeenAt(now);
        device.setDeviceKeyHash(DeviceCredentialUtils.sha256(rawDeviceKey));
        int updated = pairingCodeMapper.update(null, new LambdaUpdateWrapper<DesktopPairingCodeDO>()
                .set(DesktopPairingCodeDO::getStatus, "claimed").set(DesktopPairingCodeDO::getDeviceId, device.getId())
                .eq(DesktopPairingCodeDO::getId, pairing.getId()).eq(DesktopPairingCodeDO::getStatus, "pending")
                .gt(DesktopPairingCodeDO::getExpiresAt, now));
        if (updated != 1) return success(null);
        deviceMapper.insert(device);
        PairingClaimRespVO resp = new PairingClaimRespVO(); resp.setDeviceId(device.getId());
        resp.setDeviceKey(rawDeviceKey); resp.setDisplayName(device.getDisplayName()); return success(resp);
    }

    /** Create an authorized direct call from the legacy /api/v1/mobile contract. */
    @PostMapping("/calls/direct")
    @Operation(summary = "创建手机端客户直拨通话")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<AcceptDispatchRespVO> beginDirectCall(@RequestBody @Valid DirectCallReqVO reqVO,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        PairedDeviceDO device = requireDevice(reqVO.getDeviceId(), deviceKey);
        MobileCallEventDO prior = getExistingEvent(device.getId(), reqVO.getDeviceEventId(), "requested");
        if (prior != null && prior.getCallRecordId() != null) {
            CallRecordDO priorRecord = recordMapper.selectById(prior.getCallRecordId());
            if (priorRecord != null && Objects.equals(priorRecord.getCustomerId(), reqVO.getCustomerId())
                    && Objects.equals(priorRecord.getOwnerUserId(), getLoginUserId())) {
                AcceptDispatchRespVO response = new AcceptDispatchRespVO();
                response.setCallRecordId(priorRecord.getId());
                response.setPhoneNumber(piiCryptoService.decrypt(priorRecord.getPhoneCiphertext()));
                response.setStatus(priorRecord.getStatus());
                return success(response);
            }
            throw exception(ErrorCodeConstants.IDEMPOTENCY_CONFLICT);
        }
        CustomerDO customer = customerMapper.selectById(reqVO.getCustomerId());
        if (customer == null || !Objects.equals(customer.getOwnerUserId(), getLoginUserId())
                || !"active".equals(customer.getStatus()) || customer.getPhoneCiphertext() == null) {
            throw exception(ErrorCodeConstants.CALL_TARGET_NOT_CALLABLE);
        }
        CallRecordDO record = new CallRecordDO();
        record.setId(IdUtil.getSnowflake().nextId()); record.setCustomerId(customer.getId());
        record.setCustomerNameCiphertext(customer.getNameCiphertext()); record.setPhoneCiphertext(customer.getPhoneCiphertext());
        record.setPhoneDisplay(customer.getPhoneDisplay()); record.setDirection("outbound");
        record.setOwnerUserId(getLoginUserId()); record.setDeviceId(device.getId());
        record.setStatus("requested"); record.setDurationSeconds(0); record.setRecordingState("none");
        record.setSummaryState("unavailable"); record.setVersion(1);
        recordMapper.insert(record);
        saveEvent(device.getId(), reqVO.getDeviceEventId(), "requested", null, record.getId());
        AcceptDispatchRespVO response = new AcceptDispatchRespVO();
        response.setCallRecordId(record.getId()); response.setPhoneNumber(piiCryptoService.decrypt(record.getPhoneCiphertext()));
        response.setStatus(record.getStatus());
        return success(response);
    }

    @PostMapping("/devices/heartbeat")
    @Operation(summary = "刷新已配对手机在线状态")
    @PreAuthorize("@ss.hasPermission('callphone:device:pair:manage')")
    public CommonResult<Boolean> heartbeat(@RequestBody @Valid DeviceHeartbeatReqVO reqVO,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        PairedDeviceDO device = requireDevice(reqVO.getDeviceId(), deviceKey);
        int updated = deviceMapper.update(null, new LambdaUpdateWrapper<PairedDeviceDO>()
                .set(PairedDeviceDO::getLastSeenAt, LocalDateTime.now(ZoneOffset.UTC))
                .eq(PairedDeviceDO::getId, device.getId()).eq(PairedDeviceDO::getOwnerUserId, getLoginUserId())
                .eq(PairedDeviceDO::getStatus, "paired"));
        return success(updated == 1);
    }

    @GetMapping("/dispatches")
    @Operation(summary = "读取本人手机待处理派发")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<List<MobileDispatchRespVO>> getPendingDispatches(@RequestParam Long deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        PairedDeviceDO device = requireDevice(deviceId, deviceKey);
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        List<CallDispatchDO> expired = dispatchMapper.selectList(new LambdaQueryWrapperX<CallDispatchDO>()
                .eq(CallDispatchDO::getDeviceId, device.getId()).eq(CallDispatchDO::getStatus, "queued")
                .le(CallDispatchDO::getExpiresAt, now));
        expired.forEach(dispatch -> callDispatchWorkflowService.expireIfDue(dispatch.getId(),
                getLoginUserId(), device.getId(), now));
        List<CallDispatchDO> dispatches = dispatchMapper.selectList(new LambdaQueryWrapperX<CallDispatchDO>()
                .eq(CallDispatchDO::getDeviceId, device.getId()).eq(CallDispatchDO::getRequestedBy, getLoginUserId())
                .eq(CallDispatchDO::getStatus, "queued").gt(CallDispatchDO::getExpiresAt, now)
                .orderByAsc(CallDispatchDO::getCreateTime));
        return success(dispatches.stream().map(dispatch -> {
            CustomerDO customer = dispatch.getCustomerId() == null ? null : customerMapper.selectById(dispatch.getCustomerId());
            LeadDO lead = dispatch.getLeadId() == null ? null : leadMapper.selectById(dispatch.getLeadId());
            MobileDispatchRespVO vo = new MobileDispatchRespVO();
            vo.setId(dispatch.getId()); vo.setCustomerId(dispatch.getCustomerId());
            vo.setLeadId(dispatch.getLeadId());
            vo.setCustomerName(customer != null ? piiCryptoService.decrypt(customer.getNameCiphertext())
                    : lead != null ? piiCryptoService.decrypt(lead.getNameCiphertext()) : "联系人");
            vo.setPhoneDisplay(dispatch.getPhoneDisplay()); vo.setRequestNote(dispatch.getRequestNote());
            vo.setExpiresAt(dispatch.getExpiresAt()); vo.setDeviceId(dispatch.getDeviceId());
            return vo;
        }).toList());
    }

    @PostMapping("/call-dispatches/accept")
    @Operation(summary = "接受派发并授权读取待拨号码")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<AcceptDispatchRespVO> accept(@RequestBody @Valid DispatchActionReqVO reqVO,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        PairedDeviceDO device = requireDevice(reqVO.getDeviceId(), deviceKey);
        MobileCallEventDO priorEvent = getExistingEvent(device.getId(), reqVO.getDeviceEventId(), "accepted");
        if (priorEvent != null && priorEvent.getCallRecordId() != null) {
            CallRecordDO priorRecord = recordMapper.selectById(priorEvent.getCallRecordId());
            CallDispatchDO priorDispatch = dispatchMapper.selectById(reqVO.getDispatchId());
            if (priorRecord != null && priorDispatch != null && Objects.equals(priorEvent.getDispatchId(), reqVO.getDispatchId())
                    && Objects.equals(priorDispatch.getDeviceId(), device.getId())) {
                return success(toAcceptResp(priorRecord, priorDispatch));
            }
            throw exception(ErrorCodeConstants.DISPATCH_STATE_CONFLICT);
        }

        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        CallDispatchAcceptance accepted = callDispatchWorkflowService.accept(reqVO.getDispatchId(), device.getId(),
                getLoginUserId(), reqVO.getDeviceEventId(), now);
        return success(accepted == null ? null : toAcceptResp(accepted.callRecord(), accepted.dispatch()));
    }

    @PostMapping("/call-dispatches/decline")
    @Operation(summary = "拒绝手机派发")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Boolean> decline(@RequestBody @Valid DispatchDeclineReqVO reqVO,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        PairedDeviceDO device = requireDevice(reqVO.getDeviceId(), deviceKey);
        MobileCallEventDO prior = getExistingEvent(device.getId(), reqVO.getDeviceEventId(), "declined");
        if (prior != null) return success(Objects.equals(prior.getDispatchId(), reqVO.getDispatchId()));
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        return success(callDispatchWorkflowService.decline(reqVO.getDispatchId(), device.getId(),
                getLoginUserId(), reqVO.getDeviceEventId(), reqVO.getReasonCode(), now));
    }

    @PostMapping("/calls/started")
    @Operation(summary = "手机确认系统拨号已开始")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Boolean> started(@RequestBody @Valid CallStartedReqVO reqVO,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        PairedDeviceDO device = requireDevice(reqVO.getDeviceId(), deviceKey);
        MobileCallEventDO prior = getExistingEvent(device.getId(), reqVO.getDeviceEventId(), "started");
        if (prior != null) return success(Objects.equals(prior.getCallRecordId(), reqVO.getCallRecordId()));
        CallRecordDO record = recordMapper.selectById(reqVO.getCallRecordId());
        if (record == null || !Objects.equals(record.getDeviceId(), device.getId())
                || !Objects.equals(record.getOwnerUserId(), getLoginUserId())) return success(false);
        if ("dialing".equals(record.getStatus())) return success(true);
        if (!"requested".equals(record.getStatus())) return success(false);
        LocalDateTime startedAt = reqVO.getStartedAt().withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        if (startedAt.isAfter(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(2))) throw exception(ErrorCodeConstants.CALL_EVENT_INVALID);
        int updated = recordMapper.update(null, new LambdaUpdateWrapper<CallRecordDO>()
                .set(CallRecordDO::getStatus, "dialing").set(CallRecordDO::getStartedAt, startedAt)
                .set(CallRecordDO::getVersion, record.getVersion() + 1).eq(CallRecordDO::getId, record.getId())
                .eq(CallRecordDO::getDeviceId, device.getId()).eq(CallRecordDO::getStatus, "requested"));
        if (updated == 1) saveEvent(device.getId(), reqVO.getDeviceEventId(), "started", record.getCallDispatchId(), record.getId());
        return success(updated == 1);
    }

    @PostMapping("/calls/complete")
    @Operation(summary = "手机回填通话结果")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @ApiAccessLog(requestEnable = false)
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Boolean> complete(@RequestBody @Valid CompleteCallReqVO reqVO,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        PairedDeviceDO device = requireDevice(reqVO.getDeviceId(), deviceKey);
        String requestFingerprint = completionFingerprint(reqVO, deviceKey);
        MobileCallEventDO prior = getExistingEvent(device.getId(), reqVO.getDeviceEventId(), "completed");
        if (prior != null) {
            if (!Objects.equals(prior.getCallRecordId(), reqVO.getCallRecordId())) {
                throw exception(ErrorCodeConstants.IDEMPOTENCY_CONFLICT);
            }
            if (prior.getRequestFingerprint() != null) {
                if (!MessageDigest.isEqual(prior.getRequestFingerprint().getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                        requestFingerprint.getBytes(java.nio.charset.StandardCharsets.US_ASCII))) {
                    throw exception(ErrorCodeConstants.IDEMPOTENCY_CONFLICT);
                }
                return success(true);
            }
            CallRecordDO priorRecord = recordMapper.selectById(reqVO.getCallRecordId());
            if (!isSameCompletedRequest(priorRecord, reqVO)) {
                throw exception(ErrorCodeConstants.IDEMPOTENCY_CONFLICT);
            }
            return success(true);
        }
        CallRecordDO record = recordMapper.selectById(reqVO.getCallRecordId());
        if (record == null || !Objects.equals(record.getDeviceId(), device.getId())
                || !Objects.equals(record.getOwnerUserId(), getLoginUserId())) return success(false);
        if (!("requested".equals(record.getStatus()) || "dialing".equals(record.getStatus()) || "connected".equals(record.getStatus()))) {
            // A valid retry is handled above by its persisted device event. An ended call with no
            // matching event is a state conflict; result-code equality alone is not idempotency.
            return success(false);
        }
        CallDispatchDO linkedDispatch = record.getCallDispatchId() == null ? null
                : callDispatchWorkflowService.requireAcceptedDispatchForCompletion(
                        record.getCallDispatchId(), record.getId());
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime startedAt = reqVO.getStartedAt().withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDateTime endedAt = reqVO.getEndedAt().withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        if (startedAt.isAfter(endedAt) || endedAt.isAfter(now.plusMinutes(5))) {
            throw exception(ErrorCodeConstants.CALL_EVENT_INVALID);
        }
        if (record.getStartedAt() != null && Math.abs(Duration.between(record.getStartedAt(), startedAt).getSeconds()) > 120) {
            throw exception(ErrorCodeConstants.CALL_EVENT_INVALID);
        }
        long elapsed = Duration.between(startedAt, endedAt).getSeconds();
        int callDuration = validateCallDuration(elapsed, reqVO.getDurationSeconds());
        int updated = recordMapper.update(null, new LambdaUpdateWrapper<CallRecordDO>()
                .set(CallRecordDO::getStatus, "ended").set(CallRecordDO::getResultCode, reqVO.getResultCode())
                .set(CallRecordDO::getStartedAt, startedAt).set(CallRecordDO::getEndedAt, endedAt)
                .set(CallRecordDO::getDurationSeconds, callDuration)
                .set(CallRecordDO::getRecordingState, reqVO.isRecordingAvailable() ? "pending" : "none")
                .set(CallRecordDO::getNoteCiphertext, piiCryptoService.encrypt(reqVO.getNote()))
                .set(CallRecordDO::getVersion, record.getVersion() + 1).eq(CallRecordDO::getId, record.getId())
                .eq(CallRecordDO::getDeviceId, device.getId()).eq(CallRecordDO::getOwnerUserId, getLoginUserId())
                .in(CallRecordDO::getStatus, "requested", "dialing", "connected"));
        if (updated == 1) {
            saveEvent(device.getId(), reqVO.getDeviceEventId(), "completed", record.getCallDispatchId(), record.getId(), requestFingerprint);
            if (linkedDispatch != null) {
                CallDispatchDO dispatch = linkedDispatch;
                if (dispatch.getLeadId() != null) {
                    LeadActivityDO activity = new LeadActivityDO();
                    activity.setId(IdUtil.getSnowflake().nextId());
                    activity.setLeadId(dispatch.getLeadId());
                    activity.setOwnerUserId(record.getOwnerUserId());
                    activity.setActorUserId(record.getOwnerUserId());
                    activity.setActivityType("phone");
                    activity.setOutcomeCode(reqVO.getResultCode());
                    String note = reqVO.getNote() == null || reqVO.getNote().isBlank()
                            ? "手机外呼已结束，未填写备注。" : reqVO.getNote().trim();
                    activity.setNoteCiphertext(piiCryptoService.encrypt(note));
                    activity.setNextFollowUpAt(dispatch.getNextFollowUpAt());
                    activity.setCallRecordId(record.getId());
                    leadActivityMapper.insert(activity);
                    leadMapper.update(null, new LambdaUpdateWrapper<LeadDO>()
                            .set(LeadDO::getUpdateTime, LocalDateTime.now())
                            .eq(LeadDO::getId, dispatch.getLeadId())
                            .eq(LeadDO::getOwnerUserId, record.getOwnerUserId())
                            .eq(LeadDO::getStatus, "claimed"));
                } else if (dispatch.getCustomerId() != null && dispatch.getNextFollowUpAt() != null) {
                    if (!Objects.equals(dispatch.getCustomerId(), record.getCustomerId())) {
                        throw new IllegalStateException("派发客户与通话记录不一致");
                    }
                    followUpTaskMapper.insert(buildCustomerFollowUpTask(
                            IdUtil.getSnowflake().nextId(), record, dispatch, reqVO, piiCryptoService));
                }
            }
        }
        return success(updated == 1);
    }

    static FollowUpTaskDO buildCustomerFollowUpTask(Long id, CallRecordDO record,
                                                     CallDispatchDO dispatch, CompleteCallReqVO reqVO,
                                                     PiiCryptoService piiCryptoService) {
        StringBuilder content = new StringBuilder("由外呼结果自动创建。通话结果：")
                .append(reqVO.getResultCode());
        if (reqVO.getNote() != null && !reqVO.getNote().isBlank()) {
            content.append("\n通话备注：").append(reqVO.getNote().trim());
        }
        FollowUpTaskDO task = new FollowUpTaskDO();
        task.setId(id);
        task.setCustomerId(dispatch.getCustomerId());
        task.setOwnerUserId(record.getOwnerUserId());
        task.setTitleCiphertext(piiCryptoService.encrypt("外呼后续跟进"));
        task.setContentCiphertext(piiCryptoService.encrypt(content.toString()));
        task.setDueAt(dispatch.getNextFollowUpAt());
        task.setStatus("pending");
        task.setSourceCallRecordId(record.getId());
        return task;
    }

    /** Reconcile a delayed native end event without rewriting the user's immutable result. */
    @PostMapping("/calls/observed-end")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @ApiAccessLog(requestEnable = false)
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Boolean> observedEnd(@RequestBody @Valid ObservedEndReqVO req,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        PairedDeviceDO device = requireDevice(req.getDeviceId(), deviceKey);
        String fingerprint = DeviceCredentialUtils.hmacSha256(deviceKey, "observed-end-v1",
                String.valueOf(req.getCallRecordId()), req.getDeviceEventId(), req.getEndedAt().toInstant().toString(),
                String.valueOf(req.getDurationSeconds()));
        MobileCallEventDO prior = getExistingEvent(device.getId(), req.getDeviceEventId(), "observed_end");
        if (prior != null) {
            if (!Objects.equals(prior.getCallRecordId(), req.getCallRecordId()) || !Objects.equals(prior.getRequestFingerprint(), fingerprint))
                throw exception(ErrorCodeConstants.IDEMPOTENCY_CONFLICT);
            return success(true);
        }
        CallRecordDO record = recordMapper.selectById(req.getCallRecordId());
        if (record == null || !"ended".equals(record.getStatus()) || !Objects.equals(record.getDeviceId(), device.getId())
                || !Objects.equals(record.getOwnerUserId(), getLoginUserId()) || record.getStartedAt() == null)
            throw exception(ErrorCodeConstants.CALL_EVENT_INVALID);
        LocalDateTime endedAt = req.getEndedAt().withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        if (endedAt.isAfter(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(5))) throw exception(ErrorCodeConstants.CALL_EVENT_INVALID);
        int duration = validateCallDuration(Duration.between(record.getStartedAt(), endedAt).getSeconds(), req.getDurationSeconds());
        // Duplicate/less informative callbacks cannot erase an already observed duration.
        if (duration > (record.getDurationSeconds() == null ? 0 : record.getDurationSeconds())) {
            int updated = recordMapper.update(null, new LambdaUpdateWrapper<CallRecordDO>()
                    .set(CallRecordDO::getDurationSeconds, duration).set(CallRecordDO::getEndedAt, endedAt)
                    .set(CallRecordDO::getVersion, record.getVersion() + 1)
                    .eq(CallRecordDO::getId, record.getId()).eq(CallRecordDO::getDeviceId, device.getId())
                    .eq(CallRecordDO::getVersion, record.getVersion()).eq(CallRecordDO::getStatus, "ended"));
            if (updated != 1) throw exception(ErrorCodeConstants.CALL_EVENT_INVALID);
        }
        saveEvent(device.getId(), req.getDeviceEventId(), "observed_end", record.getCallDispatchId(), record.getId(), fingerprint);
        return success(true);
    }
    @Data public static class ObservedEndReqVO {
        @NotNull private Long deviceId;
        @NotNull private Long callRecordId;
        @NotBlank @Size(max = 64) private String deviceEventId;
        @NotNull private OffsetDateTime endedAt;
        @NotNull @Min(0) @Max(86400) private Integer durationSeconds;
    }

    public PairedDeviceDO requireDevice(Long deviceId, String deviceKey) {
        requireAdminIdentity();
        adminUserApi.validateUser(getLoginUserId());
        PairedDeviceDO device = deviceMapper.selectById(deviceId);
        if (device == null || !Objects.equals(device.getOwnerUserId(), getLoginUserId()) || !"paired".equals(device.getStatus())) {
            throw exception(ErrorCodeConstants.DEVICE_NOT_ONLINE);
        }
        if (device.getDeviceKeyHash() == null || !MessageDigest.isEqual(
                device.getDeviceKeyHash().getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                DeviceCredentialUtils.sha256(deviceKey).getBytes(java.nio.charset.StandardCharsets.US_ASCII))) {
            throw exception(ErrorCodeConstants.DEVICE_NOT_ONLINE);
        }
        return device;
    }
    private void requireAdminIdentity() {
        if (!Objects.equals(WebFrameworkUtils.getLoginUserType(), UserTypeEnum.ADMIN.getValue())) {
            throw exception(ErrorCodeConstants.CALLPHONE_ADMIN_REQUIRED);
        }
    }
    private MobileCallEventDO getExistingEvent(Long deviceId, String eventId, String eventType) {
        MobileCallEventDO event = eventMapper.selectByDeviceEvent(deviceId, eventId);
        if (event != null && !Objects.equals(event.getEventType(), eventType)) throw exception(ErrorCodeConstants.IDEMPOTENCY_CONFLICT);
        return event;
    }
    private void saveEvent(Long deviceId, String eventId, String eventType, Long dispatchId, Long callId) {
        saveEvent(deviceId, eventId, eventType, dispatchId, callId, null);
    }
    private void saveEvent(Long deviceId, String eventId, String eventType, Long dispatchId, Long callId, String requestFingerprint) {
        MobileCallEventDO event = new MobileCallEventDO(); event.setId(IdUtil.getSnowflake().nextId());
        event.setDeviceId(deviceId); event.setDeviceEventId(eventId); event.setEventType(eventType);
        event.setDispatchId(dispatchId); event.setCallRecordId(callId); event.setRequestFingerprint(requestFingerprint);
        eventMapper.insert(event);
    }
    private String completionFingerprint(CompleteCallReqVO req, String deviceKey) {
        return MobileCallEventFingerprint.completedCall(deviceKey, req.getDeviceEventId(), req.getCallRecordId(),
                req.getResultCode(), req.getStartedAt(), req.getEndedAt(), req.getDurationSeconds(), req.getNote(),
                req.isRecordingAvailable());
    }
    static int validateCallDuration(long elapsed, Integer durationSeconds) {
        // Ringing and time spent filling the result are not connected talk time.
        // Permit up to five seconds of clock/rounding drift, but no duration beyond the call window.
        if (elapsed < 0 || elapsed > 86400 || durationSeconds == null || durationSeconds < 0
                || durationSeconds > 86400 || durationSeconds > elapsed + 5) {
            throw exception(ErrorCodeConstants.CALL_EVENT_INVALID);
        }
        return durationSeconds;
    }
    private boolean isSameCompletedRequest(CallRecordDO record, CompleteCallReqVO req) {
        if (record == null || !"ended".equals(record.getStatus())
                || !Objects.equals(record.getResultCode(), req.getResultCode())
                || record.getDurationSeconds() == null
                || Math.abs((long) record.getDurationSeconds() - req.getDurationSeconds()) > 120
                || record.getStartedAt() == null || record.getEndedAt() == null) return false;
        LocalDateTime startedAt = req.getStartedAt().withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDateTime endedAt = req.getEndedAt().withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        return Objects.equals(record.getStartedAt(), startedAt)
                && Objects.equals(record.getEndedAt(), endedAt)
                && Objects.equals(piiCryptoService.decrypt(record.getNoteCiphertext()), req.getNote());
    }
    private AcceptDispatchRespVO toAcceptResp(CallRecordDO record, CallDispatchDO dispatch) {
        AcceptDispatchRespVO resp = new AcceptDispatchRespVO(); resp.setDispatchId(dispatch.getId());
        resp.setCallRecordId(record.getId()); resp.setPhoneNumber(piiCryptoService.decrypt(record.getPhoneCiphertext()));
        resp.setStatus(dispatch.getStatus()); return resp;
    }

    @Data public static class DispatchActionReqVO {
        @NotNull private Long dispatchId; @NotNull private Long deviceId;
        @NotBlank @Size(max = 100) private String deviceEventId;
    }
    @Data public static class PairingClaimReqVO {
        @NotBlank @Pattern(regexp = "[0-9]{6}") private String pairingCode;
        @NotBlank @Size(max = 128) private String displayName;
        @NotBlank @Pattern(regexp = "android|ios") private String platform;
    }
    @Data public static class PairingClaimRespVO { private Long deviceId; private String deviceKey; private String displayName; }
    @Data public static class DeviceHeartbeatReqVO { @NotNull private Long deviceId; }
    @Data public static class DispatchDeclineReqVO extends DispatchActionReqVO {
        @Pattern(regexp = "not_available|wrong_number|wrong_time|other") private String reasonCode;
    }
    @Data public static class CompleteCallReqVO {
        @NotNull @JsonAlias("call_id") private Long callRecordId; @NotNull private Long deviceId;
        @NotBlank @Size(max = 100) @JsonAlias("device_event_id") private String deviceEventId;
        @NotBlank @Pattern(regexp = "connected|no_answer|busy|rejected|invalid_number|other") @JsonAlias("result_code") private String resultCode;
        @NotNull @JsonAlias("started_at") private OffsetDateTime startedAt; @NotNull @JsonAlias("ended_at") private OffsetDateTime endedAt;
        @NotNull @Min(0) @Max(86400) @JsonAlias("duration_seconds") private Integer durationSeconds;
        @JsonAlias("recording_available") private boolean recordingAvailable;
        @Size(max = 2000) private String note;
    }
    @Data public static class CallStartedReqVO {
        @NotNull private Long callRecordId; @NotNull private Long deviceId;
        @NotBlank @Size(max = 100) private String deviceEventId; @NotNull private OffsetDateTime startedAt;
    }
    @Data public static class DirectCallReqVO {
        @NotNull private Long customerId; @NotNull private Long deviceId;
        @NotBlank @Size(max = 100) private String deviceEventId;
    }
    @Data public static class MobileDispatchRespVO {
        private Long id; private Long customerId; private Long leadId; private String customerName; private String phoneDisplay;
        private String requestNote; private Long deviceId; private LocalDateTime expiresAt;
    }
    @Data public static class AcceptDispatchRespVO {
        private Long dispatchId; private Long callRecordId; private String phoneNumber; private String status;
    }
}
