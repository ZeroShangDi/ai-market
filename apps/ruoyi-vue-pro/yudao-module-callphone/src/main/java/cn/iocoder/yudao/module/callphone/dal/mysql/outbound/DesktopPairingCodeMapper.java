package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.DesktopPairingCodeDO;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;

@Mapper
public interface DesktopPairingCodeMapper extends BaseMapperX<DesktopPairingCodeDO> {
    default DesktopPairingCodeDO selectPendingByCodeHash(String codeHash, LocalDateTime now) {
        return selectOne(new LambdaQueryWrapperX<DesktopPairingCodeDO>().eq(DesktopPairingCodeDO::getCodeHash, codeHash)
                .eq(DesktopPairingCodeDO::getStatus, "pending").gt(DesktopPairingCodeDO::getExpiresAt, now));
    }
}
