package cn.iocoder.yudao.module.callphone.controller.admin.system.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class CallPhoneLocalBackupRespVO {
    private Long id;
    private String status;
    private Integer schemaVersion;
    private Long artifactSize;
    private Integer tableCount;
    private Long rowCount;
    private LocalDateTime completedAt;
    private LocalDateTime createTime;
}
