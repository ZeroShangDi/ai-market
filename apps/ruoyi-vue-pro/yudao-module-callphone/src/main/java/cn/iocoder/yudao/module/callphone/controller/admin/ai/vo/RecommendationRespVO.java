package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class RecommendationRespVO {
    private Long id;
    private Long customerId;
    private String customerName;
    private Long callRecordId;
    private LocalDateTime callAt;
    private String sourceSummaryOrigin;
    private String content;
    private String status;
    private String reviewReason;
    private LocalDateTime dueAt;
    private Long followUpTaskId;
    private Integer version;
    private LocalDateTime updateTime;
}
