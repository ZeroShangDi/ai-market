package cn.iocoder.yudao.module.callphone.controller.admin.system.vo;

import lombok.Data;

@Data
public class CallPhoneLocalBackupCreateRespVO {
    private CallPhoneLocalBackupRespVO backup;
    private String checksum;
}
