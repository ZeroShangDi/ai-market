package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class AiReviewSuggestionPageReqVO extends PageParam {

    @Pattern(regexp = "|pending|approved|edited|rejected|reviewed", message = "复核状态无效")
    private String status;
    @Pattern(regexp = "|low|medium|high", message = "风险等级无效")
    private String riskLevel;
    @Pattern(regexp = "[0-9]*", message = "请使用通话编号搜索")
    private String query;
    private Long callRecordId;
}
