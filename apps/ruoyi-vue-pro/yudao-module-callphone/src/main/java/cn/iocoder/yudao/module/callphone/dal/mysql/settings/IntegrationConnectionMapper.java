package cn.iocoder.yudao.module.callphone.dal.mysql.settings;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.settings.IntegrationConnectionDO;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface IntegrationConnectionMapper extends BaseMapperX<IntegrationConnectionDO> {
    default List<IntegrationConnectionDO> selectTenantList() {
        return selectList(new LambdaQueryWrapperX<IntegrationConnectionDO>()
                .orderByAsc(IntegrationConnectionDO::getProvider));
    }
    default IntegrationConnectionDO selectByProvider(String provider) {
        return selectOne(new LambdaQueryWrapperX<IntegrationConnectionDO>()
                .eq(IntegrationConnectionDO::getProvider, provider));
    }
}
