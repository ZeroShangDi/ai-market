package cn.iocoder.yudao.module.callphone.dal.dataobject.wecom;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_wecom_contact_owner")
@Data
@EqualsAndHashCode(callSuper = true)
public class WeComContactOwnerDO extends TenantBaseDO {
    @TableId private Long id;
    private Long contactId;
    private String ownerUserIdHash;
    private String ownerUserIdCiphertext;
    private String ownerNameCiphertext;
    private String followInfoCiphertext;
    private LocalDateTime firstFollowedAt;
    private LocalDateTime lastSyncedAt;
}
