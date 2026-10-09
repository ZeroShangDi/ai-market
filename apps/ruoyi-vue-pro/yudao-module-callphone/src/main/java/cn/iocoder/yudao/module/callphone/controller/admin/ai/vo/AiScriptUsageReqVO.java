package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class AiScriptUsageReqVO {
    @NotBlank
    @Pattern(regexp = "^copy$")
    private String action;
}
