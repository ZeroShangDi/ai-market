package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class WeComCampaignAuditRespVO {
    private String action;
    private Long actorId;
    private String actorName;
    private String note;
    private Integer campaignVersion;
    private LocalDateTime createTime;
}
