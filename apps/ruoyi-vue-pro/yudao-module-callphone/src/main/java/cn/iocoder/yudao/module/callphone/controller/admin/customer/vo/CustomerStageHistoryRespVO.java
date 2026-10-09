package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CustomerStageHistoryRespVO {
    private Long id;
    private Long customerId;
    private String customerName;
    private String fromStage;
    private String fromStageName;
    private String toStage;
    private String toStageName;
    private LocalDateTime changedAt;
    private String source;
}
