package cn.iocoder.yudao.module.callphone.controller.admin.system.vo;

import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class CallPhoneLocalBackupPreviewRespVO {
    private Long backupId;
    private Integer schemaVersion;
    private Long snapshotTenantId;
    private Long currentTenantId;
    private Integer tableCount;
    private Long backupRowCount;
    private Long currentRowCount;
    private LocalDateTime createdAt;
    private LocalDateTime tokenExpiresAt;
    private String previewToken;
    private List<TableDiff> tables;

    @Data
    public static class TableDiff {
        private String tableName;
        private Long backupRows;
        private Long currentRows;
    }
}
