package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class PosterCompositionSaveReqVO {
    private Long id;
    @NotBlank @Size(max = 48) private String name;
    @NotBlank @Size(max = 36) private String title;
    @NotBlank @Pattern(regexp = "^(sunset|ocean|mint)$") private String templateId;
    @NotNull private Long trackingCodeId;
}
