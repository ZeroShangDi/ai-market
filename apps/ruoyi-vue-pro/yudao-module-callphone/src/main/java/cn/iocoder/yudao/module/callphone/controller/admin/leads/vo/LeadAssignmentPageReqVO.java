package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class LeadAssignmentPageReqVO extends PageParam {
    private String status;
    private Long ownerUserId;
    private String query;
}
