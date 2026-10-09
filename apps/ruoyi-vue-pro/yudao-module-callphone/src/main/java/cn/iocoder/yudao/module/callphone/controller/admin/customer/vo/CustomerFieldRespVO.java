package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CustomerFieldRespVO {
    private Long id;
    private String fieldKey;
    private String label;
    private String valueType;
    private Boolean required;
    private String optionsJson;
    private Boolean enabled;
    private Boolean listVisible;
    private java.util.List<String> visibleRoleCodes;
    private Integer sort;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
