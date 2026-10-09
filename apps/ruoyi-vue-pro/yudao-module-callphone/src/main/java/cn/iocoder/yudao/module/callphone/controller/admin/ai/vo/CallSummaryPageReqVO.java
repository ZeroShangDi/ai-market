package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class CallSummaryPageReqVO extends PageParam {

    @Pattern(regexp = "draft|reviewed", message = "复核状态无效")
    private String reviewStatus;
    private Long callRecordId;
    @Pattern(regexp = "[0-9]*", message = "请使用通话编号搜索")
    private String query;
}
