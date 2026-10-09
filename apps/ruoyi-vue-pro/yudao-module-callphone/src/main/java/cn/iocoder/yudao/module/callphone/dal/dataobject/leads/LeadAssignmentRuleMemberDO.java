package cn.iocoder.yudao.module.callphone.dal.dataobject.leads;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_lead_assignment_rule_member")
@Data
@EqualsAndHashCode(callSuper = true)
public class LeadAssignmentRuleMemberDO extends TenantBaseDO {
    @TableId
    private Long id;
    private Long ruleId;
    private Long userId;
    private Integer sortNo;
}
