package cn.iocoder.yudao.module.callphone.dal.dataobject.agent;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** Committed in the same transaction as the business write; never stores model content. */
@TableName("cp_agent_followup_receipt")
@Data
@EqualsAndHashCode(callSuper = true)
public class AgentFollowUpReceiptDO extends TenantBaseDO {
    @TableId private Long id;
    private String agentTaskId;
    private Long ownerUserId;
    private Long customerId;
    private Long followUpTaskId;
}
