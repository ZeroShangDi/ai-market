package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionAnalyticsReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionAnalyticsRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionAnalyticsRowVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.AcquisitionChannelDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.MarketingLinkDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.TrackingCodeDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.AcquisitionChannelMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.MarketingLinkMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeScanDailyMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadConversionMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class AcquisitionAnalyticsServiceImpl implements AcquisitionAnalyticsService {

    @Resource private AcquisitionChannelMapper channelMapper;
    @Resource private MarketingLinkMapper marketingLinkMapper;
    @Resource private TrackingCodeMapper trackingCodeMapper;
    @Resource private TrackingCodeScanDailyMapper scanDailyMapper;
    @Resource private LeadMapper leadMapper;
    @Resource private LeadConversionMapper conversionMapper;

    @Override
    public AcquisitionAnalyticsRespVO getSummary(AcquisitionAnalyticsReqVO reqVO, Long userId) {
        // Yudao fills these audit timestamps with the server's Shanghai local time.
        LocalDateTime from = reqVO.getFromDate().atStartOfDay();
        LocalDateTime to = reqVO.getToDate().plusDays(1).atStartOfDay();
        List<AcquisitionChannelDO> channels = channelMapper.selectList(new LambdaQueryWrapper<AcquisitionChannelDO>()
                .orderByAsc(AcquisitionChannelDO::getCreateTime).orderByAsc(AcquisitionChannelDO::getId));
        List<TrackingCodeDO> codes = channels.isEmpty() ? List.of() : trackingCodeMapper.selectList(
                new LambdaQueryWrapper<TrackingCodeDO>().in(TrackingCodeDO::getChannelId,
                        channels.stream().map(AcquisitionChannelDO::getId).toList()));

        Set<Long> channelIds = channels.stream().map(AcquisitionChannelDO::getId).collect(java.util.stream.Collectors.toSet());
        Map<Long, Long> visitCounts = new HashMap<>();
        if (!channelIds.isEmpty()) {
            for (Map<String, Object> stat : scanDailyMapper.selectChannelTotals(
                    channelIds, reqVO.getFromDate(), reqVO.getToDate().plusDays(1))) {
                Long channelId = asLongOrNull(stat.get("channelId"), stat.get("channel_id"));
                Long visitCount = asLongOrNull(stat.get("visitCount"), stat.get("visit_count"));
                if (channelId != null && visitCount != null) visitCounts.put(channelId, visitCount);
            }
        }
        Map<String, Long> channelBySourceCode = new HashMap<>();
        for (AcquisitionChannelDO channel : channels) addSourceCode(channel.getChannelCode(), channel.getId(), channelIds, channelBySourceCode);
        for (TrackingCodeDO code : codes) {
            addSourceCode(code.getPublicCode(), code.getChannelId(), channelIds, channelBySourceCode);
        }
        List<MarketingLinkDO> links = channelIds.isEmpty() ? List.of() : marketingLinkMapper.selectList(
                new LambdaQueryWrapper<MarketingLinkDO>().in(MarketingLinkDO::getChannelId, channelIds));
        for (MarketingLinkDO link : links) {
            addSourceCode(link.getPublicCode(), link.getChannelId(), channelIds, channelBySourceCode);
        }
        List<String> sourceCodes = new ArrayList<>(channelBySourceCode.keySet());
        Map<Long, Long> leadCounts = new HashMap<>();
        Map<Long, Long> validLeadCounts = new HashMap<>();
        Map<Long, Long> conversionCounts = new HashMap<>();
        for (Map<String, Object> stat : leadMapper.selectAcquisitionStats(sourceCodes, userId, from, to)) {
            Long channelId = channelBySourceCode.get(stat.get("sourceCode"));
            if (channelId != null) {
                leadCounts.merge(channelId, asLong(stat.get("leadCount")), Long::sum);
                validLeadCounts.merge(channelId, asLong(stat.get("validLeadCount")), Long::sum);
            }
        }
        Map<Long, AcquisitionChannelDO> channelsById = new HashMap<>();
        channels.forEach(channel -> channelsById.put(channel.getId(), channel));
        Map<Integer, List<String>> sourceCodesByWindow = new HashMap<>();
        channelBySourceCode.forEach((sourceCode, channelId) -> {
            AcquisitionChannelDO channel = channelsById.get(channelId);
            if (channel != null) {
                sourceCodesByWindow.computeIfAbsent(attributionWindowDays(channel), ignored -> new ArrayList<>())
                        .add(sourceCode);
            }
        });
        for (Map.Entry<Integer, List<String>> entry : sourceCodesByWindow.entrySet()) {
            for (Map<String, Object> stat : conversionMapper.selectAcquisitionStatsWithinWindow(
                    entry.getValue(), userId, from, to, entry.getKey())) {
                Long channelId = channelBySourceCode.get(stat.get("sourceCode"));
                if (channelId != null) conversionCounts.merge(channelId, asLong(stat.get("conversionCount")), Long::sum);
            }
        }

        LocalDateTime updatedAt = LocalDateTime.now();
        List<AcquisitionAnalyticsRowVO> rows = new ArrayList<>();
        for (AcquisitionChannelDO channel : channels) {
            long leads = leadCounts.getOrDefault(channel.getId(), 0L);
            long validLeads = validLeadCounts.getOrDefault(channel.getId(), 0L);
            long conversions = conversionCounts.getOrDefault(channel.getId(), 0L);
            AcquisitionAnalyticsRowVO row = new AcquisitionAnalyticsRowVO();
            row.setChannelId(channel.getId());
            row.setChannelName(channel.getName());
            row.setPlatform(channel.getPlatform());
            row.setAttributionWindowDays(attributionWindowDays(channel));
            row.setVisitCount(visitCounts.getOrDefault(channel.getId(), 0L));
            row.setLeadCount(leads);
            row.setValidLeadCount(validLeads);
            row.setConversionCount(conversions);
            row.setConversionRate(validLeads == 0 ? null : (int) Math.round(conversions * 100.0 / validLeads));
            row.setUpdatedAt(updatedAt);
            rows.add(row);
        }
        AcquisitionAnalyticsRespVO response = new AcquisitionAnalyticsRespVO();
        response.setFromDate(reqVO.getFromDate());
        response.setToDate(reqVO.getToDate());
        response.setScope("本人负责的线索与转化");
        response.setLeadMetricBasis("线索创建日期；有效线索为未归档的本人线索；转化按本人转化记录且须在对应渠道归因窗口内发生");
        response.setVisitMetricState("匿名扫码次数按上海自然日汇总；不识别独立访客，也不保存 IP、设备标识或身份信息");
        response.setUpdatedAt(updatedAt);
        response.setChannels(rows);
        return response;
    }

    private int attributionWindowDays(AcquisitionChannelDO channel) {
        Integer days = channel.getAttributionWindowDays();
        return days == null || days < 1 || days > 365 ? 30 : days;
    }

    private void addSourceCode(String sourceCode, Long channelId, Set<Long> channelIds,
                               Map<String, Long> channelBySourceCode) {
        if (sourceCode == null || sourceCode.isBlank() || !channelIds.contains(channelId)) return;
        channelBySourceCode.put(sourceCode, channelId);
    }

    private long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }

    private Long asLongOrNull(Object camelCaseValue, Object snakeCaseValue) {
        Object value = camelCaseValue == null ? snakeCaseValue : camelCaseValue;
        return value instanceof Number number ? number.longValue() : null;
    }
}
