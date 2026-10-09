package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class WeComCampaignPageReqVO extends PageParam {
    @Pattern(regexp = "|draft|pending_review|withdrawn")
    private String status;
}
