package cn.iocoder.yudao.module.callphone.controller.mobile;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.common.biz.system.oauth2.OAuth2TokenCommonApi;
import cn.iocoder.yudao.framework.common.biz.system.permission.PermissionCommonApi;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.*;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.*;
import cn.iocoder.yudao.module.callphone.util.DeviceCredentialUtils;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MobileSessionTest {
    final MobileSessionController controller = new MobileSessionController();
    final DesktopPairingCodeMapper codes = mock(DesktopPairingCodeMapper.class);
    final PairedDeviceMapper devices = mock(PairedDeviceMapper.class);
    final OAuth2TokenCommonApi tokens = mock(OAuth2TokenCommonApi.class);
    final AdminUserApi users = mock(AdminUserApi.class);
    final PermissionCommonApi permissions = mock(PermissionCommonApi.class);
    MobileSessionTest() {
        ReflectionTestUtils.setField(controller, "pairingCodeMapper", codes);
        ReflectionTestUtils.setField(controller, "deviceMapper", devices);
        ReflectionTestUtils.setField(controller, "tokens", tokens);
        ReflectionTestUtils.setField(controller, "users", users);
        ReflectionTestUtils.setField(controller, "permissions", permissions);
    }
    @Test void scanRejectsWrongSecretExpiredAndConsumedCodesBeforeIssuingTokens() {
        var code = new DesktopPairingCodeDO(); code.setId(1L); code.setOwnerUserId(7L); code.setStatus("pending");
        code.setExpiresAt(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(5));
        code.setCodeHash(DeviceCredentialUtils.sha256("123456")); code.setLoginSecretHash(DeviceCredentialUtils.sha256("a".repeat(43)));
        when(codes.selectById(1L)).thenReturn(code);
        var request = new MobileSessionController.ScanRequest(); request.setPairingId(1L); request.setPairingCode("123456"); request.setLoginSecret("b".repeat(43));
        assertThrows(ServiceException.class, () -> controller.scan(request));
        request.setLoginSecret("a".repeat(43)); code.setStatus("claimed");
        assertThrows(ServiceException.class, () -> controller.scan(request));
        code.setStatus("pending"); code.setExpiresAt(LocalDateTime.now(ZoneOffset.UTC).minusSeconds(1));
        assertThrows(ServiceException.class, () -> controller.scan(request));
        verifyNoInteractions(tokens, users);
    }
    @Test void resumeRejectsWrongKeyRevokedDeviceAndRemovedPermission() {
        var device = new PairedDeviceDO(); device.setId(10L); device.setOwnerUserId(7L); device.setStatus("paired"); device.setDeviceKeyHash(DeviceCredentialUtils.sha256("a".repeat(43)));
        when(devices.selectById(10L)).thenReturn(device);
        var request = new MobileSessionController.ResumeRequest(); request.setDeviceId(10L); request.setDeviceKey("b".repeat(43));
        assertThrows(ServiceException.class, () -> controller.resume(request));
        request.setDeviceKey("a".repeat(43)); device.setStatus("revoked");
        assertThrows(ServiceException.class, () -> controller.resume(request));
        device.setStatus("paired");
        assertThrows(ServiceException.class, () -> controller.resume(request));
        verifyNoInteractions(tokens);
    }
}
