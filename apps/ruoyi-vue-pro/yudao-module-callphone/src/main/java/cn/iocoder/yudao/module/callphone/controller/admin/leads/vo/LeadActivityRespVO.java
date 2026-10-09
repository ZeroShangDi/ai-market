package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;
import lombok.Data;
import java.time.LocalDateTime;
@Data
public class LeadActivityRespVO {
    private Long id; private Long leadId; private String activityType; private String outcomeCode;
    private String note; private LocalDateTime nextFollowUpAt; private Long callRecordId; private LocalDateTime createTime;
}
