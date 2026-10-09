package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class RecommendationPageReqVO extends PageParam {

    @Pattern(regexp = "|pending|adopted|dismissed", message = "建议状态无效")
    private String status;
    @Pattern(regexp = "[0-9]*", message = "请使用通话编号搜索")
    private String query;
    private Long callRecordId;
}
