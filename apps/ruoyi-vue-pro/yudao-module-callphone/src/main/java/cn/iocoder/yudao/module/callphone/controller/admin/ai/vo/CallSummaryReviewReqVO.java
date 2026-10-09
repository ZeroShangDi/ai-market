package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CallSummaryReviewReqVO {

    @NotNull private Long callRecordId;
    @NotNull private Integer expectedVersion;
}
