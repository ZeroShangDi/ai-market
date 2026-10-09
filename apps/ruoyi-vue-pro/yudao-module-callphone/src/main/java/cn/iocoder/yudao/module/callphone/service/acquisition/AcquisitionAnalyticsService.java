package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionAnalyticsReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionAnalyticsRespVO;

public interface AcquisitionAnalyticsService {
    AcquisitionAnalyticsRespVO getSummary(AcquisitionAnalyticsReqVO reqVO, Long userId);
}
