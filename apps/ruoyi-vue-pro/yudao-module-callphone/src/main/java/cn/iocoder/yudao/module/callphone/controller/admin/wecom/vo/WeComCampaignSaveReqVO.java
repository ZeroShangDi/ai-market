package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class WeComCampaignSaveReqVO {
    private Long id;
    @NotBlank @Size(max = 80) private String name;
    @NotBlank @Size(max = 5000) private String content;
    @NotBlank @Size(max = 128) private String ownerKey;
    @Size(max = 128) private String tag;
    @NotNull @Min(0) private Integer expectedVersion;
}
