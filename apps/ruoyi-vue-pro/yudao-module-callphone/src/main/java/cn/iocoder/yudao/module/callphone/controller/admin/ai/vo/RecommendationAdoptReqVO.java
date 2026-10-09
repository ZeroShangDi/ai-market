package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class RecommendationAdoptReqVO {
    @NotNull private Long id;
    @NotNull private Integer expectedVersion;
    @NotBlank @Size(max = 120) private String title;
    @NotNull @Future private LocalDateTime dueAt;
}
