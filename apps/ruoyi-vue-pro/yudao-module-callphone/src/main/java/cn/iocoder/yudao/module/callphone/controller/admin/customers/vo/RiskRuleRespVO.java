package cn.iocoder.yudao.module.callphone.controller.admin.customers.vo;

import lombok.Data;

@Data
public class RiskRuleRespVO {
    private Long id;
    private String ruleCode;
    private String name;
    private String description;
    private Boolean enabled;
    private Integer thresholdDays;
    private String severity;
    private Integer version;
}
