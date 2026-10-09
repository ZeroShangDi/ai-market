package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@TableName("cp_customer_stage_event")
@Data
@EqualsAndHashCode(callSuper = true)
public class CustomerStageEventDO extends TenantBaseDO {
    @TableId
    private Long id;
    private Long customerId;
    private String fromStage;
    private String toStage;
    private Long changedBy;
    private LocalDateTime changedAt;
    private String source;
}
