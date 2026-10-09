package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CustomerStageSaveReqVO {
    private Long id;
    @NotBlank @Pattern(regexp = "^[a-z][a-z0-9_]{1,31}$") private String stageCode;
    @NotBlank @Size(max = 32) private String name;
    @NotBlank @Pattern(regexp = "^#[0-9A-Fa-f]{6}$") private String color;
    private Integer sort;
    private Boolean enabled;
}
