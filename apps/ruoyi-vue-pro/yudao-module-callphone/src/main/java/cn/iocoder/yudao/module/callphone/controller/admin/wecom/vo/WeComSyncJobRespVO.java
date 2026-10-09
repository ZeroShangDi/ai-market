package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class WeComSyncJobRespVO {
    private Long id;
    private String status;
    private Integer total;
    private Integer processed;
    private Integer succeeded;
    private Integer failed;
    private String errorCode;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
}
