package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AcquisitionChannelSaveReqVO {
    private Long id;
    @NotBlank @Size(max = 48) private String name;
    @NotBlank private String platform;
    @NotBlank @Pattern(regexp = "^[a-z0-9]+(?:-[a-z0-9]+)*$") @Size(max = 32) private String channelCode;
    private Long ownerUserId;
    @NotNull @Min(1) @Max(365) private Integer attributionWindowDays;
}
