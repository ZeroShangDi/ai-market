package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.FollowUpTaskPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.FollowUpTaskDO;
import org.apache.ibatis.annotations.Mapper;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface FollowUpTaskMapper extends BaseMapperX<FollowUpTaskDO> {
    default PageResult<FollowUpTaskDO> selectPage(FollowUpTaskPageReqVO reqVO) {
        LambdaQueryWrapperX<FollowUpTaskDO> query = new LambdaQueryWrapperX<>();
        if ("overdue".equals(reqVO.getStatus())) {
            query.eq(FollowUpTaskDO::getStatus, "pending").lt(FollowUpTaskDO::getDueAt, java.time.LocalDateTime.now());
        } else if (reqVO.getStatus() != null && !reqVO.getStatus().isBlank()) {
            query.eq(FollowUpTaskDO::getStatus, reqVO.getStatus());
        }
        return selectPage(reqVO, query.leIfPresent(FollowUpTaskDO::getDueAt, reqVO.getDueBefore())
                .orderByAsc(FollowUpTaskDO::getStatus)
                .orderByAsc(FollowUpTaskDO::getDueAt)
                .orderByDesc(FollowUpTaskDO::getId));
    }

    default Long countByStatus(String status) {
        return selectCount(new LambdaQueryWrapperX<FollowUpTaskDO>()
                .eq(FollowUpTaskDO::getStatus, status));
    }

    default Long countOverdue() {
        return selectCount(new LambdaQueryWrapperX<FollowUpTaskDO>()
                .eq(FollowUpTaskDO::getStatus, "pending")
                .lt(FollowUpTaskDO::getDueAt, LocalDateTime.now()));
    }

    default List<FollowUpTaskDO> selectOverdueForRiskScan(Long ownerUserId, LocalDateTime cutoff) {
        return selectList(new LambdaQueryWrapperX<FollowUpTaskDO>()
                .eq(FollowUpTaskDO::getOwnerUserId, ownerUserId)
                .eq(FollowUpTaskDO::getStatus, "pending")
                .lt(FollowUpTaskDO::getDueAt, cutoff)
                .orderByAsc(FollowUpTaskDO::getDueAt)
                .last("LIMIT 2000"));
    }
}
