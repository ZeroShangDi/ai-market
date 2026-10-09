package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo.CallRecordPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CallRecordMapper extends BaseMapperX<CallRecordDO> {

    default PageResult<CallRecordDO> selectPage(CallRecordPageReqVO reqVO) {
        return selectPage(reqVO, new LambdaQueryWrapperX<CallRecordDO>()
                .eqIfPresent(CallRecordDO::getDirection, reqVO.getDirection())
                .eqIfPresent(CallRecordDO::getResultCode, reqVO.getResultCode())
                .eqIfPresent(CallRecordDO::getOwnerUserId, reqVO.getOwnerUserId())
                .eqIfPresent(CallRecordDO::getRecordingState, reqVO.getRecordingState())
                .geIfPresent(CallRecordDO::getStartedAt, reqVO.getFromUtc())
                .ltIfPresent(CallRecordDO::getStartedAt, reqVO.getToUtc())
                .likeIfPresent(CallRecordDO::getPhoneDisplay, reqVO.getQuery())
                .orderByDesc(CallRecordDO::getStartedAt)
                .orderByDesc(CallRecordDO::getId));
    }
}
