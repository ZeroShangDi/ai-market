package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class AcquisitionChannelPageReqVO extends PageParam {
    private String query;
    private String status;
}
