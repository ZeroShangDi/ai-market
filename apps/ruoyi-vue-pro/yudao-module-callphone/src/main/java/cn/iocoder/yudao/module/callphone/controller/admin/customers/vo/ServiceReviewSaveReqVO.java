package cn.iocoder.yudao.module.callphone.controller.admin.customers.vo;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ServiceReviewSaveReqVO {

    @NotNull
    private Long callRecordId;
    @NotNull
    @Min(0)
    private Integer expectedVersion;
    @NotNull
    @Min(0)
    @Max(100)
    private Integer score;
    @NotNull
    private Boolean identifyOk;
    @NotNull
    private Boolean consentOk;
    @NotNull
    private Boolean needCaptured;
    @NotNull
    private Boolean resultAccurate;
    @NotNull
    private Boolean nextStepClear;
    @Size(max = 2000)
    private String note;
}
