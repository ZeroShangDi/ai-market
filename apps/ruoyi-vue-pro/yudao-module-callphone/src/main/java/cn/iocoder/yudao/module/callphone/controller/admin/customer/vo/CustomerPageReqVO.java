package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class CustomerPageReqVO extends PageParam {
    private String query;
    private String stage;
}
