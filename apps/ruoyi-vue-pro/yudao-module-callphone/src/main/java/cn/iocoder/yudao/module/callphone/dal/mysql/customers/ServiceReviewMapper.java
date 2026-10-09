package cn.iocoder.yudao.module.callphone.dal.mysql.customers;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.ServiceReviewPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.customers.ServiceReviewDO;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ServiceReviewMapper extends BaseMapperX<ServiceReviewDO> {

    default PageResult<ServiceReviewDO> selectPage(ServiceReviewPageReqVO reqVO, Long ownerUserId) {
        return selectPage(reqVO, new LambdaQueryWrapperX<ServiceReviewDO>()
                .eq(ServiceReviewDO::getOwnerUserId, ownerUserId)
                .eqIfPresent(ServiceReviewDO::getReviewStatus, reqVO.getReviewStatus())
                .orderByDesc(ServiceReviewDO::getReviewedAt)
                .orderByDesc(ServiceReviewDO::getId));
    }

    default ServiceReviewDO selectByCallRecordId(Long callRecordId, Long ownerUserId) {
        return selectOne(new LambdaQueryWrapperX<ServiceReviewDO>()
                .eq(ServiceReviewDO::getCallRecordId, callRecordId)
                .eq(ServiceReviewDO::getOwnerUserId, ownerUserId));
    }

    default List<ServiceReviewDO> selectByOwner(Long ownerUserId) {
        return selectList(new LambdaQueryWrapperX<ServiceReviewDO>()
                .eq(ServiceReviewDO::getOwnerUserId, ownerUserId));
    }
}
