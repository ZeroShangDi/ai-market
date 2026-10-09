package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import lombok.Data;

@Data
public class WeComArchiveCleanupRespVO {
    private Integer deletedCount;
    private Long remainingCount;
}
