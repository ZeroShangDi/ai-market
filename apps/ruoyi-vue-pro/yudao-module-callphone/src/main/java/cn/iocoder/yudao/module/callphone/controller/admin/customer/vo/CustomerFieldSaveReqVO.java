package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class CustomerFieldSaveReqVO {
    private Long id;
    @NotBlank @Pattern(regexp = "^[a-z][a-z0-9_]{1,63}$") private String fieldKey;
    @NotBlank @Size(max = 64) private String label;
    @NotBlank @Pattern(regexp = "^(text|number|date|select|multi_select|boolean)$") private String valueType;
    private Boolean required;
    @Size(max = 4000) private String optionsJson;
    private Boolean enabled;
    private Boolean listVisible;
    @Size(max = 100) private List<@Pattern(regexp = "^[a-z][a-z0-9_]{1,99}$") String> visibleRoleCodes;
    private Integer sort;
}
