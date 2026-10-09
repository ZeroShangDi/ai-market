package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class WeComCampaignRespVO {
    private Long id;
    private String name;
    private String content;
    private String ownerKey;
    private String tag;
    private String status;
    private Integer estimatedRecipientCount;
    private LocalDateTime estimatedAt;
    private Integer version;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
