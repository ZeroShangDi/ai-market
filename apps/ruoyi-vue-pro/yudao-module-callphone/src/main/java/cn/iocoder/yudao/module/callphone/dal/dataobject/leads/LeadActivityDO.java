package cn.iocoder.yudao.module.callphone.dal.dataobject.leads;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.time.LocalDateTime;

@TableName("cp_lead_activity")
@Data
@EqualsAndHashCode(callSuper = true)
public class LeadActivityDO extends TenantBaseDO {
    @TableId private Long id;
    private Long leadId;
    private Long ownerUserId;
    private Long actorUserId;
    private String activityType;
    private String outcomeCode;
    private String noteCiphertext;
    private LocalDateTime nextFollowUpAt;
    private Long callRecordId;
}
