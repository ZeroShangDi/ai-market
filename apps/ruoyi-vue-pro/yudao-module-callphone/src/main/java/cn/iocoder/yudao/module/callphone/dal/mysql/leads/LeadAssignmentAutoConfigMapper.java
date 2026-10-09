package cn.iocoder.yudao.module.callphone.dal.mysql.leads;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadAssignmentAutoConfigDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface LeadAssignmentAutoConfigMapper extends BaseMapperX<LeadAssignmentAutoConfigDO> {

    default LeadAssignmentAutoConfigDO selectByCurrentTenant() {
        return selectOne(new LambdaQueryWrapperX<LeadAssignmentAutoConfigDO>()
                .orderByAsc(LeadAssignmentAutoConfigDO::getId)
                .last("LIMIT 1"));
    }
}
