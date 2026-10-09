package cn.iocoder.yudao.module.callphone.dal.mysql.wecom;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComArchiveRetentionDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WeComArchiveRetentionMapper extends BaseMapperX<WeComArchiveRetentionDO> {
    default WeComArchiveRetentionDO selectCurrent() {
        return selectOne(new LambdaQueryWrapperX<WeComArchiveRetentionDO>());
    }
}
