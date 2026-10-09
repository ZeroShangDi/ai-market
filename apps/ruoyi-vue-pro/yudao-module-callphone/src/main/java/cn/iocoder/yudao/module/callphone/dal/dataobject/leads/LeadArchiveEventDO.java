package cn.iocoder.yudao.module.callphone.dal.dataobject.leads;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.time.LocalDateTime;

@TableName("cp_lead_archive_event")
@Data
@EqualsAndHashCode(callSuper = true)
public class LeadArchiveEventDO extends TenantBaseDO {
    @TableId private Long id;
    private Long leadId;
    private String leadNameCiphertext;
    private String phoneDisplay;
    private String archiveType;
    private String reasonCiphertext;
    private Long targetLeadId;
    private Long previousOwnerUserId;
    private String previousStatus;
    private Long archivedBy;
    private LocalDateTime archivedAt;
    private LocalDateTime restoredAt;
    private String idempotencyKey;
}
