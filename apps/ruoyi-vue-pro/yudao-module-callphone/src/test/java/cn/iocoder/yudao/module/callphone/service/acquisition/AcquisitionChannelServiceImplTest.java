package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionChannelSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.AcquisitionChannelDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.AcquisitionChannelMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AcquisitionChannelServiceImplTest {

    @Mock private AcquisitionChannelMapper channelMapper;
    @Mock private AdminUserApi adminUserApi;

    private AcquisitionChannelServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new AcquisitionChannelServiceImpl();
        ReflectionTestUtils.setField(service, "channelMapper", channelMapper);
        ReflectionTestUtils.setField(service, "adminUserApi", adminUserApi);
    }

    @Test
    void concurrentChannelCodeInsertReturnsDuplicateCodeError() {
        AcquisitionChannelDO concurrentWinner = new AcquisitionChannelDO();
        concurrentWinner.setId(2L);
        when(channelMapper.selectByChannelCode("spring-campaign")).thenReturn(null, concurrentWinner);
        doThrow(new DuplicateKeyException("unique channel code"))
                .when(channelMapper).insert(any(AcquisitionChannelDO.class));

        ServiceException error = assertThrows(ServiceException.class, () -> service.save(validRequest()));

        assertEquals(ErrorCodeConstants.ACQUISITION_CHANNEL_CODE_DUPLICATED.getCode(), error.getCode());
        assertEquals("渠道编码已被使用", error.getMessage());
        verify(channelMapper, times(2)).selectByChannelCode("spring-campaign");
    }

    @Test
    void unrelatedDuplicateKeyConflictKeepsDatabaseException() {
        DuplicateKeyException conflict = new DuplicateKeyException("primary key conflict");
        when(channelMapper.selectByChannelCode("spring-campaign")).thenReturn(null);
        doThrow(conflict).when(channelMapper).insert(any(AcquisitionChannelDO.class));

        DuplicateKeyException actual = assertThrows(DuplicateKeyException.class, () -> service.save(validRequest()));

        assertSame(conflict, actual);
    }

    private AcquisitionChannelSaveReqVO validRequest() {
        AcquisitionChannelSaveReqVO req = new AcquisitionChannelSaveReqVO();
        req.setName("春季投放");
        req.setPlatform("website");
        req.setChannelCode("spring-campaign");
        req.setAttributionWindowDays(30);
        return req;
    }
}
