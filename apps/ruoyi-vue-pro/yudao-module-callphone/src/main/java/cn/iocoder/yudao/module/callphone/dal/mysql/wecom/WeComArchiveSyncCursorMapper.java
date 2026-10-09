package cn.iocoder.yudao.module.callphone.dal.mysql.wecom;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComArchiveSyncCursorDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WeComArchiveSyncCursorMapper extends BaseMapperX<WeComArchiveSyncCursorDO> {
    default WeComArchiveSyncCursorDO selectByCursorKeyHash(String cursorKeyHash) {
        return selectOne(new LambdaQueryWrapperX<WeComArchiveSyncCursorDO>()
                .eq(WeComArchiveSyncCursorDO::getCursorKeyHash, cursorKeyHash));
    }
}
