package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerStageDO;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface CustomerStageMapper extends BaseMapperX<CustomerStageDO> {
    default List<CustomerStageDO> selectEnabledOrdered() {
        return selectList(new LambdaQueryWrapperX<CustomerStageDO>()
                .eq(CustomerStageDO::getEnabled, true)
                .orderByAsc(CustomerStageDO::getSort).orderByAsc(CustomerStageDO::getId));
    }

    default List<CustomerStageDO> selectEnabledForUpdate() {
        return selectList(new LambdaQueryWrapperX<CustomerStageDO>()
                .eq(CustomerStageDO::getEnabled, true)
                .orderByAsc(CustomerStageDO::getId)
                .last("FOR UPDATE"));
    }

    default CustomerStageDO selectByCode(String stageCode) {
        return selectOne(new LambdaQueryWrapperX<CustomerStageDO>().eq(CustomerStageDO::getStageCode, stageCode));
    }
}
