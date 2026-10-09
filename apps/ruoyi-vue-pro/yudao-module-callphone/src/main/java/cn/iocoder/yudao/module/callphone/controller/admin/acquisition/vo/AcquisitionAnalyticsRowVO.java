package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class AcquisitionAnalyticsRowVO {
    private Long channelId;
    private String channelName;
    private String platform;
    private Integer attributionWindowDays;
    private Long visitCount;
    private Long leadCount;
    private Long validLeadCount;
    private Long conversionCount;
    private Integer conversionRate;
    private LocalDateTime updatedAt;
}
