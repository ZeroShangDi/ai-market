package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@TableName("cp_follow_up_task")
@Data
@EqualsAndHashCode(callSuper = true)
public class FollowUpTaskDO extends TenantBaseDO {
    @TableId private Long id;
    private Long customerId;
    private Long ownerUserId;
    private String titleCiphertext;
    private String contentCiphertext;
    private LocalDateTime dueAt;
    private String status;
    private Long sourceCallRecordId;
    private LocalDateTime completedAt;
}
