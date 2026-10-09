package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class CustomerBatchTagsReqVO {
    @NotEmpty @Size(max = 100)
    private List<@NotNull Long> customerIds;
    @NotNull @Pattern(regexp = "^(append|replace|clear)$")
    private String mode;
    @Size(max = 20)
    private List<@Size(max = 32) String> tags;
}
