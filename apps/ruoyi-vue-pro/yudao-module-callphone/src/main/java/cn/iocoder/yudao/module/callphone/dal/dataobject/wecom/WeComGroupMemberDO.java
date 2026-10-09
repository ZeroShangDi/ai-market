package cn.iocoder.yudao.module.callphone.dal.dataobject.wecom;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_wecom_group_member")
@Data
@EqualsAndHashCode(callSuper = true)
public class WeComGroupMemberDO extends TenantBaseDO {
    @TableId private Long id;
    private Long groupId;
    private String memberIdHash;
    private String memberIdCiphertext;
    private String memberType;
    private String memberNameCiphertext;
    private String memberInfoCiphertext;
    private LocalDateTime joinTime;
    private String joinScene;
    private Boolean isGroupAdmin;
    private Boolean isActive;
    private LocalDateTime lastSyncedAt;
}
