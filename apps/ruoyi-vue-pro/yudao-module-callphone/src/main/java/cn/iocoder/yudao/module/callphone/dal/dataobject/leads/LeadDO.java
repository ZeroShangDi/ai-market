package cn.iocoder.yudao.module.callphone.dal.dataobject.leads;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_lead")
@Data
@EqualsAndHashCode(callSuper = true)
public class LeadDO extends TenantBaseDO {
    @TableId private Long id;
    private String nameCiphertext;
    private String phoneCiphertext;
    private String phoneDisplay;
    private String sourceCode;
    private Integer score;
    private Long ownerUserId;
    private String status;
    private String idempotencyKey;
}
