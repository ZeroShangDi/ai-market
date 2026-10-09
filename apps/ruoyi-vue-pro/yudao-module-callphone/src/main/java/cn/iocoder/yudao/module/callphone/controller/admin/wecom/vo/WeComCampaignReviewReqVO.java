package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class WeComCampaignReviewReqVO {
    @NotNull private Long id;
    @NotNull @Min(1) private Integer expectedVersion;
    @Size(max = 1000) private String note;
}
