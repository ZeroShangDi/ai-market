package cn.iocoder.yudao.module.callphone.dal.dataobject.leads;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_lead_assignment")
@Data
@EqualsAndHashCode(callSuper = true)
public class LeadAssignmentDO extends TenantBaseDO {
    @TableId private Long id;
    private Long leadId;
    private Long fromUserId;
    private Long toUserId;
    private Long actorUserId;
    private Long ruleId;
    private String action;
    private String reason;
}
