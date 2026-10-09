package cn.iocoder.yudao.module.callphone.dal.mysql.ai;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.CallSummaryPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.CallSummaryDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CallSummaryMapper extends BaseMapperX<CallSummaryDO> {

    default PageResult<CallSummaryDO> selectPage(CallSummaryPageReqVO reqVO, Long ownerUserId) {
        return selectPage(reqVO, new LambdaQueryWrapperX<CallSummaryDO>()
                .eq(CallSummaryDO::getOwnerUserId, ownerUserId)
                .eqIfPresent(CallSummaryDO::getReviewStatus, reqVO.getReviewStatus())
                .eqIfPresent(CallSummaryDO::getCallRecordId, reqVO.getCallRecordId())
                .orderByDesc(CallSummaryDO::getUpdateTime)
                .orderByDesc(CallSummaryDO::getId));
    }

    default java.util.List<CallSummaryDO> selectByOwner(Long ownerUserId) {
        return selectList(new LambdaQueryWrapperX<CallSummaryDO>()
                .eq(CallSummaryDO::getOwnerUserId, ownerUserId));
    }

    default java.util.List<CallSummaryDO> selectReviewedWithNextStep(Long ownerUserId) {
        return selectList(new LambdaQueryWrapperX<CallSummaryDO>()
                .eq(CallSummaryDO::getOwnerUserId, ownerUserId)
                .eq(CallSummaryDO::getReviewStatus, "reviewed")
                .isNotNull(CallSummaryDO::getNextStepCiphertext)
                .orderByDesc(CallSummaryDO::getReviewedAt)
                .last("LIMIT 200"));
    }

    default CallSummaryDO selectByCallRecordId(Long callRecordId, Long ownerUserId) {
        return selectOne(new LambdaQueryWrapperX<CallSummaryDO>()
                .eq(CallSummaryDO::getCallRecordId, callRecordId)
                .eq(CallSummaryDO::getOwnerUserId, ownerUserId));
    }
}
