package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class CustomerBatchAssignReqVO {
    @NotEmpty @Size(max = 100)
    private List<@NotNull Long> customerIds;
    @NotNull
    private Long ownerUserId;
}
