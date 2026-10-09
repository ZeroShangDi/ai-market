package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class CustomerStageHistoryPageReqVO extends PageParam {
    @Min(1)
    @Max(100)
    private Integer pageSize = 20;
    private String stageCode;
}
