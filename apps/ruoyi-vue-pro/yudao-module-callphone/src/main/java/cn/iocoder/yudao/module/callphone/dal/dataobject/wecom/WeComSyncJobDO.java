package cn.iocoder.yudao.module.callphone.dal.dataobject.wecom;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_wecom_sync_job")
@Data
@EqualsAndHashCode(callSuper = true)
public class WeComSyncJobDO extends TenantBaseDO {
    @TableId private Long id;
    private Long requestedBy;
    private String resourceType;
    private String ownerUserIdHash;
    private String ownerUserIdCiphertext;
    private String idempotencyKey;
    private String status;
    private Integer total;
    private Integer processed;
    private Integer succeeded;
    private Integer failed;
    private String errorCode;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
}
