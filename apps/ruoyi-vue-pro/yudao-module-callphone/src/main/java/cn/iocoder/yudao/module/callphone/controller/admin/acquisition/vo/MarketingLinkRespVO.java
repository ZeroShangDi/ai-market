package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class MarketingLinkRespVO {
    private Long id;
    private String publicCode;
    private String name;
    private String destinationUrl;
    private Long channelId;
    private String utmSource;
    private String status;
    private Long clickCount;
    private Long leadCount;
    private LocalDateTime lastClickedAt;
    private LocalDateTime createTime;
}
