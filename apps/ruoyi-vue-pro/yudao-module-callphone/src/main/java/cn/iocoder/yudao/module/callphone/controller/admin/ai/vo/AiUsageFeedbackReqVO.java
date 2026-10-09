package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AiUsageFeedbackReqVO {

    @NotNull
    @Min(1)
    @Max(5)
    private Integer rating;

    @Size(max = 40)
    @Pattern(regexp = "^(accurate|useful|irrelevant|incorrect)?$")
    private String reasonCode;

    @Size(max = 500)
    private String comment;
}
