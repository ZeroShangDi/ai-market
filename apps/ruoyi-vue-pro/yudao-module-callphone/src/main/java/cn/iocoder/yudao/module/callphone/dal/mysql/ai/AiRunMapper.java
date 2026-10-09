package cn.iocoder.yudao.module.callphone.dal.mysql.ai;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiUsagePageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.AiRunDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AiRunMapper extends BaseMapperX<AiRunDO> {

    default PageResult<AiRunDO> selectPage(AiUsagePageReqVO reqVO) {
        LambdaQueryWrapperX<AiRunDO> query = new LambdaQueryWrapperX<AiRunDO>()
                .eqIfPresent(AiRunDO::getFeature, reqVO.getFeature())
                .eqIfPresent(AiRunDO::getStatus, reqVO.getStatus())
                .eqIfPresent(AiRunDO::getActorUserId, reqVO.getActorUserId())
                .geIfPresent(AiRunDO::getCreateTime, reqVO.getFrom())
                .leIfPresent(AiRunDO::getCreateTime, reqVO.getTo())
                .likeIfPresent(AiRunDO::getModelKey, reqVO.getQuery())
                .orderByDesc(AiRunDO::getCreateTime);
        return selectPage(reqVO, query);
    }
}
