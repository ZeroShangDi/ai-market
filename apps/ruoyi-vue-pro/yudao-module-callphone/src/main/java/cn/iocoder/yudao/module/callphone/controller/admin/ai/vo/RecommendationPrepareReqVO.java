package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class RecommendationPrepareReqVO {
    @NotNull private Long callRecordId;
}
