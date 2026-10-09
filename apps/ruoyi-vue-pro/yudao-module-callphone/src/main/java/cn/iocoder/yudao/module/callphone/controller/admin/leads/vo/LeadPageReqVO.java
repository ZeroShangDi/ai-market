package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class LeadPageReqVO extends PageParam {
    private String sourceCode;
    private String query;
}
