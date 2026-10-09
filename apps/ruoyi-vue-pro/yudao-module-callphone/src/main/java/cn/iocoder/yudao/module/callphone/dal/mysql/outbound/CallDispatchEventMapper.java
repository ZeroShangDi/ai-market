package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchEventDO;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface CallDispatchEventMapper extends BaseMapperX<CallDispatchEventDO> {
    default List<CallDispatchEventDO> selectByDispatchId(Long dispatchId) {
        return selectList(new LambdaQueryWrapperX<CallDispatchEventDO>()
                .eq(CallDispatchEventDO::getDispatchId, dispatchId)
                .orderByAsc(CallDispatchEventDO::getOccurredAt)
                .orderByAsc(CallDispatchEventDO::getId));
    }
}
