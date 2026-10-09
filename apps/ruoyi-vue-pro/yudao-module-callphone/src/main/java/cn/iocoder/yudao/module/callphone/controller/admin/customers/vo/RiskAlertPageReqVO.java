package cn.iocoder.yudao.module.callphone.controller.admin.customers.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class RiskAlertPageReqVO extends PageParam {
    @Pattern(regexp = "|open|resolved", message = "预警状态无效")
    private String status;
    @Pattern(regexp = "|low|medium|high", message = "风险等级无效")
    private String severity;
}
