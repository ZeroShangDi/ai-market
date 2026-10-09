package cn.iocoder.yudao.module.callphone.dal.dataobject.leads;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** Tenant-scoped pointer to the single rule used for new lead intake. */
@TableName("cp_lead_assignment_auto_config")
@Data
@EqualsAndHashCode(callSuper = true)
public class LeadAssignmentAutoConfigDO extends TenantBaseDO {

    @TableId
    private Long id;
    private Long ruleId;
    private Integer version;
    private Boolean recycleEnabled;
    private Integer recycleAfterDays;
}
