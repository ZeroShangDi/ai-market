package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;

@Data
public class CustomerRespVO {
    private Long id;
    private String name;
    private String phoneDisplay;
    private String stage;
    private String source;
    private String tags;
    private Long ownerUserId;
    private String ownerName;
    private Map<String, Object> customFields;
    private LocalDateTime createTime;
}
