package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class WeComCampaignEstimateRespVO {
    private Integer count;
    private LocalDateTime estimatedAt;
    private String basis;
    private Integer version;
}
