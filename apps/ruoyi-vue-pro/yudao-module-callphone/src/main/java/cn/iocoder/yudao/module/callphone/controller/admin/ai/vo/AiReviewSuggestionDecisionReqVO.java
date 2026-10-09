package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
@Schema(description = "管理后台 - 复核 AI 建议请求")
public class AiReviewSuggestionDecisionReqVO {

    @NotNull private Long id;
    @NotNull private Integer expectedVersion;
    @NotBlank
    @Pattern(regexp = "approved|edited|rejected", message = "复核决定无效")
    private String decision;
    @Size(max = 4000)
    private String suggestion;
    @NotBlank @Size(min = 4, max = 2000)
    private String reason;
}
