package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.MarketingLinkPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.MarketingLinkSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.MarketingLinkDO;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface MarketingLinkService {
    PageResult<MarketingLinkDO> getPage(MarketingLinkPageReqVO reqVO);
    Map<String, Long> getLeadCounts(List<String> publicCodes, Long ownerUserId);
    Long save(MarketingLinkSaveReqVO reqVO);
    boolean setStatus(Long id, String status);
    Optional<String> registerClickAndGetDestination(String publicCode);
}
