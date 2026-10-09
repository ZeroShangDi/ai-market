package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.TrackingCodeSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.AcquisitionChannelDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.AcquisitionChannelMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TrackingCodeIdentityModeTest {

    private static final Long CHANNEL_ID = 710L;

    @Mock private TrackingCodeMapper trackingCodeMapper;
    @Mock private AcquisitionChannelMapper channelMapper;
    @Mock private AdminUserApi adminUserApi;

    private TrackingCodeServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new TrackingCodeServiceImpl();
        ReflectionTestUtils.setField(service, "trackingCodeMapper", trackingCodeMapper);
        ReflectionTestUtils.setField(service, "channelMapper", channelMapper);
        ReflectionTestUtils.setField(service, "adminUserApi", adminUserApi);
    }

    @Test
    void unsupportedIdentityRulesAreRejectedBeforeAnyCodeIsSaved() {
        AcquisitionChannelDO channel = new AcquisitionChannelDO();
        channel.setId(CHANNEL_ID);
        channel.setStatus("active");
        when(channelMapper.selectById(CHANNEL_ID)).thenReturn(channel);

        for (String rule : List.of("phone_exact", "wecom_identity")) {
            TrackingCodeSaveReqVO request = new TrackingCodeSaveReqVO();
            request.setName("识客活码");
            request.setCodeType("visitor_identification");
            request.setChannelId(CHANNEL_ID);
            request.setMatchRule(rule);
            request.setLandingUrl("https://example.test/contact");

            ServiceException error = assertThrows(ServiceException.class, () -> service.save(request));

            assertEquals(ErrorCodeConstants.TRACKING_CODE_IDENTITY_MATCH_UNAVAILABLE.getCode(), error.getCode());
            assertEquals("身份识别尚未接入，请选择匿名访问模式", error.getMessage());
        }

        verifyNoInteractions(trackingCodeMapper, adminUserApi);
    }
}
