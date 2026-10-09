package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class RecommendationSourceRespVO {
    private Long callRecordId;
    private String customerName;
    private LocalDateTime callAt;
    private String summaryOrigin;
    private String nextStep;
    private Integer summaryVersion;
}
