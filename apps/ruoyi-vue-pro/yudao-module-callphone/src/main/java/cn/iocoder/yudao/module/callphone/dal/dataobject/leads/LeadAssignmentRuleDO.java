package cn.iocoder.yudao.module.callphone.dal.dataobject.leads;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_lead_assignment_rule")
@Data
@EqualsAndHashCode(callSuper = true)
public class LeadAssignmentRuleDO extends TenantBaseDO {
    @TableId
    private Long id;
    private String ruleName;
    private Boolean enabled;
    private Integer cursorIndex;
    private Integer version;
}
