package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.biz.system.oauth2.OAuth2TokenCommonApi;
import cn.iocoder.yudao.framework.common.biz.system.oauth2.dto.OAuth2AccessTokenCreateReqDTO;
import cn.iocoder.yudao.framework.common.biz.system.permission.PermissionCommonApi;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.PairedDeviceDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.DesktopPairingCodeMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.PairedDeviceMapper;
import cn.iocoder.yudao.module.callphone.util.DeviceCredentialUtils;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import jakarta.annotation.Resource;
import jakarta.annotation.security.PermitAll;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.common.exception.enums.GlobalErrorCodeConstants.UNAUTHORIZED;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.DEVICE_NOT_ONLINE;

@RestController
@RequestMapping("/api/v1/mobile/session")
@Validated
public class MobileSessionController {
    public static final String DEVICE_SCOPE = "callphone-device:";
    @Resource private DesktopPairingCodeMapper pairingCodeMapper;
    @Resource private PairedDeviceMapper deviceMapper;
    @Resource private CallPhoneMobileController mobileController;
    @Resource private OAuth2TokenCommonApi tokens;
    @Resource private AdminUserApi users;
    @Resource private PermissionCommonApi permissions;

    @PostMapping("/scan") @PermitAll
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<SessionResponse> scan(@RequestBody @Valid ScanRequest request) {
        var pairing = pairingCodeMapper.selectById(request.getPairingId());
        if (pairing == null || !"pending".equals(pairing.getStatus())
                || !pairing.getExpiresAt().isAfter(LocalDateTime.now(ZoneOffset.UTC))
                || !matches(request.getLoginSecret(), pairing.getLoginSecretHash())
                || !matches(request.getPairingCode(), pairing.getCodeHash())) throw exception(UNAUTHORIZED);
        validateUser(pairing.getOwnerUserId());
        var claim = new CallPhoneMobileController.PairingClaimReqVO();
        claim.setPairingCode(request.getPairingCode()); claim.setDisplayName(request.getDisplayName()); claim.setPlatform("android");
        var paired = mobileController.claimPairingForUser(claim, pairing.getOwnerUserId()).getData();
        if (paired == null) throw exception(UNAUTHORIZED);
        return success(issue(pairing.getOwnerUserId(), paired.getDeviceId(), paired.getDeviceKey()));
    }

    @PostMapping("/resume") @PermitAll
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public CommonResult<SessionResponse> resume(@RequestBody @Valid ResumeRequest request) {
        PairedDeviceDO device = deviceMapper.selectById(request.getDeviceId());
        if (device == null || !"paired".equals(device.getStatus())
                || !matches(request.getDeviceKey(), device.getDeviceKeyHash())) throw exception(DEVICE_NOT_ONLINE);
        validateUser(device.getOwnerUserId());
        return success(issue(device.getOwnerUserId(), device.getId(), null));
    }
    private void validateUser(Long id) {
        users.validateUser(id);
        if (!permissions.hasAnyPermissions(id, "callphone:device:pair:manage")) throw exception(UNAUTHORIZED);
    }
    private SessionResponse issue(Long userId, Long deviceId, String deviceKey) {
        var req = new OAuth2AccessTokenCreateReqDTO();
        req.setUserId(userId); req.setUserType(UserTypeEnum.ADMIN.getValue()); req.setClientId("default");
        req.setScopes(List.of(DEVICE_SCOPE + deviceId));
        var token = tokens.createAccessToken(req);
        SessionResponse result = new SessionResponse(); result.setUserId(userId.toString()); result.setDeviceId(deviceId.toString());
        result.setDeviceKey(deviceKey); result.setAccessToken(token.getAccessToken()); result.setRefreshToken(token.getRefreshToken());
        return result;
    }
    public static boolean matches(String raw, String hash) {
        return raw != null && hash != null && MessageDigest.isEqual(DeviceCredentialUtils.sha256(raw).getBytes(StandardCharsets.US_ASCII), hash.getBytes(StandardCharsets.US_ASCII));
    }
    @Data public static class ScanRequest {
        @NotNull private Long pairingId;
        @NotBlank @Pattern(regexp="[0-9]{6}") private String pairingCode;
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{43}") private String loginSecret;
        @NotBlank @Size(max=100) private String displayName;
    }
    @Data public static class ResumeRequest {
        @NotNull private Long deviceId;
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{43}") private String deviceKey;
    }
    @Data public static class SessionResponse {
        private String userId; private String deviceId; private String deviceKey;
        private String accessToken; private String refreshToken;
    }
}
