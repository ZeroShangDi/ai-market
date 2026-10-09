package cn.iocoder.yudao.module.callphone.controller.admin.settings.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import lombok.Data;

@Data
public class IntegrationConnectionSaveReqVO {
    private Long id;
    @NotBlank @Size(max = 32) private String provider;
    @NotBlank @Size(max = 80) private String displayName;
    @Size(max = 255) private String endpointUrl;
    @Size(max = 12) private List<@Size(max = 80) String> scopes;
    @NotNull private Integer syncIntervalMinutes;
    @Size(max = 12) private Map<@Size(max = 40) String, @Size(max = 512) String> credentials;
    @NotNull private Integer expectedVersion;
}
