package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class LeadConversionRespVO {
    private Long id;
    private Long leadId;
    private Long customerId;
    private String leadName;
    private String customerName;
    private String phoneDisplay;
    private String sourceCode;
    private Long convertedBy;
    private String converterName;
    private String note;
    private LocalDateTime convertedAt;
}
