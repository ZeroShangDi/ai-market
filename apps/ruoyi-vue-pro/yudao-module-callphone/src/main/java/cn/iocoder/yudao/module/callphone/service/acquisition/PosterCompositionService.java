package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.PosterCompositionPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.PosterCompositionSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.PosterCompositionDO;

public interface PosterCompositionService {
    PageResult<PosterCompositionDO> getPage(PosterCompositionPageReqVO reqVO);
    Long save(PosterCompositionSaveReqVO reqVO);
    boolean setStatus(Long id, String status);
}
