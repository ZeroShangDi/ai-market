package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.Data;

@Data
public class KnowledgeBaseSaveReqVO {
    private Long id;
    @NotBlank private String name;
    @Size(max = 300) private String description;
    @NotBlank private String visibility;
    @NotNull @Size(max = 50) private List<@NotNull @Positive Long> visibleDepartmentIds;
}
