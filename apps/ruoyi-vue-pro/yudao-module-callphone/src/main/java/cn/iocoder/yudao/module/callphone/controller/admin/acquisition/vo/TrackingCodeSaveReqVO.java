package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class TrackingCodeSaveReqVO {
    private Long id;
    @NotBlank @Size(max = 48) private String name;
    @NotBlank @Pattern(regexp = "^(channel|employee|store|visitor_identification)$") private String codeType;
    @NotNull private Long channelId;
    private Long employeeId;
    @Size(max = 64) private String storeName;
    @Pattern(regexp = "^(phone_exact|wecom_identity|anonymous_only)?$") private String matchRule;
    @Size(max = 500) private String welcomeText;
    @NotBlank @Size(max = 2048) private String landingUrl;
}
