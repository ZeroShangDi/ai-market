package cn.iocoder.yudao.module.callphone.dal.dataobject.wecom;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_wecom_group")
@Data
@EqualsAndHashCode(callSuper = true)
public class WeComGroupDO extends TenantBaseDO {
    @TableId private Long id;
    private String chatIdHash;
    private String chatIdCiphertext;
    private String nameSearchHash;
    private String profileCiphertext;
    private String ownerUserIdHash;
    private String ownerUserIdCiphertext;
    private String ownerNameCiphertext;
    private String groupStatus;
    private Integer memberCount;
    private LocalDateTime createdAt;
    private LocalDateTime lastSyncedAt;
}
