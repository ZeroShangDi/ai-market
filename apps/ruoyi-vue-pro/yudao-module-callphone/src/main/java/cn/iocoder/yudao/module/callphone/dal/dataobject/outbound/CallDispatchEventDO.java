package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@TableName("cp_call_dispatch_event")
@Data
@EqualsAndHashCode(callSuper = true)
public class CallDispatchEventDO extends TenantBaseDO {
    @TableId private Long id;
    private Long dispatchId;
    private String eventType;
    private String fromStatus;
    private String toStatus;
    private String actorType;
    private Long actorId;
    private Long deviceId;
    private String reasonCode;
    private LocalDateTime occurredAt;
}
