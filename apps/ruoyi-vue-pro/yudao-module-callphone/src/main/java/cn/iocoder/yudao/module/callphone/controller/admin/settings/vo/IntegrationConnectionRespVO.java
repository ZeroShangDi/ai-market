package cn.iocoder.yudao.module.callphone.controller.admin.settings.vo;

import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class IntegrationConnectionRespVO {
    private Long id;
    private String provider;
    private String displayName;
    private String endpointUrl;
    private List<String> scopes;
    private Integer syncIntervalMinutes;
    private Boolean hasCredentials;
    private String status;
    private String lastErrorCode;
    private LocalDateTime lastCheckedAt;
    private Integer version;
}
