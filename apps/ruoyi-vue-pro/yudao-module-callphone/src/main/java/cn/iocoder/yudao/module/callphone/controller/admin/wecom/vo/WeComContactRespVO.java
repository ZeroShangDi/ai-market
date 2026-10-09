package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class WeComContactRespVO {
    private Long id;
    private String name;
    private String externalType;
    private Integer gender;
    private String followUserKey;
    private String followUserName;
    private LocalDateTime firstAddedAt;
    private LocalDateTime lastInteractionAt;
    private LocalDateTime lastSyncedAt;
    private String remark;
    private String description;
    private List<String> tags;
    private boolean piiVisible;
}
