package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.TrackingCodePageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.TrackingCodeSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.TrackingCodeDO;
import java.util.Optional;

public interface TrackingCodeService {
    PageResult<TrackingCodeDO> getPage(TrackingCodePageReqVO reqVO, Long userId);
    Long save(TrackingCodeSaveReqVO reqVO);
    boolean setStatus(Long id, String status);

    Optional<String> registerPublicScanAndGetDestination(String publicCode);
}
