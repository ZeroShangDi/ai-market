package cn.iocoder.yudao.module.callphone.controller.admin.customers.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ServiceReviewRespVO {

    private Long id;
    private Long callRecordId;
    private String customerName;
    private String phoneDisplay;
    private LocalDateTime callAt;
    private Integer durationSeconds;
    private String result;
    private String recordingState;
    private Integer score;
    private String reviewStatus;
    private Boolean identifyOk;
    private Boolean consentOk;
    private Boolean needCaptured;
    private Boolean resultAccurate;
    private Boolean nextStepClear;
    private String note;
    private String reviewerName;
    private LocalDateTime reviewedAt;
    private Integer version;
}
