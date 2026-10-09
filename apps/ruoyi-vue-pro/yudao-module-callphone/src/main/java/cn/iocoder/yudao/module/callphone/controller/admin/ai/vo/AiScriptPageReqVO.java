package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

@Data
@ToString(callSuper = true)
@EqualsAndHashCode(callSuper = true)
public class AiScriptPageReqVO extends PageParam {
    private String query;
    private String stageCode;
    private String channel;
    private String status;
}
