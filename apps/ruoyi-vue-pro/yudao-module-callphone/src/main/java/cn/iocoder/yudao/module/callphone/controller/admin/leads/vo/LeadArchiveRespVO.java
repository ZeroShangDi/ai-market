package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;
import lombok.Data;
import java.time.LocalDateTime;
@Data
public class LeadArchiveRespVO {
    private Long id; private Long leadId; private String leadName; private String phoneDisplay;
    private String archiveType; private String reason; private Long targetLeadId;
    private String previousStatus; private LocalDateTime archivedAt; private LocalDateTime restoredAt;
}
