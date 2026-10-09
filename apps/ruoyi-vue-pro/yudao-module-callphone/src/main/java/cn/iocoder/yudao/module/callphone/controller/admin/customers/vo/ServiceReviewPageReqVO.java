package cn.iocoder.yudao.module.callphone.controller.admin.customers.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class ServiceReviewPageReqVO extends PageParam {

    @Pattern(regexp = "pass|needs_improvement", message = "质检状态无效")
    private String reviewStatus;
}
