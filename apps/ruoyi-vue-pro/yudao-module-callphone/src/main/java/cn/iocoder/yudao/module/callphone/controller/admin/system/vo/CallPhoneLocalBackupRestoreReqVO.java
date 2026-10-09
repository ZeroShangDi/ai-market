package cn.iocoder.yudao.module.callphone.controller.admin.system.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CallPhoneLocalBackupRestoreReqVO {
    @NotNull private Long backupId;
    @NotBlank private String previewToken;
    @NotBlank private String confirmText;
}
