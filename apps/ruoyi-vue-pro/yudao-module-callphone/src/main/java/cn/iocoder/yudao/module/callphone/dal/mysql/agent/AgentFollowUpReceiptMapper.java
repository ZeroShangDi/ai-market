package cn.iocoder.yudao.module.callphone.dal.mysql.agent;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.agent.AgentFollowUpReceiptDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentFollowUpReceiptMapper extends BaseMapperX<AgentFollowUpReceiptDO> {
    default AgentFollowUpReceiptDO find(String taskId, Long tenantId, Long userId) {
        return selectOne(new LambdaQueryWrapperX<AgentFollowUpReceiptDO>()
                .eq(AgentFollowUpReceiptDO::getAgentTaskId, taskId)
                .eq(AgentFollowUpReceiptDO::getTenantId, tenantId)
                .eq(AgentFollowUpReceiptDO::getOwnerUserId, userId));
    }
}
