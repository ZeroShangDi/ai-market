package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class LeadSaveReqVO {
    @NotBlank @Size(max = 80) private String name;
    @NotBlank @Pattern(regexp = "^\\+?[0-9][0-9 -]{5,19}$") private String phone;
    @Size(max = 64) private String sourceCode;
    @Min(0) @Max(100) private Integer score;
}
