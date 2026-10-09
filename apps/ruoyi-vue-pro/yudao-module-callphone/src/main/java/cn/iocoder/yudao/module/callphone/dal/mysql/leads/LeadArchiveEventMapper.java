package cn.iocoder.yudao.module.callphone.dal.mysql.leads;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadArchiveEventDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface LeadArchiveEventMapper extends BaseMapperX<LeadArchiveEventDO> {
    default PageResult<LeadArchiveEventDO> selectPage(Long archivedBy, String archiveType, cn.iocoder.yudao.framework.common.pojo.PageParam pageParam) {
        return selectPage(pageParam, new LambdaQueryWrapperX<LeadArchiveEventDO>()
                .eq(LeadArchiveEventDO::getArchivedBy, archivedBy)
                .eqIfPresent(LeadArchiveEventDO::getArchiveType, archiveType)
                .orderByDesc(LeadArchiveEventDO::getArchivedAt).orderByDesc(LeadArchiveEventDO::getId));
    }
}
