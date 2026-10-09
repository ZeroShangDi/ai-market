package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class MarketingLinkSaveReqVO {
    private Long id;
    @NotBlank @Size(max = 50) private String name;
    @NotBlank @Size(max = 2048) private String destinationUrl;
    @NotNull private Long channelId;
    @NotBlank @Size(max = 100) @Pattern(regexp = "^[A-Za-z0-9._-]+$") private String utmSource;
}
