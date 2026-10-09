package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.security.core.service.SecurityFrameworkService;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.framework.web.core.util.WebFrameworkUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.settings.vo.EntitlementSnapshotRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.DevicePairingController;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.AcceptDispatchRespVO;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.CallStartedReqVO;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.CompleteCallReqVO;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.DirectCallReqVO;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.DispatchDeclineReqVO;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.DispatchActionReqVO;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.DeviceHeartbeatReqVO;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.MobileDispatchRespVO;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.PairingClaimReqVO;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.PairingClaimRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordingAssetDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.PairedDeviceDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordingAssetMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.PairedDeviceMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.callphone.service.outbound.CallRecordingStorageService;
import cn.iocoder.yudao.module.callphone.service.settings.EntitlementService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.access.prepost.PreAuthorize;

import java.time.OffsetDateTime;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;

/** Compatibility adapter for the uni-app public API contract. Business rules stay in this module. */
@Tag(name = "用户 App - Call Phone 移动端 v1 兼容接口")
@RestController
@RequestMapping("/api/v1/mobile")
@Validated
public class CallPhoneMobileV1AdapterController {

    @jakarta.annotation.Resource private CallPhoneMobileController mobileController;
    @jakarta.annotation.Resource private CustomerMapper customerMapper;
    @jakarta.annotation.Resource private CallRecordMapper callRecordMapper;
    @jakarta.annotation.Resource private CallRecordingAssetMapper recordingAssetMapper;
    @jakarta.annotation.Resource private CallRecordingStorageService recordingStorage;
    @jakarta.annotation.Resource private PairedDeviceMapper deviceMapper;
    @jakarta.annotation.Resource private PiiCryptoService crypto;
    @jakarta.annotation.Resource private AdminUserApi adminUserApi;
    @jakarta.annotation.Resource private SecurityFrameworkService security;
    @jakarta.annotation.Resource private EntitlementService entitlementService;
    @jakarta.annotation.Resource private DevicePairingController devicePairingController;

    @GetMapping("/bootstrap")
    @Operation(summary = "移动端启动所需的账号、设备和授权快照")
    public CommonResult<BootstrapDTO> bootstrap() {
        requireAdminIdentity();
        adminUserApi.validateUser(cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId());
        Long userId = cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId();
        AdminUserRespDTO user = adminUserApi.getUser(userId);
        List<PairedDeviceDO> devices = deviceMapper.selectList(new LambdaQueryWrapperX<PairedDeviceDO>()
                .eq(PairedDeviceDO::getOwnerUserId, userId).eq(PairedDeviceDO::getStatus, "paired")
                .orderByDesc(PairedDeviceDO::getLastSeenAt).last("LIMIT 1"));
        EntitlementSnapshotRespVO entitlement = entitlementService.getCurrent();
        BootstrapDTO dto = new BootstrapDTO();
        dto.user = new BootstrapUserDTO(String.valueOf(userId), user == null ? "" : user.getNickname());
        dto.workspace = new BootstrapWorkspaceDTO(String.valueOf(TenantContextHolder.getRequiredTenantId()), "当前工作区");
        PairedDeviceDO device = devices.isEmpty() ? null : devices.get(0);
        dto.device = new BootstrapDeviceDTO(device == null ? null : String.valueOf(device.getId()), device != null, null);
        String status = "unavailable";
        if ("available".equals(entitlement.getState())) {
            status = switch (Objects.toString(entitlement.getStatus(), "")) {
                case "active", "trial" -> "active";
                case "expired", "suspended" -> "expired";
                default -> "unavailable";
            };
        }
        dto.license = new BootstrapLicenseDTO("self-hosted", status, entitlement.getExpiresAt(), entitlement.getCheckedAt());
        return success(dto);
    }

    @GetMapping("/diagnostics")
    @Operation(summary = "移动端诊断客户侧服务、授权检查状态和设备配对状态")
    public CommonResult<DiagnosticsDTO> diagnostics() {
        requireAdminIdentity();
        Long userId = cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId();
        adminUserApi.validateUser(userId);
        List<PairedDeviceDO> devices = deviceMapper.selectList(new LambdaQueryWrapperX<PairedDeviceDO>()
                .eq(PairedDeviceDO::getOwnerUserId, userId).eq(PairedDeviceDO::getStatus, "paired")
                .orderByDesc(PairedDeviceDO::getLastSeenAt).last("LIMIT 1"));
        EntitlementSnapshotRespVO entitlement;
        try {
            entitlement = entitlementService.getCurrent();
        } catch (RuntimeException exception) {
            // A transient entitlement-service problem must not hide the local
            // data-service and pairing diagnostics.
            entitlement = null;
        }
        return success(toDiagnosticsDTO(entitlement, !devices.isEmpty()));
    }

    @GetMapping("/customers")
    @Operation(summary = "读取当前成员可拨打客户列表")
    @PreAuthorize("@ss.hasPermission('callphone:customer:query')")
    public CommonResult<MobilePageRespVO<CustomerV1DTO>> customers(
            @RequestParam(defaultValue = "today") String scope,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(name = "page_size", defaultValue = "20") int pageSize,
            @RequestParam(required = false) String q) {
        requireAdminIdentity();
        Long userId = cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId();
        CustomerPageReqVO req = new CustomerPageReqVO(); req.setPageNo(Math.max(1, page));
        req.setPageSize(Math.max(1, Math.min(20, pageSize))); req.setQuery(q == null ? null : q.trim());
        PageResult<CustomerDO> result = customerMapper.selectMobilePage(req,
                TenantContextHolder.getRequiredTenantId(), userId, scope);
        boolean mayDial = security.hasPermission("callphone:call:dispatch:create");
        List<CustomerV1DTO> rows = result.getList().stream().map(customer -> {
            CallRecordDO latest = latestCalls(customer.getId(), userId, 1).stream().findFirst().orElse(null);
            return toCustomerDto(customer, mayDial, latest, List.of());
        }).toList();
        return success(new MobilePageRespVO<>(rows, result.getTotal()));
    }

    @GetMapping("/customers/{customerId}")
    @Operation(summary = "读取本人客户详情及近期通话摘要")
    @PreAuthorize("@ss.hasPermission('callphone:customer:query')")
    public CommonResult<CustomerV1DTO> customer(@PathVariable Long customerId) {
        requireAdminIdentity();
        Long userId = cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId();
        CustomerDO customer = customerMapper.selectById(customerId);
        if (customer == null || !Objects.equals(customer.getOwnerUserId(), userId) || !"active".equals(customer.getStatus())) {
            return success(null);
        }
        List<CallRecordDO> calls = latestCalls(customerId, userId, 20);
        return success(toCustomerDto(customer, security.hasPermission("callphone:call:dispatch:create"),
                calls.isEmpty() ? null : calls.get(0), calls));
    }

    @GetMapping("/devices/current")
    @Operation(summary = "读取当前手机配对状态")
    @PreAuthorize("@ss.hasPermission('callphone:device:pair:manage')")
    public CommonResult<CurrentDeviceDTO> currentDevice(
            @RequestHeader("X-Callphone-Device-Id") @NotBlank String deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        PairedDeviceDO device = mobileController.requireDevice(Long.valueOf(deviceId), deviceKey);
        return success(new CurrentDeviceDTO(device.getDisplayName(), device.getPlatform(), true, null,
                device.getLastSeenAt() == null ? null : device.getLastSeenAt().atOffset(ZoneOffset.UTC).toString()));
    }

    @PostMapping("/devices/heartbeat")
    @Operation(summary = "刷新兼容契约中的已配对手机在线状态")
    @PreAuthorize("@ss.hasPermission('callphone:device:pair:manage')")
    public CommonResult<Boolean> heartbeat(
            @RequestHeader("X-Callphone-Device-Id") @NotBlank String deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        DeviceHeartbeatReqVO req = new DeviceHeartbeatReqVO();
        req.setDeviceId(Long.valueOf(deviceId));
        return mobileController.heartbeat(req, deviceKey);
    }

    @DeleteMapping("/devices/current/pairing")
    @Operation(summary = "解绑当前手机")
    @PreAuthorize("@ss.hasPermission('callphone:device:pair:manage')")
    public CommonResult<Boolean> unpair(
            @RequestHeader("X-Callphone-Device-Id") @NotBlank String deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        PairedDeviceDO device = mobileController.requireDevice(Long.valueOf(deviceId), deviceKey);
        DevicePairingController.PairingCodeCancelReqVO req = new DevicePairingController.PairingCodeCancelReqVO();
        req.setId(device.getId());
        return devicePairingController.revoke(req);
    }

    @PostMapping("/pairings/claim")
    @Operation(summary = "按兼容契约认领配对码")
    @PreAuthorize("@ss.hasPermission('callphone:device:pair:manage')")
    @cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog(requestEnable = false)
    public CommonResult<PairingClaimDTO> claimPairing(@RequestBody @Valid PairingClaimV1ReqVO req) {
        PairingClaimReqVO source = new PairingClaimReqVO(); source.setPairingCode(req.getPairingCode());
        source.setDisplayName(req.getDisplayName()); source.setPlatform(req.getPlatform());
        PairingClaimRespVO result = mobileController.claimPairing(source).getData();
        return success(result == null ? null : new PairingClaimDTO(id(result.getDeviceId()), result.getDeviceKey(), result.getDisplayName()));
    }

    @GetMapping("/call-dispatches")
    @Operation(summary = "读取兼容契约的手机派发列表")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    public CommonResult<MobilePageRespVO<MobileDispatchDTO>> dispatches(
            @RequestParam(defaultValue = "pending") String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(name = "page_size", defaultValue = "20") int pageSize,
            @RequestHeader("X-Callphone-Device-Id") @NotBlank String deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        List<MobileDispatchRespVO> rows = mobileController.getPendingDispatches(Long.valueOf(deviceId), deviceKey).getData();
        List<MobileDispatchDTO> filtered = ("pending".equals(status) || "queued".equals(status)
                ? rows : List.<MobileDispatchRespVO>of()).stream().map(MobileDispatchDTO::from).toList();
        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, Math.min(100, pageSize));
        int from = Math.min(filtered.size(), (safePage - 1) * safeSize);
        int to = Math.min(filtered.size(), from + safeSize);
        return success(new MobilePageRespVO<>(filtered.subList(from, to), filtered.size()));
    }

    @PostMapping("/calls")
    @Operation(summary = "按兼容契约请求手机拨号")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    public CommonResult<BeginCallRespVO> beginCall(@RequestBody @Valid BeginCallReqVO req,
            @RequestHeader("X-Callphone-Device-Id") @NotBlank String deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        if ("pc_dispatch".equals(req.getSource())) {
            if (req.getDispatchId() == null) {
                throw exception(ErrorCodeConstants.CALLPHONE_MOBILE_REQUEST_INVALID);
            }
            DispatchActionReqVO accept = new DispatchActionReqVO();
            accept.setDeviceId(Long.valueOf(deviceId)); accept.setDispatchId(req.getDispatchId());
            accept.setDeviceEventId(req.getDeviceEventId());
            AcceptDispatchRespVO result = mobileController.accept(accept, deviceKey).getData();
            return success(result == null ? null : new BeginCallRespVO(id(result.getCallRecordId()), result.getPhoneNumber(), id(result.getDispatchId())));
        }
        if (!("customer_list".equals(req.getSource()) || "customer_detail".equals(req.getSource()))
                || req.getCustomerId() == null) {
            throw exception(ErrorCodeConstants.CALLPHONE_MOBILE_REQUEST_INVALID);
        }
        DirectCallReqVO direct = new DirectCallReqVO(); direct.setDeviceId(Long.valueOf(deviceId));
        direct.setCustomerId(req.getCustomerId()); direct.setDeviceEventId(req.getDeviceEventId());
        AcceptDispatchRespVO result = mobileController.beginDirectCall(direct, deviceKey).getData();
        return success(result == null ? null : new BeginCallRespVO(id(result.getCallRecordId()), result.getPhoneNumber(), id(result.getDispatchId())));
    }

    @PostMapping("/calls/started")
    @Operation(summary = "确认系统拨号已开始")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    public CommonResult<Boolean> started(@RequestBody @Valid StartCallReqVO req,
            @RequestHeader("X-Callphone-Device-Id") @NotBlank String deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        CallStartedReqVO started = new CallStartedReqVO(); started.setCallRecordId(req.getCallId());
        started.setDeviceId(Long.valueOf(deviceId)); started.setDeviceEventId(req.getDeviceEventId());
        started.setStartedAt(req.getStartedAt());
        return mobileController.started(started, deviceKey);
    }

    @PostMapping("/call-dispatches/{dispatchId}/decline")
    @Operation(summary = "按兼容契约拒绝电脑派发")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    public CommonResult<Boolean> decline(@PathVariable Long dispatchId, @RequestBody @Valid DeclineReqVO req,
            @RequestHeader("X-Callphone-Device-Id") @NotBlank String deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        DispatchDeclineReqVO decline = new DispatchDeclineReqVO(); decline.setDeviceId(Long.valueOf(deviceId));
        decline.setDispatchId(dispatchId); decline.setDeviceEventId(req.getDeviceEventId()); decline.setReasonCode(req.getReasonCode());
        return mobileController.decline(decline, deviceKey);
    }

    @PostMapping("/calls/{callId}/complete")
    @Operation(summary = "按兼容契约回填通话结果")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog(requestEnable = false)
    public CommonResult<Boolean> complete(@PathVariable Long callId, @RequestBody @Valid CompleteCallV1ReqVO req,
            @RequestHeader("X-Callphone-Device-Id") @NotBlank String deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        CompleteCallReqVO internal = new CompleteCallReqVO();
        internal.setCallRecordId(callId);
        internal.setDeviceId(Long.valueOf(deviceId));
        internal.setDeviceEventId(req.getDeviceEventId());
        internal.setResultCode(req.getResultCode());
        internal.setStartedAt(req.getStartedAt());
        internal.setEndedAt(req.getEndedAt());
        internal.setDurationSeconds(req.getDurationSeconds());
        internal.setRecordingAvailable(req.isRecordingAvailable());
        internal.setNote(req.getNote());
        return mobileController.complete(internal, deviceKey);
    }

    @PostMapping(path = "/calls/{callId}/recording", consumes = "multipart/form-data")
    @Operation(summary = "上传已结束通话的本机录音到客户侧加密存储")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    @cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog(requestEnable = false)
    public CommonResult<Boolean> uploadRecording(@PathVariable Long callId,
            @RequestParam("file") MultipartFile file, @RequestParam("upload_id") String uploadId,
            @RequestHeader("X-Callphone-Device-Id") @NotBlank String deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) throws java.io.IOException {
        PairedDeviceDO device = mobileController.requireDevice(Long.valueOf(deviceId), deviceKey);
        CallRecordDO record = callRecordMapper.selectById(callId);
        if (record == null || !"ended".equals(record.getStatus())
                || !Objects.equals(record.getOwnerUserId(), device.getOwnerUserId())
                || !Objects.equals(record.getDeviceId(), device.getId())) {
            throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                    cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CALL_RECORDING_UPLOAD_INVALID);
        }
        if (file.isEmpty() || file.getSize() > CallRecordingStorageService.MAX_RECORDING_BYTES) {
            throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                    cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CALL_RECORDING_UPLOAD_INVALID);
        }
        recordingStorage.save(callId, device.getId(), device.getOwnerUserId(), uploadId, file.getBytes());
        return success(true);
    }

    @GetMapping("/calls/{callId}/recording-access")
    @Operation(summary = "检查手机当前账号和设备是否可以播放通话录音")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    public CommonResult<RecordingAccessDTO> recordingAccess(@PathVariable Long callId,
            @RequestHeader("X-Callphone-Device-Id") @NotBlank String deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey) {
        PairedDeviceDO device = mobileController.requireDevice(Long.valueOf(deviceId), deviceKey);
        CallRecordDO record = callRecordMapper.selectById(callId);
        CallRecordingAssetDO asset = recordingAssetMapper.selectByCallRecordId(callId);
        if (record == null || asset == null || !Objects.equals(record.getOwnerUserId(), device.getOwnerUserId())
                || !Objects.equals(record.getDeviceId(), device.getId())
                || !Objects.equals(asset.getOwnerUserId(), device.getOwnerUserId())
                || !Objects.equals(asset.getDeviceId(), device.getId())
                || !"ready".equals(record.getRecordingState())) {
            throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                    cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CALL_RECORDING_NOT_FOUND);
        }
        return success(new RecordingAccessDTO("/api/v1/mobile/calls/" + callId + "/recording", null));
    }

    @GetMapping("/calls/{callId}/recording")
    @Operation(summary = "读取本人且由当前配对手机产生的加密通话录音")
    @PreAuthorize("@ss.hasPermission('callphone:call:dispatch:create')")
    public void downloadRecording(@PathVariable Long callId,
            @RequestHeader("X-Callphone-Device-Id") @NotBlank String deviceId,
            @RequestHeader("X-Callphone-Device-Key") @NotBlank String deviceKey,
            HttpServletResponse response) throws java.io.IOException {
        PairedDeviceDO device = mobileController.requireDevice(Long.valueOf(deviceId), deviceKey);
        CallRecordDO record = callRecordMapper.selectById(callId);
        CallRecordingAssetDO asset = recordingAssetMapper.selectByCallRecordId(callId);
        if (record == null || asset == null || !Objects.equals(record.getOwnerUserId(), device.getOwnerUserId())
                || !Objects.equals(record.getDeviceId(), device.getId())
                || !Objects.equals(asset.getOwnerUserId(), device.getOwnerUserId())
                || !Objects.equals(asset.getDeviceId(), device.getId())
                || !"ready".equals(record.getRecordingState())) {
            throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                    cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CALL_RECORDING_NOT_FOUND);
        }
        writeRecording(response, asset);
    }

    private void requireAdminIdentity() {
        if (!Objects.equals(WebFrameworkUtils.getLoginUserType(), UserTypeEnum.ADMIN.getValue())) {
            throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                    cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CALLPHONE_ADMIN_REQUIRED);
        }
    }

    public static DiagnosticsDTO toDiagnosticsDTO(EntitlementSnapshotRespVO entitlement, boolean paired) {
        String licenseCheck = "unavailable";
        if (entitlement != null) {
            if ("not_configured".equals(entitlement.getState())) {
                licenseCheck = "not_configured";
            } else if ("available".equals(entitlement.getState())) {
                licenseCheck = switch (Objects.toString(entitlement.getStatus(), "")) {
                    case "active", "trial" -> "active";
                    case "expired" -> "expired";
                    case "suspended" -> "suspended";
                    default -> "unavailable";
                };
            }
        }
        return new DiagnosticsDTO("available", licenseCheck, paired);
    }

    private String id(Long value) {
        return value == null ? null : value.toString();
    }

    private List<CallRecordDO> latestCalls(Long customerId, Long ownerUserId, int limit) {
        return callRecordMapper.selectList(new LambdaQueryWrapperX<CallRecordDO>()
                .eq(CallRecordDO::getCustomerId, customerId).eq(CallRecordDO::getOwnerUserId, ownerUserId)
                .isNotNull(CallRecordDO::getStartedAt).orderByDesc(CallRecordDO::getStartedAt)
                .orderByDesc(CallRecordDO::getId).last("LIMIT " + Math.max(1, Math.min(20, limit))));
    }

    private CustomerV1DTO toCustomerDto(CustomerDO customer, boolean mayDial, CallRecordDO latest, List<CallRecordDO> calls) {
        String name = crypto.decrypt(customer.getNameCiphertext());
        CustomerV1DTO dto = new CustomerV1DTO(); dto.id = String.valueOf(customer.getId()); dto.name = name;
        dto.phoneDisplay = customer.getPhoneDisplay(); dto.phoneDialable = mayDial ? crypto.decrypt(customer.getPhoneCiphertext()) : null;
        dto.avatarInitial = name == null || name.isBlank() ? "客" : name.substring(0, 1); dto.stage = customer.getStage();
        if (latest != null) {
            dto.lastCallAt = utc(latest.getStartedAt()); dto.lastCallResult = latest.getResultCode();
            dto.lastCallDurationSeconds = latest.getDurationSeconds();
        }
        if (!calls.isEmpty()) dto.calls = calls.stream().map(call -> {
            MobileCallDTO row = new MobileCallDTO(); row.id = String.valueOf(call.getId());
            row.resultCode = call.getResultCode(); row.status = call.getStatus(); row.startedAt = utc(call.getStartedAt());
            row.durationSeconds = call.getDurationSeconds(); row.recordingState = call.getRecordingState();
            row.hasRecording = "ready".equals(call.getRecordingState()); return row;
        }).toList();
        return dto;
    }

    private String utc(LocalDateTime value) {
        return value == null ? null : value.atOffset(ZoneOffset.UTC).toString();
    }

    private void writeRecording(HttpServletResponse response, CallRecordingAssetDO asset) throws java.io.IOException {
        byte[] content = recordingStorage.read(asset);
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(asset.getContentType());
        response.setContentLengthLong(content.length);
        response.setHeader("Content-Disposition", "inline; filename=call-recording");
        response.setHeader("Cache-Control", "private, no-store, max-age=0");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.getOutputStream().write(content);
    }

    @Data public static class BeginCallReqVO {
        @NotBlank @Pattern(regexp = "pc_dispatch|customer_list|customer_detail", message = "不支持的拨号来源")
        private String source;
        @JsonAlias("customer_id") private Long customerId;
        @JsonAlias("dispatch_id") private Long dispatchId;
        @NotBlank @JsonAlias("device_event_id") private String deviceEventId;
    }
    @Data public static class PairingClaimV1ReqVO {
        @NotBlank @Pattern(regexp = "[0-9]{6}") @JsonAlias("pairing_code") private String pairingCode;
        @NotBlank @Size(max = 128) @JsonAlias("display_name") private String displayName;
        @NotBlank @Pattern(regexp = "android|ios") private String platform;
    }
    @Data public static class PairingClaimDTO {
        @JsonProperty("device_id") private final String deviceId;
        @JsonProperty("device_key") private final String deviceKey;
        @JsonProperty("display_name") private final String displayName;
    }
    @Data public static class StartCallReqVO {
        @NotNull @JsonAlias("call_id") private Long callId;
        @NotBlank @JsonAlias("device_event_id") private String deviceEventId;
        @NotNull @JsonAlias("started_at") private OffsetDateTime startedAt;
    }
    @Data public static class DeclineReqVO {
        @NotBlank @JsonAlias("device_event_id") private String deviceEventId;
        @JsonAlias("reason_code") private String reasonCode;
    }
    /** Public v1 contract keeps the call ID in the path and does not duplicate it in the body. */
    @Data public static class CompleteCallV1ReqVO {
        @NotBlank @Size(max = 100) @JsonAlias("device_event_id") private String deviceEventId;
        @NotBlank @Pattern(regexp = "connected|no_answer|busy|rejected|invalid_number|other")
        @JsonAlias("result_code") private String resultCode;
        @NotNull @JsonAlias("started_at") private OffsetDateTime startedAt;
        @NotNull @JsonAlias("ended_at") private OffsetDateTime endedAt;
        @NotNull @Min(0) @Max(86400) @JsonAlias("duration_seconds") private Integer durationSeconds;
        @JsonAlias("recording_available") private boolean recordingAvailable;
        @Size(max = 2000) private String note;
    }
    @Data public static class BeginCallRespVO {
        @JsonProperty("call_id") private final String callId;
        @JsonProperty("phone_number") private final String phoneNumber;
        @JsonProperty("dispatch_id") private final String dispatchId;
    }
    @Data public static class MobilePageRespVO<T> {
        private final List<T> items;
        private final long total;
    }
    @Data public static class BootstrapDTO {
        private BootstrapUserDTO user;
        private BootstrapWorkspaceDTO workspace;
        private BootstrapDeviceDTO device;
        private BootstrapLicenseDTO license;
    }
    @Data public static class BootstrapUserDTO {
        private final String id; private final String name;
    }
    @Data public static class BootstrapWorkspaceDTO {
        private final String id; private final String name;
    }
    @Data public static class BootstrapDeviceDTO {
        private final String id; private final boolean paired;
        @JsonProperty("paired_computer") private final String pairedComputer;
    }
    @Data public static class BootstrapLicenseDTO {
        private final String edition; private final String status;
        @JsonProperty("expires_at") private final String expiresAt;
        @JsonProperty("last_verified_at") private final String lastVerifiedAt;
    }
    @Data public static class CustomerV1DTO {
        private String id; private String name;
        @JsonProperty("phone_display") private String phoneDisplay;
        @JsonProperty("phone_dialable") private String phoneDialable;
        @JsonProperty("avatar_initial") private String avatarInitial;
        private String stage;
        @JsonProperty("last_call_at") private String lastCallAt;
        @JsonProperty("last_call_result") private String lastCallResult;
        @JsonProperty("last_call_duration_seconds") private Integer lastCallDurationSeconds;
        private List<MobileCallDTO> calls;
    }
    @Data public static class MobileCallDTO {
        private String id; private String status;
        @JsonProperty("result_code") private String resultCode;
        @JsonProperty("started_at") private String startedAt;
        @JsonProperty("duration_seconds") private Integer durationSeconds;
        @JsonProperty("has_recording") private boolean hasRecording;
        @JsonProperty("recording_state") private String recordingState;
    }
    @Data public static class RecordingAccessDTO {
        @JsonProperty("playback_url") private final String playbackUrl;
        @JsonProperty("expires_at") private final String expiresAt;
    }
    @Data public static class CurrentDeviceDTO {
        private final String name;
        private final String platform;
        private final boolean paired;
        @JsonProperty("paired_computer") private final String pairedComputer;
        @JsonProperty("last_sync_at") private final String lastSyncAt;
    }
    @Data public static class DiagnosticsDTO {
        @JsonProperty("data_service") private final String dataService;
        @JsonProperty("license_check") private final String licenseCheck;
        private final boolean paired;
    }
    @Data public static class MobileDispatchDTO {
        @JsonProperty("id") private String id;
        @JsonProperty("customer_id") private String customerId;
        @JsonProperty("lead_id") private String leadId;
        @JsonProperty("customer_name") private String customerName;
        @JsonProperty("phone_display") private String phoneDisplay;
        @JsonProperty("request_note") private String requestNote;
        @JsonProperty("expires_at") private String expiresAt;
        @JsonProperty("status") private String status = "queued";
        private static MobileDispatchDTO from(MobileDispatchRespVO source) {
            MobileDispatchDTO dto = new MobileDispatchDTO(); dto.id = String.valueOf(source.getId());
            dto.customerId = source.getCustomerId() == null ? null : String.valueOf(source.getCustomerId());
            dto.leadId = source.getLeadId() == null ? null : String.valueOf(source.getLeadId()); dto.requestNote = source.getRequestNote();
            dto.customerName = source.getCustomerName(); dto.phoneDisplay = source.getPhoneDisplay();
            dto.expiresAt = source.getExpiresAt() == null ? null : source.getExpiresAt().atOffset(ZoneOffset.UTC).toString(); return dto;
        }
    }
}
