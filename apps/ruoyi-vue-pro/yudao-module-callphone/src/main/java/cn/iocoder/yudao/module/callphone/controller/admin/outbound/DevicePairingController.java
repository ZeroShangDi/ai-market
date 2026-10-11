package cn.iocoder.yudao.module.callphone.controller.admin.outbound;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.DesktopPairingCodeDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.PairedDeviceDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.DesktopPairingCodeMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.PairedDeviceMapper;
import cn.iocoder.yudao.module.callphone.service.outbound.CallDispatchWorkflowService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.security.SecureRandom;
import java.util.List;
import java.util.Objects;
import cn.iocoder.yudao.module.callphone.util.DeviceCredentialUtils;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 设备配对")
@RestController
@RequestMapping("/callphone/device")
@Validated
public class DevicePairingController {
    private static final SecureRandom RANDOM = new SecureRandom();
    @Resource private DesktopPairingCodeMapper pairingCodeMapper;
    @Resource private PairedDeviceMapper deviceMapper;
    @Resource private CallDispatchWorkflowService callDispatchWorkflowService;

    @GetMapping("/list")
    @Operation(summary = "查看本人配对设备")
    @PreAuthorize("@ss.hasPermission('callphone:device:pair:manage')")
    public CommonResult<List<DeviceRespVO>> list() {
        LocalDateTime onlineAfter = LocalDateTime.now(ZoneOffset.UTC).minusMinutes(2);
        List<DeviceRespVO> result = deviceMapper.selectList(new LambdaQueryWrapperX<PairedDeviceDO>()
                .eq(PairedDeviceDO::getOwnerUserId, getLoginUserId()).orderByDesc(PairedDeviceDO::getUpdateTime))
                .stream().map(device -> {
                    DeviceRespVO vo = new DeviceRespVO(); vo.setId(device.getId()); vo.setDisplayName(device.getDisplayName());
                    vo.setPlatform(device.getPlatform()); vo.setLastSeenAt(device.getLastSeenAt());
                    vo.setStatus(!"paired".equals(device.getStatus()) ? "revoked"
                            : device.getLastSeenAt() != null && device.getLastSeenAt().isAfter(onlineAfter) ? "online" : "offline");
                    return vo;
                }).toList();
        return success(result);
    }

    @PostMapping("/pairing-code/create")
    @Operation(summary = "创建 5 分钟有效的手机配对码")
    @PreAuthorize("@ss.hasPermission('callphone:device:pair:manage')")
    @cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog(responseEnable = false)
    public CommonResult<PairingCodeRespVO> createCode() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        String code = null;
        for (int attempts = 0; attempts < 10; attempts++) {
            String candidate = String.format("%06d", 100000 + RANDOM.nextInt(900000));
            if (pairingCodeMapper.selectPendingByCodeHash(DeviceCredentialUtils.sha256(candidate), now) == null) { code = candidate; break; }
        }
        if (code == null) throw new IllegalStateException("Unable to allocate pairing code");
        DesktopPairingCodeDO entity = new DesktopPairingCodeDO(); entity.setId(IdUtil.getSnowflake().nextId());
        entity.setOwnerUserId(getLoginUserId()); entity.setCodeHash(DeviceCredentialUtils.sha256(code)); entity.setStatus("pending");
        String loginSecret = DeviceCredentialUtils.createDeviceKey();
        entity.setLoginSecretHash(DeviceCredentialUtils.sha256(loginSecret));
        entity.setExpiresAt(now.plusMinutes(5)); pairingCodeMapper.insert(entity);
        PairingCodeRespVO resp = new PairingCodeRespVO(); resp.setId(entity.getId()); resp.setPairingCode(code); resp.setLoginSecret(loginSecret);
        resp.setStatus(entity.getStatus()); resp.setExpiresAt(entity.getExpiresAt()); return success(resp);
    }

    @GetMapping("/pairing-code/get")
    @Operation(summary = "查看配對碼狀態")
    @PreAuthorize("@ss.hasPermission('callphone:device:pair:manage')")
    public CommonResult<PairingCodeRespVO> getCode(@RequestParam Long id) {
        DesktopPairingCodeDO code = pairingCodeMapper.selectById(id);
        if (code == null || !Objects.equals(code.getOwnerUserId(), getLoginUserId())) return success(null);
        if ("pending".equals(code.getStatus()) && !code.getExpiresAt().isAfter(LocalDateTime.now(ZoneOffset.UTC))) {
            int updated = pairingCodeMapper.update(null,
                    new LambdaUpdateWrapper<DesktopPairingCodeDO>().set(DesktopPairingCodeDO::getStatus, "expired")
                            .eq(DesktopPairingCodeDO::getId, code.getId())
                            .eq(DesktopPairingCodeDO::getStatus, "pending"));
            if (updated == 1) {
                code.setStatus("expired");
            } else {
                // A phone may have claimed the code while this page was polling its expiry.
                // Return the winning persisted state instead of overwriting it in the UI.
                code = pairingCodeMapper.selectById(id);
                if (code == null || !Objects.equals(code.getOwnerUserId(), getLoginUserId())) return success(null);
            }
        }
        PairingCodeRespVO resp = new PairingCodeRespVO(); resp.setId(code.getId()); resp.setStatus(code.getStatus());
        resp.setExpiresAt(code.getExpiresAt()); resp.setDeviceId(code.getDeviceId()); return success(resp);
    }

    @PostMapping("/pairing-code/cancel")
    @Operation(summary = "取消尚未认领的配对码")
    @PreAuthorize("@ss.hasPermission('callphone:device:pair:manage')")
    public CommonResult<Boolean> cancelCode(@RequestBody @Valid PairingCodeCancelReqVO reqVO) {
        int updated = pairingCodeMapper.update(null, new LambdaUpdateWrapper<DesktopPairingCodeDO>()
                .set(DesktopPairingCodeDO::getStatus, "revoked").eq(DesktopPairingCodeDO::getId, reqVO.getId())
                .eq(DesktopPairingCodeDO::getOwnerUserId, getLoginUserId()).eq(DesktopPairingCodeDO::getStatus, "pending"));
        return success(updated == 1);
    }

    @PostMapping("/revoke")
    @Operation(summary = "解绑手机设备")
    @PreAuthorize("@ss.hasPermission('callphone:device:pair:manage')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Boolean> revoke(@RequestBody @Valid PairingCodeCancelReqVO reqVO) {
        int updated = deviceMapper.update(null, new LambdaUpdateWrapper<PairedDeviceDO>()
                .set(PairedDeviceDO::getStatus, "revoked").set(PairedDeviceDO::getDeviceKeyHash, null)
                .eq(PairedDeviceDO::getId, reqVO.getId()).eq(PairedDeviceDO::getOwnerUserId, getLoginUserId())
                .eq(PairedDeviceDO::getStatus, "paired"));
        if (updated == 1) {
            callDispatchWorkflowService.failQueuedForDevice(reqVO.getId(), getLoginUserId(), "device_revoked");
        }
        return success(updated == 1);
    }

    @Data public static class PairingCodeCancelReqVO { @NotNull private Long id; }
    @Data public static class PairingCodeRespVO { private Long id; private String pairingCode; private String loginSecret; private String status; private LocalDateTime expiresAt; private Long deviceId; }
    @Data public static class DeviceRespVO { private Long id; private String displayName; private String platform; private String status; private LocalDateTime lastSeenAt; }
}
