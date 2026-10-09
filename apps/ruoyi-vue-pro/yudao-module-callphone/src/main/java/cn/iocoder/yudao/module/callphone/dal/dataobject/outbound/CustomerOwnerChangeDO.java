package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_customer_owner_change")
@Data
@EqualsAndHashCode(callSuper = true)
public class CustomerOwnerChangeDO extends TenantBaseDO {
    @TableId private Long id;
    private Long customerId;
    private Long fromOwnerUserId;
    private Long toOwnerUserId;
    private Long actorUserId;
}
