package cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CallRecordRespVO {

    private Long id;
    private Long customerId;
    private Long callDispatchId;
    private String customerName;
    private String phoneDisplay;
    private String direction;
    private Long ownerUserId;
    private String ownerName;
    private Long deviceId;
    private String deviceName;
    private String status;
    private String resultCode;
    private LocalDateTime startedAt;
    private LocalDateTime endedAt;
    private Integer durationSeconds;
    private String recordingState;
    private String summaryState;
    private String nextStep;
    private String note;
    private Integer version;
    private LocalDateTime createTime;
}
