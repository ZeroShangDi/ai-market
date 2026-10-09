package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class LeadAssignmentHistoryPageReqVO extends PageParam {
    @NotNull
    private Long leadId;
}
