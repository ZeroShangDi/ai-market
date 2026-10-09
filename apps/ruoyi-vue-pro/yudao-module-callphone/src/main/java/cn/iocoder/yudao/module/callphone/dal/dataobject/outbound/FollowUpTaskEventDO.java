package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_follow_up_task_event")
@Data
@EqualsAndHashCode(callSuper = true)
public class FollowUpTaskEventDO extends TenantBaseDO {
    @TableId private Long id;
    private Long taskId;
    private Long actorUserId;
    private String eventType;
    private String fromStatus;
    private String toStatus;
}
