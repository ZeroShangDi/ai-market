package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.TrackingCodeDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeScanDailyMapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TrackingCodePublicScanTest {

    private static final String PUBLIC_CODE = "afc8329d67e24506b74df2c1d32f8160";
    private static final long TENANT_ID = 73L;
    private static final long CODE_ID = 901L;
    private static final long CHANNEL_ID = 92L;
    private static final long EMPLOYEE_ID = 44L;

    @Mock private TrackingCodeMapper trackingCodeMapper;
    @Mock private TrackingCodeScanDailyMapper scanDailyMapper;

    private TrackingCodeServiceImpl service;

    @BeforeAll
    static void initTableInfo() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), TrackingCodeDO.class);
    }

    @BeforeEach
    void setUp() {
        service = new TrackingCodeServiceImpl();
        ReflectionTestUtils.setField(service, "trackingCodeMapper", trackingCodeMapper);
        ReflectionTestUtils.setField(service, "scanDailyMapper", scanDailyMapper);
    }

    @Test
    void employeeCodeRedirectPreservesEmployeeTypeAndAggregatesOnlyAnonymousScan() {
        TrackingCodeDO code = new TrackingCodeDO();
        code.setId(CODE_ID);
        code.setTenantId(TENANT_ID);
        code.setChannelId(CHANNEL_ID);
        code.setEmployeeId(EMPLOYEE_ID);
        code.setPublicCode(PUBLIC_CODE);
        code.setCodeType("employee");
        code.setStatus("active");
        code.setLandingUrl("https://example.test/form?campaign=summer#contact");
        when(trackingCodeMapper.selectList(any())).thenReturn(List.of(code));

        var destination = service.registerPublicScanAndGetDestination(PUBLIC_CODE).orElseThrow();

        var uri = UriComponentsBuilder.fromUriString(destination).build(true);
        assertEquals("summer", uri.getQueryParams().getFirst("campaign"));
        assertEquals("callphone", uri.getQueryParams().getFirst("utm_source"));
        assertEquals(PUBLIC_CODE, uri.getQueryParams().getFirst("cp_ref"));
        assertEquals("employee", uri.getQueryParams().getFirst("cp_type"));
        assertEquals("contact", uri.getFragment());

        ArgumentCaptor<LocalDate> eventDay = ArgumentCaptor.forClass(LocalDate.class);
        ArgumentCaptor<Integer> bucket = ArgumentCaptor.forClass(Integer.class);
        verify(scanDailyMapper).recordScan(anyLong(), eq(TENANT_ID), eq(CODE_ID), eq(CHANNEL_ID),
                eventDay.capture(), bucket.capture());
        assertEquals(LocalDate.now(ZoneId.of("Asia/Shanghai")), eventDay.getValue());
        assertTrue(bucket.getValue() >= 0 && bucket.getValue() < 16);
    }

    @Test
    void disabledEmployeeCodeDoesNotRedirectOrIncrementScans() {
        TrackingCodeDO code = new TrackingCodeDO();
        code.setId(CODE_ID);
        code.setTenantId(TENANT_ID);
        code.setChannelId(CHANNEL_ID);
        code.setEmployeeId(EMPLOYEE_ID);
        code.setPublicCode(PUBLIC_CODE);
        code.setCodeType("employee");
        code.setStatus("disabled");
        code.setLandingUrl("https://example.test/form");
        when(trackingCodeMapper.selectList(any())).thenReturn(List.of(code));

        assertTrue(service.registerPublicScanAndGetDestination(PUBLIC_CODE).isEmpty());

        org.mockito.Mockito.verifyNoInteractions(scanDailyMapper);
    }
}
