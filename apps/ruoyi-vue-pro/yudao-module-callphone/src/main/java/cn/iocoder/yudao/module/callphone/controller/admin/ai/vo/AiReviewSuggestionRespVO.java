package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import lombok.Data;

@Schema(description = "管理后台 - Call Phone 人工复核建议")
@Data
public class AiReviewSuggestionRespVO {

    private Long id;
    private String customerName;
    private Long callRecordId;
    private String sourceRunId;
    private LocalDateTime createdAt;
    private String riskLevel;
    private String suggestion;
    private String evidence;
    private String status;
    private String reviewerName;
    private LocalDateTime reviewedAt;
    private String reviewReason;
    private Integer version;
}
