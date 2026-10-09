package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import lombok.Data;

@Data
public class CustomerImportRowRespVO {
    private Integer rowNo;
    private String status;
    private String message;
    private Long customerId;
}
