package cn.iocoder.yudao.module.callphone.dal.mysql.acquisition;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.TrackingCodeScanDailyDO;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TrackingCodeScanDailyMapper extends BaseMapperX<TrackingCodeScanDailyDO> {

    @Insert("INSERT INTO cp_acquisition_tracking_scan_daily "
            + "(id, tenant_id, tracking_code_id, channel_id, event_day, counter_bucket, scan_count, creator, create_time, updater, update_time, deleted) "
            + "VALUES (#{id}, #{tenantId}, #{trackingCodeId}, #{channelId}, #{eventDay}, #{counterBucket}, 1, 'public-scan', CURRENT_TIMESTAMP(3), 'public-scan', CURRENT_TIMESTAMP(3), b'0') "
            + "ON DUPLICATE KEY UPDATE scan_count = scan_count + 1, updater = 'public-scan', update_time = CURRENT_TIMESTAMP(3)")
    int recordScan(@Param("id") Long id,
                   @Param("tenantId") Long tenantId,
                   @Param("trackingCodeId") Long trackingCodeId,
                   @Param("channelId") Long channelId,
                   @Param("eventDay") LocalDate eventDay,
                   @Param("counterBucket") int counterBucket);

    default List<Map<String, Object>> selectCodeTotals(Collection<Long> trackingCodeIds) {
        QueryWrapper<TrackingCodeScanDailyDO> query = new QueryWrapper<>();
        query.select("tracking_code_id AS trackingCodeId", "SUM(scan_count) AS scanCount")
                .in("tracking_code_id", trackingCodeIds)
                .groupBy("tracking_code_id");
        return selectMaps(query);
    }

    default List<Map<String, Object>> selectChannelTotals(Collection<Long> channelIds,
                                                           LocalDate fromDate,
                                                           LocalDate toDateExclusive) {
        QueryWrapper<TrackingCodeScanDailyDO> query = new QueryWrapper<>();
        query.select("channel_id AS channelId", "SUM(scan_count) AS visitCount")
                .in("channel_id", channelIds)
                .ge("event_day", fromDate)
                .lt("event_day", toDateExclusive)
                .groupBy("channel_id");
        return selectMaps(query);
    }
}
