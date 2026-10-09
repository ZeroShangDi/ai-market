package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class RecommendationUpdateReqVO {
    @NotNull private Long id;
    @NotNull private Integer expectedVersion;
    @NotBlank @Size(max = 1200) private String content;
    @NotNull @Future private LocalDateTime dueAt;
}
