package cn.iocoder.yudao.module.callphone.dal.dataobject.leads;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@TableName("cp_lead_conversion")
@Data
@EqualsAndHashCode(callSuper = true)
public class LeadConversionDO extends TenantBaseDO {
    @TableId private Long id;
    private Long leadId;
    private Long customerId;
    private String leadNameCiphertext;
    private String customerNameCiphertext;
    private String phoneDisplay;
    private String sourceCode;
    private Long convertedBy;
    private String noteCiphertext;
    private String idempotencyKey;
    private LocalDateTime convertedAt;
}
