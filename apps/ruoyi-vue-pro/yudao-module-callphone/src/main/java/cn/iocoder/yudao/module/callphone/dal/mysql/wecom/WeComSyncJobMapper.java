package cn.iocoder.yudao.module.callphone.dal.mysql.wecom;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComSyncJobDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WeComSyncJobMapper extends BaseMapperX<WeComSyncJobDO> {
    default WeComSyncJobDO selectByRequestAndKey(Long requestedBy, String key) {
        return selectOne(new LambdaQueryWrapperX<WeComSyncJobDO>()
                .eq(WeComSyncJobDO::getRequestedBy, requestedBy).eq(WeComSyncJobDO::getIdempotencyKey, key));
    }

    default WeComSyncJobDO selectByOwnerAndRequest(Long id, Long requestedBy, String resourceType) {
        return selectOne(new LambdaQueryWrapperX<WeComSyncJobDO>()
                .eq(WeComSyncJobDO::getId, id).eq(WeComSyncJobDO::getRequestedBy, requestedBy)
                .eq(WeComSyncJobDO::getResourceType, resourceType));
    }
}
