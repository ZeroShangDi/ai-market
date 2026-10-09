package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class WeComArchiveSyncStatusRespVO {
    private boolean enabled;
    private String status;
    private String reason;
    private String errorCode;
    private LocalDateTime lastSyncAt;
}
