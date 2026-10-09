package cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo;

import lombok.Data;

@Data
public class CallRecordSummaryRespVO {
    private Long outboundCount;
    private Double outboundConnectRate;
    private Long todayOutboundCount;
    private Long durationSeconds;
    private Long averageDurationSeconds;
    private Long pendingFollowUpCount;
    private Long dueTodayFollowUpCount;
}
