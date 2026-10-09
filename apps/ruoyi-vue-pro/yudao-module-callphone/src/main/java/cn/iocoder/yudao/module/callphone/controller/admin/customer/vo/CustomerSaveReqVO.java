package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Map;

@Data
public class CustomerSaveReqVO {
    private Long id;
    @NotBlank @Size(max = 80)
    private String name;
    @Pattern(regexp = "^$|^\\+?[0-9][0-9 -]{5,19}$")
    private String phone;
    @Size(max = 32)
    private String stage;
    @Size(max = 64)
    private String source;
    @Size(max = 512)
    private String tags;
    @Size(max = 40)
    private Map<String, Object> customFields;
}
