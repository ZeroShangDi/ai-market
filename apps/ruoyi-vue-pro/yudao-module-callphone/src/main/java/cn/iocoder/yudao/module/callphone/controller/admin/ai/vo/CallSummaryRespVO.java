package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class CallSummaryRespVO {

    private Long id;
    private Long callRecordId;
    private Long ownerUserId;
    private String customerName;
    private LocalDateTime callAt;
    private Integer durationSeconds;
    private String result;
    private String summary;
    private String customerNeeds;
    private String objections;
    private String nextStep;
    private String origin;
    private String reviewStatus;
    private Integer version;
    private LocalDateTime updateTime;
}
