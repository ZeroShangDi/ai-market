package cn.iocoder.yudao.module.callphone.dal.dataobject.wecom;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_wecom_contact")
@Data
@EqualsAndHashCode(callSuper = true)
public class WeComContactDO extends TenantBaseDO {
    @TableId private Long id;
    private String externalUserIdHash;
    private String externalUserIdCiphertext;
    private String nameSearchHash;
    private String nameCiphertext;
    private String profileCiphertext;
    private String externalType;
    private Integer gender;
    private LocalDateTime firstAddedAt;
    private LocalDateTime externalCreatedAt;
    private LocalDateTime lastInteractionAt;
    private LocalDateTime lastSyncedAt;
    private Integer version;
}
