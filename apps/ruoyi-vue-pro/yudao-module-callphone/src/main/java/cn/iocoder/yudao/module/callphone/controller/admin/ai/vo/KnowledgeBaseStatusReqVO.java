package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class KnowledgeBaseStatusReqVO {
    @NotNull private Long id;
    @NotNull private String status;
}
