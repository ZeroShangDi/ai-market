package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;

import lombok.Data;

@Data
public class LeadBatchAssignResultVO {

    private Long id;
    private boolean success;
    private String outcome;
}
