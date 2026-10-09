package cn.iocoder.yudao.module.callphone.controller.admin.outbound;

import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.DesktopPairingCodeDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.DesktopPairingCodeMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.PairedDeviceMapper;
import cn.iocoder.yudao.module.callphone.service.outbound.CallDispatchWorkflowService;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DevicePairingControllerTest {

    private final DesktopPairingCodeMapper pairingCodeMapper = mock(DesktopPairingCodeMapper.class);
    private final PairedDeviceMapper deviceMapper = mock(PairedDeviceMapper.class);
    private final CallDispatchWorkflowService workflowService = mock(CallDispatchWorkflowService.class);
    private final DevicePairingController controller = new DevicePairingController();

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), DesktopPairingCodeDO.class);
        ReflectionTestUtils.setField(controller, "pairingCodeMapper", pairingCodeMapper);
        ReflectionTestUtils.setField(controller, "deviceMapper", deviceMapper);
        ReflectionTestUtils.setField(controller, "callDispatchWorkflowService", workflowService);
        LoginUser loginUser = new LoginUser();
        loginUser.setId(7L);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void expiryPollReturnsConcurrentPhoneClaimInsteadOfStaleExpiredState() {
        DesktopPairingCodeDO pending = new DesktopPairingCodeDO();
        pending.setId(55L);
        pending.setOwnerUserId(7L);
        pending.setStatus("pending");
        pending.setExpiresAt(LocalDateTime.now(ZoneOffset.UTC).minusSeconds(1));

        DesktopPairingCodeDO claimed = new DesktopPairingCodeDO();
        claimed.setId(55L);
        claimed.setOwnerUserId(7L);
        claimed.setDeviceId(88L);
        claimed.setStatus("claimed");

        when(pairingCodeMapper.selectById(55L)).thenReturn(pending, claimed);
        when(pairingCodeMapper.update(isNull(), any())).thenReturn(0);

        DevicePairingController.PairingCodeRespVO response = controller.getCode(55L).getData();

        assertEquals("claimed", response.getStatus());
        assertEquals(88L, response.getDeviceId());
        verify(pairingCodeMapper, times(2)).selectById(55L);
    }
}
