package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_customer")
@Data
@EqualsAndHashCode(callSuper = true)
public class CustomerDO extends TenantBaseDO {
    @TableId private Long id;
    private String nameCiphertext;
    private String phoneCiphertext;
    private String phoneDisplay;
    private String stage;
    private String source;
    private String tags;
    private String customFieldsCiphertext;
    private Long ownerUserId;
    /** Stable per-row import key; used only to make CSV retries idempotent. */
    private String importKey;
    private String status;
}
