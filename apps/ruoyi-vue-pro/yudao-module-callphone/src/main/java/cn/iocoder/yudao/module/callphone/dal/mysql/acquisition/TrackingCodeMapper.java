package cn.iocoder.yudao.module.callphone.dal.mysql.acquisition;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.TrackingCodePageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.TrackingCodeDO;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TrackingCodeMapper extends BaseMapperX<TrackingCodeDO> {
    default PageResult<TrackingCodeDO> selectPage(TrackingCodePageReqVO reqVO) {
        LambdaQueryWrapperX<TrackingCodeDO> query = new LambdaQueryWrapperX<>();
        query.eq(TrackingCodeDO::getCodeType, reqVO.getCodeType()).eqIfPresent(TrackingCodeDO::getStatus, reqVO.getStatus());
        query.and(reqVO.getQuery() != null && !reqVO.getQuery().isBlank(), wrapper -> wrapper
                        .like(TrackingCodeDO::getName, reqVO.getQuery())
                        .or().like(TrackingCodeDO::getPublicCode, reqVO.getQuery()));
        query.orderByDesc(TrackingCodeDO::getCreateTime).orderByDesc(TrackingCodeDO::getId);
        return selectPage(reqVO, query);
    }

    default TrackingCodeDO selectByPublicCode(String publicCode) {
        return selectOne(new LambdaQueryWrapper<TrackingCodeDO>()
                .eq(TrackingCodeDO::getPublicCode, publicCode));
    }

}
