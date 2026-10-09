package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class WeComArchiveRespVO {
    private Long id;
    private String conversationRef;
    private String conversationType;
    private String messageType;
    private LocalDateTime messageTime;
    private Integer participantCount;
    private LocalDateTime expiresAt;
}
