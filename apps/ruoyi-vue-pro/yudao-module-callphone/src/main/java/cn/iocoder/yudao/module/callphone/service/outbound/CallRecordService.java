package cn.iocoder.yudao.module.callphone.service.outbound;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo.CallRecordPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo.CallRecordSummaryRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;

public interface CallRecordService {

    PageResult<CallRecordDO> getCallRecordPage(CallRecordPageReqVO reqVO);

    CallRecordDO getCallRecord(Long id);

    CallRecordSummaryRespVO getSummary(CallRecordPageReqVO reqVO);
}
