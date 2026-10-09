package cn.iocoder.yudao.module.callphone.service.outbound;

import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;

public record CallDispatchAcceptance(CallRecordDO callRecord, CallDispatchDO dispatch) { }
