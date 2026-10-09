package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class WeComGroupRespVO {
    private Long id;
    private String name;
    private String ownerKey;
    private String ownerName;
    private String status;
    private Integer memberCount;
    private LocalDateTime createdAt;
    private LocalDateTime lastSyncedAt;
    private boolean piiVisible;
    private List<MemberVO> members;

    @Data
    public static class MemberVO {
        private String name;
        private String type;
        private LocalDateTime joinedAt;
        private boolean groupAdmin;
    }
}
