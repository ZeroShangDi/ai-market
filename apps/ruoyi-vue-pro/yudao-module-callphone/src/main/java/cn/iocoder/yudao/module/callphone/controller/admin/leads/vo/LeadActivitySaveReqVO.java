package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import java.time.LocalDateTime;
@Data
public class LeadActivitySaveReqVO {
    @NotNull private Long leadId;
    @NotBlank @Size(max = 24) private String activityType;
    @Size(max = 32) private String outcomeCode;
    @NotBlank @Size(max = 2000) private String note;
    private LocalDateTime nextFollowUpAt;
}
