package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import lombok.Data;

import java.util.List;

@Data
public class CustomerImportRespVO {
    private List<CustomerImportRowRespVO> rows;
    private Integer importedCount;
    private Integer duplicateCount;
    private Integer failedCount;
}
