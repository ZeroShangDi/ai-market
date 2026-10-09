package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.TrackingCodePageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.TrackingCodeDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeScanDailyMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TrackingCodeServiceAttributionTest {

    private static final Long USER_ID = 22L;
    private static final Long TRACKING_CODE_ID = 901L;
    private static final String PUBLIC_CODE = "afc8329d67e24506b74df2c1d32f8160";

    @Mock private TrackingCodeMapper trackingCodeMapper;
    @Mock private TrackingCodeScanDailyMapper scanDailyMapper;
    @Mock private LeadMapper leadMapper;

    private TrackingCodeServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new TrackingCodeServiceImpl();
        ReflectionTestUtils.setField(service, "trackingCodeMapper", trackingCodeMapper);
        ReflectionTestUtils.setField(service, "scanDailyMapper", scanDailyMapper);
        ReflectionTestUtils.setField(service, "leadMapper", leadMapper);
    }

    @Test
    void pageShowsAnonymousScansAndOnlyCurrentUsersAttributedLeadCount() {
        TrackingCodePageReqVO reqVO = new TrackingCodePageReqVO();
        TrackingCodeDO code = new TrackingCodeDO();
        code.setId(TRACKING_CODE_ID);
        code.setPublicCode(PUBLIC_CODE);
        code.setName("活动二维码");
        PageResult<TrackingCodeDO> page = new PageResult<>(List.of(code), 1L);

        when(trackingCodeMapper.selectPage(reqVO)).thenReturn(page);
        when(scanDailyMapper.selectCodeTotals(List.of(TRACKING_CODE_ID)))
                .thenReturn(List.of(Map.of("trackingCodeId", TRACKING_CODE_ID, "scanCount", 18L)));
        when(leadMapper.selectAttributionCounts(List.of(PUBLIC_CODE), USER_ID))
                .thenReturn(List.of(Map.of("sourceCode", PUBLIC_CODE, "leadCount", 3L)));

        PageResult<TrackingCodeDO> result = service.getPage(reqVO, USER_ID);

        assertEquals(1L, result.getTotal());
        assertEquals(18L, result.getList().get(0).getScans());
        assertEquals(3L, result.getList().get(0).getLeads());
        verify(leadMapper).selectAttributionCounts(List.of(PUBLIC_CODE), USER_ID);
    }
}
