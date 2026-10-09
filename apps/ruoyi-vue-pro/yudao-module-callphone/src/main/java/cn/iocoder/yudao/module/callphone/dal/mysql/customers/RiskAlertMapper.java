package cn.iocoder.yudao.module.callphone.dal.mysql.customers;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskAlertPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.customers.RiskAlertDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RiskAlertMapper extends BaseMapperX<RiskAlertDO> {
    default PageResult<RiskAlertDO> selectPage(RiskAlertPageReqVO reqVO, Long ownerUserId) {
        LambdaQueryWrapperX<RiskAlertDO> query = new LambdaQueryWrapperX<RiskAlertDO>()
                .eq(RiskAlertDO::getOwnerUserId, ownerUserId)
                .eqIfPresent(RiskAlertDO::getStatus, reqVO.getStatus())
                .eqIfPresent(RiskAlertDO::getSeverity, reqVO.getSeverity());
        // `open` sorts before `resolved`, keeping items that need action at the top.
        query.orderByAsc(RiskAlertDO::getStatus);
        query.orderByDesc(RiskAlertDO::getCreateTime);
        query.orderByDesc(RiskAlertDO::getId);
        return selectPage(reqVO, query);
    }
    default RiskAlertDO selectOpen(Long ownerUserId, String ruleCode, String sourceType, Long sourceId) {
        return selectOne(new LambdaQueryWrapperX<RiskAlertDO>()
                .eq(RiskAlertDO::getOwnerUserId, ownerUserId).eq(RiskAlertDO::getRuleCode, ruleCode)
                .eq(RiskAlertDO::getSourceType, sourceType).eq(RiskAlertDO::getSourceId, sourceId)
                .eq(RiskAlertDO::getStatus, "open"));
    }
    default Long countByStatus(Long ownerUserId, String status) {
        return selectCount(new LambdaQueryWrapperX<RiskAlertDO>()
                .eq(RiskAlertDO::getOwnerUserId, ownerUserId).eq(RiskAlertDO::getStatus, status));
    }
    default Long countBySeverity(Long ownerUserId, String severity) {
        return selectCount(new LambdaQueryWrapperX<RiskAlertDO>()
                .eq(RiskAlertDO::getOwnerUserId, ownerUserId).eq(RiskAlertDO::getStatus, "open")
                .eq(RiskAlertDO::getSeverity, severity));
    }
}
