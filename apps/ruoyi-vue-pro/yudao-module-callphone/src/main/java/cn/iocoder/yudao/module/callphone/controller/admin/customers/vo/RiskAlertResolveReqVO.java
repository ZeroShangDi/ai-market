package cn.iocoder.yudao.module.callphone.controller.admin.customers.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class RiskAlertResolveReqVO {
    @NotNull private Long id;
    @NotNull private Integer expectedVersion;
    @NotBlank @Size(min = 4, max = 1000) private String reason;
}
