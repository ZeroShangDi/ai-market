package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class WeComCampaignActionReqVO {
    @NotNull private Long id;
    @NotNull @Min(1) private Integer expectedVersion;
}
