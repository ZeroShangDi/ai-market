package cn.iocoder.yudao.module.callphone.controller.admin.customers.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@Schema(description = "管理后台 - Call Phone 风险预警")
public class RiskAlertRespVO {
    private Long id;
    private String ruleCode;
    private String ruleName;
    private String severity;
    private String status;
    private String sourceType;
    private Long sourceId;
    private Long customerId;
    private String customerName;
    private String phoneDisplay;
    private String sourceTitle;
    private String detail;
    private LocalDateTime createdAt;
    private LocalDateTime resolvedAt;
    private String resolverName;
    private String resolutionReason;
    private Integer version;
}
