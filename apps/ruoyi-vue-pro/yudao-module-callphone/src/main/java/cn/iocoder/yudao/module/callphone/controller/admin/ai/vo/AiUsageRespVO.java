package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/** Safe audit metadata only. Does not expose AI input, output or stored source text. */
@Data
public class AiUsageRespVO {

    private Long id;
    private Long actorUserId;
    private String actorName;
    private String feature;
    private String sourceType;
    private Long sourceId;
    private String modelKey;
    private String promptVersion;
    private String status;
    private Integer latencyMs;
    private Integer inputTokens;
    private Integer outputTokens;
    private BigDecimal estimatedCost;
    private String errorCode;
    private LocalDateTime createdAt;
    private Integer feedbackRating;
    private String feedbackReason;
}
