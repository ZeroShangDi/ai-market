package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class LeadAssignmentHistoryRespVO {
    private Long id;
    private Long leadId;
    private Long fromUserId;
    private String fromUserName;
    private Long toUserId;
    private String toUserName;
    private Long actorUserId;
    private String actorName;
    private Long ruleId;
    @Schema(description = "assign/reassign/recycle/claim/convert/archive/restore")
    private String action;
    private String reason;
    private LocalDateTime occurredAt;
}
