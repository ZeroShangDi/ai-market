package cn.iocoder.yudao.module.callphone.dal.mysql.acquisition;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionChannelPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.AcquisitionChannelDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AcquisitionChannelMapper extends BaseMapperX<AcquisitionChannelDO> {
    default PageResult<AcquisitionChannelDO> selectPage(AcquisitionChannelPageReqVO reqVO) {
        LambdaQueryWrapperX<AcquisitionChannelDO> query = new LambdaQueryWrapperX<>();
        query.eqIfPresent(AcquisitionChannelDO::getStatus, reqVO.getStatus());
        query.and(reqVO.getQuery() != null && !reqVO.getQuery().isBlank(), wrapper -> wrapper
                        .like(AcquisitionChannelDO::getName, reqVO.getQuery())
                        .or().like(AcquisitionChannelDO::getChannelCode, reqVO.getQuery()));
        query.orderByDesc(AcquisitionChannelDO::getCreateTime).orderByDesc(AcquisitionChannelDO::getId);
        return selectPage(reqVO, query);
    }

    default AcquisitionChannelDO selectByChannelCode(String channelCode) {
        return selectOne(new LambdaQueryWrapperX<AcquisitionChannelDO>()
                .eq(AcquisitionChannelDO::getChannelCode, channelCode));
    }
}
