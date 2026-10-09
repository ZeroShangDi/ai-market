package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionAnalyticsReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.AcquisitionChannelDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.MarketingLinkDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.TrackingCodeDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.AcquisitionChannelMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.MarketingLinkMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeScanDailyMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadConversionMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AcquisitionAttributionServiceTest {

    private static final Long CHANNEL_ID = 91L;
    private static final Long USER_ID = 22L;
    private static final String LINK_CODE = "8ec8d4d2f215a9b7f2de71365848c224";

    @Mock private AcquisitionChannelMapper channelMapper;
    @Mock private TrackingCodeMapper trackingCodeMapper;
    @Mock private TrackingCodeScanDailyMapper scanDailyMapper;
    @Mock private MarketingLinkMapper marketingLinkMapper;
    @Mock private LeadMapper leadMapper;
    @Mock private LeadConversionMapper conversionMapper;

    private AcquisitionAnalyticsServiceImpl service;

    @BeforeAll
    static void initTableInfo() {
        MybatisConfiguration configuration = new MybatisConfiguration();
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "");
        TableInfoHelper.initTableInfo(assistant, AcquisitionChannelDO.class);
        TableInfoHelper.initTableInfo(assistant, TrackingCodeDO.class);
        TableInfoHelper.initTableInfo(assistant, MarketingLinkDO.class);
    }

    @BeforeEach
    void setUp() {
        service = new AcquisitionAnalyticsServiceImpl();
        ReflectionTestUtils.setField(service, "channelMapper", channelMapper);
        ReflectionTestUtils.setField(service, "trackingCodeMapper", trackingCodeMapper);
        ReflectionTestUtils.setField(service, "scanDailyMapper", scanDailyMapper);
        ReflectionTestUtils.setField(service, "marketingLinkMapper", marketingLinkMapper);
        ReflectionTestUtils.setField(service, "leadMapper", leadMapper);
        ReflectionTestUtils.setField(service, "conversionMapper", conversionMapper);
    }

    @Test
    void marketingLinkSourceCodeIsCountedUnderItsChannel() {
        AcquisitionChannelDO channel = new AcquisitionChannelDO();
        channel.setId(CHANNEL_ID);
        channel.setName("官网投放");
        channel.setPlatform("website");
        channel.setChannelCode("website");
        channel.setAttributionWindowDays(30);
        when(channelMapper.selectList(any())).thenReturn(List.of(channel));
        when(trackingCodeMapper.selectList(any())).thenReturn(List.of());

        MarketingLinkDO link = new MarketingLinkDO();
        link.setPublicCode(LINK_CODE);
        link.setChannelId(CHANNEL_ID);
        when(marketingLinkMapper.selectList(any())).thenReturn(List.of(link));
        when(scanDailyMapper.selectChannelTotals(eq(Set.of(CHANNEL_ID)), eq(LocalDate.of(2026, 10, 1)),
                eq(LocalDate.of(2026, 10, 4)))).thenReturn(List.of());

        LocalDateTime from = LocalDate.of(2026, 10, 1).atStartOfDay();
        LocalDateTime to = LocalDate.of(2026, 10, 4).atStartOfDay();
        when(leadMapper.selectAcquisitionStats(argThat(codes -> codes.contains(LINK_CODE)), eq(USER_ID), eq(from), eq(to)))
                .thenReturn(List.of(Map.of("sourceCode", LINK_CODE, "leadCount", 3L, "validLeadCount", 2L)));
        when(conversionMapper.selectAcquisitionStatsWithinWindow(
                argThat(codes -> codes.contains(LINK_CODE)), eq(USER_ID), eq(from), eq(to), eq(30)))
                .thenReturn(List.of(Map.of("sourceCode", LINK_CODE, "conversionCount", 1L)));

        AcquisitionAnalyticsReqVO req = new AcquisitionAnalyticsReqVO();
        req.setFromDate(LocalDate.of(2026, 10, 1));
        req.setToDate(LocalDate.of(2026, 10, 3));

        var result = service.getSummary(req, USER_ID);

        assertEquals(1, result.getChannels().size());
        assertEquals(3L, result.getChannels().get(0).getLeadCount());
        assertEquals(2L, result.getChannels().get(0).getValidLeadCount());
        assertEquals(1L, result.getChannels().get(0).getConversionCount());
        assertEquals(50, result.getChannels().get(0).getConversionRate());
    }

    @Test
    void conversionMetricsUseEachChannelsConfiguredAttributionWindow() {
        AcquisitionChannelDO shortWindowChannel = new AcquisitionChannelDO();
        shortWindowChannel.setId(CHANNEL_ID);
        shortWindowChannel.setName("官网短窗");
        shortWindowChannel.setPlatform("website");
        shortWindowChannel.setChannelCode("website-short");
        shortWindowChannel.setAttributionWindowDays(7);

        AcquisitionChannelDO longWindowChannel = new AcquisitionChannelDO();
        longWindowChannel.setId(CHANNEL_ID + 1);
        longWindowChannel.setName("官网长窗");
        longWindowChannel.setPlatform("website");
        longWindowChannel.setChannelCode("website-long");
        longWindowChannel.setAttributionWindowDays(90);

        when(channelMapper.selectList(any())).thenReturn(List.of(shortWindowChannel, longWindowChannel));
        when(trackingCodeMapper.selectList(any())).thenReturn(List.of());
        when(marketingLinkMapper.selectList(any())).thenReturn(List.of());

        LocalDate fromDate = LocalDate.of(2026, 10, 1);
        LocalDateTime from = fromDate.atStartOfDay();
        LocalDateTime to = fromDate.plusDays(1).atStartOfDay();
        when(scanDailyMapper.selectChannelTotals(eq(Set.of(CHANNEL_ID, CHANNEL_ID + 1)), eq(fromDate), eq(fromDate.plusDays(1))))
                .thenReturn(List.of());
        when(leadMapper.selectAcquisitionStats(anyList(), eq(USER_ID), eq(from), eq(to))).thenReturn(List.of());
        when(conversionMapper.selectAcquisitionStatsWithinWindow(
                eq(List.of("website-short")), eq(USER_ID), eq(from), eq(to), eq(7)))
                .thenReturn(List.of(Map.of("sourceCode", "website-short", "conversionCount", 1L)));
        when(conversionMapper.selectAcquisitionStatsWithinWindow(
                eq(List.of("website-long")), eq(USER_ID), eq(from), eq(to), eq(90)))
                .thenReturn(List.of(Map.of("sourceCode", "website-long", "conversionCount", 2L)));

        AcquisitionAnalyticsReqVO req = new AcquisitionAnalyticsReqVO();
        req.setFromDate(fromDate);
        req.setToDate(fromDate);

        var result = service.getSummary(req, USER_ID);

        assertEquals(7, result.getChannels().get(0).getAttributionWindowDays());
        assertEquals(1L, result.getChannels().get(0).getConversionCount());
        assertEquals(90, result.getChannels().get(1).getAttributionWindowDays());
        assertEquals(2L, result.getChannels().get(1).getConversionCount());
        verify(conversionMapper).selectAcquisitionStatsWithinWindow(
                eq(List.of("website-short")), eq(USER_ID), eq(from), eq(to), eq(7));
        verify(conversionMapper).selectAcquisitionStatsWithinWindow(
                eq(List.of("website-long")), eq(USER_ID), eq(from), eq(to), eq(90));
    }

    @Test
    void publicRedirectPreservesDestinationAndAddsLinkAttributionCode() {
        MarketingLinkServiceImpl linkService = new MarketingLinkServiceImpl();
        ReflectionTestUtils.setField(linkService, "marketingLinkMapper", marketingLinkMapper);
        MarketingLinkDO link = new MarketingLinkDO();
        link.setPublicCode(LINK_CODE);
        link.setDestinationUrl("https://example.test/form?existing=1&cp_ref=stale#signup");
        link.setUtmSource("website_spring");
        link.setStatus("active");
        when(marketingLinkMapper.selectByPublicCode(LINK_CODE)).thenReturn(link);
        when(marketingLinkMapper.incrementClicks(eq(LINK_CODE), any(LocalDateTime.class))).thenReturn(1);

        String destination = linkService.registerClickAndGetDestination(LINK_CODE).orElseThrow();
        var query = org.springframework.web.util.UriComponentsBuilder.fromUri(URI.create(destination))
                .build(true).getQueryParams();

        assertEquals(List.of("1"), query.get("existing"));
        assertEquals(List.of("website_spring"), query.get("utm_source"));
        assertEquals(List.of(LINK_CODE), query.get("cp_ref"));
        assertTrue(destination.endsWith("#signup"));
    }

    @Test
    void marketingLinkLeadCountUsesOnlyItsPublicSourceCode() {
        MarketingLinkServiceImpl linkService = new MarketingLinkServiceImpl();
        ReflectionTestUtils.setField(linkService, "leadMapper", leadMapper);
        when(leadMapper.selectAttributionCounts(eq(List.of(LINK_CODE)), eq(USER_ID)))
                .thenReturn(List.of(Map.of("sourceCode", LINK_CODE, "leadCount", 4L)));

        Map<String, Long> counts = linkService.getLeadCounts(List.of(LINK_CODE), USER_ID);

        assertEquals(4L, counts.get(LINK_CODE));
        assertEquals(Map.of(), linkService.getLeadCounts(List.of(" ", ""), USER_ID));
        assertEquals(Map.of(), linkService.getLeadCounts(List.of(LINK_CODE), null));
    }
}
