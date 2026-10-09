package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerStageHistoryPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerStageEventDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CustomerStageEventMapper extends BaseMapperX<CustomerStageEventDO> {
    default PageResult<CustomerStageEventDO> selectPage(CustomerStageHistoryPageReqVO reqVO, Long changedBy) {
        return selectPage(reqVO, new LambdaQueryWrapperX<CustomerStageEventDO>()
                .eq(CustomerStageEventDO::getChangedBy, changedBy)
                .eqIfPresent(CustomerStageEventDO::getToStage, reqVO.getStageCode())
                .orderByDesc(CustomerStageEventDO::getChangedAt)
                .orderByDesc(CustomerStageEventDO::getId));
    }
}
