package cn.iocoder.yudao.module.callphone.dal.mysql.acquisition;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.PosterCompositionPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.PosterCompositionDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface PosterCompositionMapper extends BaseMapperX<PosterCompositionDO> {
    default PageResult<PosterCompositionDO> selectPage(PosterCompositionPageReqVO reqVO) {
        LambdaQueryWrapperX<PosterCompositionDO> query = new LambdaQueryWrapperX<>();
        query.eqIfPresent(PosterCompositionDO::getStatus, reqVO.getStatus())
                .likeIfPresent(PosterCompositionDO::getName, reqVO.getQuery());
        query.orderByDesc(PosterCompositionDO::getCreateTime).orderByDesc(PosterCompositionDO::getId);
        return selectPage(reqVO, query);
    }
}
