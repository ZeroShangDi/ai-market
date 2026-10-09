package cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class CallRecordEventRespVO {
    private Long id;
    private String eventType;
    private LocalDateTime occurredAt;
}
