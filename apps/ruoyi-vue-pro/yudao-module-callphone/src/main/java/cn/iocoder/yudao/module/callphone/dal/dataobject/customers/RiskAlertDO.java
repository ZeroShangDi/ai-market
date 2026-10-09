package cn.iocoder.yudao.module.callphone.dal.dataobject.customers;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_risk_alert")
@Data
@EqualsAndHashCode(callSuper = true)
public class RiskAlertDO extends TenantBaseDO {
    @TableId private Long id;
    private String ruleCode;
    private Long ownerUserId;
    private Long customerId;
    private String sourceType;
    private Long sourceId;
    private String severity;
    private String status;
    private String detailCiphertext;
    private String resolutionReasonCiphertext;
    private Long resolverId;
    private LocalDateTime resolvedAt;
    private Integer version;
}
