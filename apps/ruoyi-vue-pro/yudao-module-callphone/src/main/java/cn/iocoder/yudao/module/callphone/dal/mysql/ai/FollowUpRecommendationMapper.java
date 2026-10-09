package cn.iocoder.yudao.module.callphone.dal.mysql.ai;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.FollowUpRecommendationDO;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface FollowUpRecommendationMapper extends BaseMapperX<FollowUpRecommendationDO> {

    default PageResult<FollowUpRecommendationDO> selectPage(RecommendationPageReqVO reqVO, Long ownerUserId) {
        LambdaQueryWrapperX<FollowUpRecommendationDO> query = new LambdaQueryWrapperX<FollowUpRecommendationDO>()
                .eq(FollowUpRecommendationDO::getOwnerUserId, ownerUserId)
                .eqIfPresent(FollowUpRecommendationDO::getReviewStatus, reqVO.getStatus())
                .eqIfPresent(FollowUpRecommendationDO::getCallRecordId, reqVO.getCallRecordId())
                .orderByDesc(FollowUpRecommendationDO::getUpdateTime)
                .orderByDesc(FollowUpRecommendationDO::getId);
        return selectPage(reqVO, query);
    }

    default FollowUpRecommendationDO selectByCallAndSummary(Long callRecordId, Long summaryId, Integer summaryVersion, Long ownerUserId) {
        return selectOne(new LambdaQueryWrapperX<FollowUpRecommendationDO>()
                .eq(FollowUpRecommendationDO::getCallRecordId, callRecordId)
                .eq(FollowUpRecommendationDO::getSourceSummaryId, summaryId)
                .eq(FollowUpRecommendationDO::getSourceSummaryVersion, summaryVersion)
                .eq(FollowUpRecommendationDO::getOwnerUserId, ownerUserId));
    }

    default List<FollowUpRecommendationDO> selectByOwner(Long ownerUserId) {
        return selectList(new LambdaQueryWrapperX<FollowUpRecommendationDO>()
                .eq(FollowUpRecommendationDO::getOwnerUserId, ownerUserId));
    }

    default Long countByStatus(Long ownerUserId, String status) {
        return selectCount(new LambdaQueryWrapperX<FollowUpRecommendationDO>()
                .eq(FollowUpRecommendationDO::getOwnerUserId, ownerUserId)
                .eq(FollowUpRecommendationDO::getReviewStatus, status));
    }
}
