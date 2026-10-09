package cn.iocoder.yudao.module.callphone.controller.admin.customers.vo;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class RiskRuleSaveReqVO {
    @NotNull private Long id;
    @NotNull private Integer version;
    @NotBlank @Pattern(regexp = "overdue_follow_up|stale_customer") private String ruleCode;
    @NotNull private Boolean enabled;
    @NotNull @Min(1) @Max(90) private Integer thresholdDays;
    @NotBlank @Pattern(regexp = "low|medium|high") private String severity;
}
