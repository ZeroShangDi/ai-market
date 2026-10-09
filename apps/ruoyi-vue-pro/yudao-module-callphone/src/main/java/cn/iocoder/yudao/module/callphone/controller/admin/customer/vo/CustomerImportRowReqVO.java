package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Map;

@Data
public class CustomerImportRowReqVO {
    private Integer rowNo;

    @NotBlank
    @Size(max = 80)
    private String name;

    @NotBlank
    @Pattern(regexp = "^\\+?[0-9][0-9 -]{5,19}$")
    private String phone;

    @Size(max = 32)
    private String stage;

    @Size(max = 64)
    private String source;

    @Size(max = 512)
    private String tags;

    private Map<String, Object> customFields;

    @NotBlank
    @Size(min = 16, max = 80)
    @Pattern(regexp = "^[A-Za-z0-9._:-]+$")
    private String idempotencyKey;
}
