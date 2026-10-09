package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import lombok.Data;

@Data
public class CustomerStageRespVO {
    private Long id;
    private String stageCode;
    private String name;
    private String color;
    private Integer sort;
    private Boolean enabled;
    private Boolean systemDefault;
    private Long customerCount;
}
