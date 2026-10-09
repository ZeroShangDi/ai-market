package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class AcquisitionChannelRespVO {
    private Long id;
    private String name;
    private String platform;
    private String channelCode;
    private Long ownerUserId;
    private String ownerName;
    private Integer attributionWindowDays;
    private String status;
    private LocalDateTime createdAt;
}
