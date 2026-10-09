package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordingAccessAuditDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CallRecordingAccessAuditMapper extends BaseMapperX<CallRecordingAccessAuditDO> {}
