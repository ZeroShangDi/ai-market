package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.MobileCallEventDO;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MobileCallEventMapper extends BaseMapperX<MobileCallEventDO> {
    default MobileCallEventDO selectByDeviceEvent(Long deviceId, String deviceEventId) {
        return selectOne(new LambdaQueryWrapperX<MobileCallEventDO>()
                .eq(MobileCallEventDO::getDeviceId, deviceId)
                .eq(MobileCallEventDO::getDeviceEventId, deviceEventId));
    }

    default List<MobileCallEventDO> selectTimeline(Long callRecordId, Long dispatchId) {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MobileCallEventDO> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MobileCallEventDO>()
                        .and(query -> {
                            query.eq(MobileCallEventDO::getCallRecordId, callRecordId);
                            if (dispatchId != null) query.or().eq(MobileCallEventDO::getDispatchId, dispatchId);
                        });
        return selectList(wrapper.orderByAsc(MobileCallEventDO::getCreateTime)
                .orderByAsc(MobileCallEventDO::getId).last("LIMIT 50"));
    }
}
