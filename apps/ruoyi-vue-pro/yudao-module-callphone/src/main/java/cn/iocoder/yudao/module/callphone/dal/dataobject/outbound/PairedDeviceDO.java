package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.time.LocalDateTime;

@TableName("cp_device")
@Data
@EqualsAndHashCode(callSuper = true)
public class PairedDeviceDO extends TenantBaseDO {
    @TableId private Long id;
    private Long ownerUserId;
    private String displayName;
    private String platform;
    private String status;
    private LocalDateTime lastSeenAt;
    private String deviceKeyHash;
}
