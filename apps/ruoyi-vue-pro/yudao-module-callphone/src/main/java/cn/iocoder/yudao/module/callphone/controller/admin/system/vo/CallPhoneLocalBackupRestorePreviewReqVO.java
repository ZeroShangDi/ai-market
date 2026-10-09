package cn.iocoder.yudao.module.callphone.controller.admin.system.vo;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CallPhoneLocalBackupRestorePreviewReqVO {
    @NotNull private Long backupId;
}
