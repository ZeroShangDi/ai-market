package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class PosterCompositionRespVO {
    private Long id;
    private String name;
    private String title;
    private String templateId;
    private Long trackingCodeId;
    private String status;
    private LocalDateTime createTime;
}
