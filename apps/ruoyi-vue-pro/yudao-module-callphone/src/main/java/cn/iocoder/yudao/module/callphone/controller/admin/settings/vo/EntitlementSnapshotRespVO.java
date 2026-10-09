package cn.iocoder.yudao.module.callphone.controller.admin.settings.vo;

import java.util.List;
import lombok.Data;

@Data
public class EntitlementSnapshotRespVO {
    private String state;
    private String planCode;
    private String planName;
    private String status;
    private String expiresAt;
    private String checkedAt;
    private String billingUrl;
    private String message;
    private Integer pairedDeviceCount;
    private Integer pairedDeviceLimit;
    private List<FeatureVO> features;

    @Data
    public static class FeatureVO {
        private String code;
        private String name;
        private Boolean enabled;
        private Integer used;
        private Integer limit;
    }
}
