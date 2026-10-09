package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class FollowUpTaskRespVO {
    private Long id;
    private Long customerId;
    private String customerName;
    private String phoneDisplay;
    private Long ownerUserId;
    private String title;
    private String content;
    private LocalDateTime dueAt;
    private String status;
    private Long sourceCallRecordId;
    private LocalDateTime completedAt;
}
