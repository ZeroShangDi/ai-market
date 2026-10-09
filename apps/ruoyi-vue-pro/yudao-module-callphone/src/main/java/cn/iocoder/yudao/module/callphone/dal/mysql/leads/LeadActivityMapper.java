package cn.iocoder.yudao.module.callphone.dal.mysql.leads;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadActivityDO;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Mapper
public interface LeadActivityMapper extends BaseMapperX<LeadActivityDO> {
    default PageResult<LeadActivityDO> selectPage(Long leadId, Long ownerUserId, cn.iocoder.yudao.framework.common.pojo.PageParam pageParam) {
        return selectPage(pageParam, new LambdaQueryWrapperX<LeadActivityDO>()
                .eq(LeadActivityDO::getOwnerUserId, ownerUserId)
                .eqIfPresent(LeadActivityDO::getLeadId, leadId)
                .orderByDesc(LeadActivityDO::getCreateTime).orderByDesc(LeadActivityDO::getId));
    }

    default Set<Long> selectLeadIdsWithActivityAfter(List<Long> leadIds, LocalDateTime after) {
        if (leadIds == null || leadIds.isEmpty() || after == null) return Set.of();
        return selectList(new LambdaQueryWrapperX<LeadActivityDO>()
                .select(LeadActivityDO::getLeadId)
                .in(LeadActivityDO::getLeadId, leadIds)
                .gt(LeadActivityDO::getCreateTime, after))
                .stream().map(LeadActivityDO::getLeadId).collect(Collectors.toSet());
    }
}
