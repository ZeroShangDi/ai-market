package cn.iocoder.yudao.module.callphone.dal.dataobject.system;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_local_backup_job")
@Data
@EqualsAndHashCode(callSuper = true)
public class CallPhoneLocalBackupJobDO extends TenantBaseDO {
    @TableId private Long id;
    private String status;
    private Integer schemaVersion;
    private String artifactSha256;
    private Long artifactSize;
    private Integer tableCount;
    private Long rowCount;
    private LocalDateTime completedAt;
}
