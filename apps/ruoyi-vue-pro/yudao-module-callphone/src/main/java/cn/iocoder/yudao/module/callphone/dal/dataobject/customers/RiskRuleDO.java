package cn.iocoder.yudao.module.callphone.dal.dataobject.customers;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_risk_rule")
@Data
@EqualsAndHashCode(callSuper = true)
public class RiskRuleDO extends TenantBaseDO {
    @TableId private Long id;
    private String ruleCode;
    private String name;
    private String description;
    private Boolean enabled;
    private Integer thresholdDays;
    private String severity;
    private Integer version;
}
