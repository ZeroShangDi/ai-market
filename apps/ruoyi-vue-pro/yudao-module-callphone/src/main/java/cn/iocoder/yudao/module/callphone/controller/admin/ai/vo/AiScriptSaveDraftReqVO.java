package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.Data;

@Data
public class AiScriptSaveDraftReqVO {
    private Long id;
    @NotBlank @Size(max = 80)
    private String name;
    @Size(max = 32)
    private String stageCode;
    @NotBlank @Size(max = 24)
    private String channel;
    @Size(max = 12)
    private List<@Size(max = 32) String> tags;
    @NotBlank @Size(max = 3000)
    private String content;
    @Size(max = 24)
    private List<@Size(max = 40) String> variables;
}
