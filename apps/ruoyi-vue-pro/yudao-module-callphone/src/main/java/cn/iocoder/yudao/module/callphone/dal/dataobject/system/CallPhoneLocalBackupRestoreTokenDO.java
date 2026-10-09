package cn.iocoder.yudao.module.callphone.dal.dataobject.system;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_local_backup_restore_token")
@Data
@EqualsAndHashCode(callSuper = true)
public class CallPhoneLocalBackupRestoreTokenDO extends TenantBaseDO {
    @TableId private Long id;
    private Long backupId;
    private Long actorUserId;
    private String tokenHash;
    private String artifactSha256;
    private LocalDateTime expiresAt;
    private LocalDateTime consumedAt;
}
