package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionChannelPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionChannelSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.AcquisitionChannelDO;

public interface AcquisitionChannelService {
    PageResult<AcquisitionChannelDO> getPage(AcquisitionChannelPageReqVO reqVO);
    Long save(AcquisitionChannelSaveReqVO reqVO);
    boolean setStatus(Long id, String status);
}
