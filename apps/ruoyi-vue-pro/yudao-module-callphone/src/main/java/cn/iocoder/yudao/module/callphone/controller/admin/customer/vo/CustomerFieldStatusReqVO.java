package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CustomerFieldStatusReqVO {
    @NotNull private Long id;
    @NotNull private Boolean enabled;
}
