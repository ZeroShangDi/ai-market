package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CallSummarySaveReqVO {

    @NotNull private Long callRecordId;
    @NotBlank @Size(max = 1200) private String summary;
    @Size(max = 600) private String customerNeeds;
    @Size(max = 600) private String objections;
    @Size(max = 600) private String nextStep;
    @NotNull private Integer expectedVersion;
}
