package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchDO;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface CallDispatchMapper extends BaseMapperX<CallDispatchDO> {

    default List<Long> selectLeadIdsWithActiveDispatch(List<Long> leadIds) {
        if (leadIds == null || leadIds.isEmpty()) return List.of();
        return selectList(new LambdaQueryWrapperX<CallDispatchDO>()
                .select(CallDispatchDO::getLeadId)
                .in(CallDispatchDO::getLeadId, leadIds)
                .in(CallDispatchDO::getStatus, List.of("queued", "accepted")))
                .stream().map(CallDispatchDO::getLeadId).distinct().toList();
    }
}
