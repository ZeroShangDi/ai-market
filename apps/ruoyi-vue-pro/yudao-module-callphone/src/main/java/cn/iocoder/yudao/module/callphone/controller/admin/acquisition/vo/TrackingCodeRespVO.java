package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class TrackingCodeRespVO {
    private Long id;
    private String publicCode;
    private String name;
    private String codeType;
    private Long channelId;
    private Long employeeId;
    private String employeeName;
    private String storeName;
    private String matchRule;
    private String welcomeText;
    private String landingUrl;
    private String status;
    @Schema(description = "匿名扫码日聚合表统计的累计访问次数；不代表独立访客")
    private Long scans = 0L;
    @Schema(description = "当前用户负责且来源码匹配的线索数；不包含客户个人信息")
    private Long leads = 0L;
    private LocalDateTime createTime;
}
