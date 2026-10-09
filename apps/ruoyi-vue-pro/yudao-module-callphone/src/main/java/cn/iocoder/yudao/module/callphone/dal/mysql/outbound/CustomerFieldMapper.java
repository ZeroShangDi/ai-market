package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerFieldDO;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface CustomerFieldMapper extends BaseMapperX<CustomerFieldDO> {
    default List<CustomerFieldDO> selectAllOrdered() {
        return selectList(new LambdaQueryWrapperX<CustomerFieldDO>()
                .orderByAsc(CustomerFieldDO::getSort).orderByAsc(CustomerFieldDO::getId));
    }

    default List<CustomerFieldDO> selectEnabledOrdered() {
        return selectList(new LambdaQueryWrapperX<CustomerFieldDO>().eq(CustomerFieldDO::getEnabled, true)
                .orderByAsc(CustomerFieldDO::getSort).orderByAsc(CustomerFieldDO::getId));
    }

    default CustomerFieldDO selectByFieldKey(String fieldKey) {
        return selectOne(new LambdaQueryWrapperX<CustomerFieldDO>().eq(CustomerFieldDO::getFieldKey, fieldKey));
    }
}
