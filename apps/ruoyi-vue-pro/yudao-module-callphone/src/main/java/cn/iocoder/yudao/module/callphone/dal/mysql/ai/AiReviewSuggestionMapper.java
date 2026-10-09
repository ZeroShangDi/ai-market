package cn.iocoder.yudao.module.callphone.dal.mysql.ai;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiReviewSuggestionPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.AiReviewSuggestionDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AiReviewSuggestionMapper extends BaseMapperX<AiReviewSuggestionDO> {

    default PageResult<AiReviewSuggestionDO> selectPage(AiReviewSuggestionPageReqVO reqVO, Long ownerUserId) {
        LambdaQueryWrapperX<AiReviewSuggestionDO> query = new LambdaQueryWrapperX<AiReviewSuggestionDO>()
                .eq(AiReviewSuggestionDO::getOwnerUserId, ownerUserId)
                .eqIfPresent(AiReviewSuggestionDO::getRiskLevel, reqVO.getRiskLevel())
                .eqIfPresent(AiReviewSuggestionDO::getCallRecordId, reqVO.getCallRecordId())
                .orderByDesc(AiReviewSuggestionDO::getReviewStatus)
                .orderByDesc(AiReviewSuggestionDO::getCreateTime)
                .orderByDesc(AiReviewSuggestionDO::getId);
        if ("reviewed".equals(reqVO.getStatus())) query.in(AiReviewSuggestionDO::getReviewStatus, "approved", "edited", "rejected");
        else query.eqIfPresent(AiReviewSuggestionDO::getReviewStatus, reqVO.getStatus());
        return selectPage(reqVO, query);
    }

    default AiReviewSuggestionDO selectByRunId(String sourceRunId) {
        return selectOne(new LambdaQueryWrapperX<AiReviewSuggestionDO>()
                .eq(AiReviewSuggestionDO::getSourceRunId, sourceRunId));
    }

    default Long countByStatus(Long ownerUserId, String status) {
        return selectCount(new LambdaQueryWrapperX<AiReviewSuggestionDO>()
                .eq(AiReviewSuggestionDO::getOwnerUserId, ownerUserId)
                .eq(AiReviewSuggestionDO::getReviewStatus, status));
    }

    default Long countPendingHighRisk(Long ownerUserId) {
        return selectCount(new LambdaQueryWrapperX<AiReviewSuggestionDO>()
                .eq(AiReviewSuggestionDO::getOwnerUserId, ownerUserId)
                .eq(AiReviewSuggestionDO::getReviewStatus, "pending")
                .eq(AiReviewSuggestionDO::getRiskLevel, "high"));
    }
}
