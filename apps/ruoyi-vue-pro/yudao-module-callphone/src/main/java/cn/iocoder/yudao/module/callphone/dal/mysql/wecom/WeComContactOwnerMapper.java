package cn.iocoder.yudao.module.callphone.dal.mysql.wecom;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComContactOwnerDO;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WeComContactOwnerMapper extends BaseMapperX<WeComContactOwnerDO> {
    default List<Long> selectContactIdsByOwnerHash(String ownerHash) {
        return selectList(new LambdaQueryWrapperX<WeComContactOwnerDO>()
                .eq(WeComContactOwnerDO::getOwnerUserIdHash, ownerHash))
                .stream().map(WeComContactOwnerDO::getContactId).distinct().toList();
    }

    default WeComContactOwnerDO selectByContactAndOwner(Long contactId, String ownerHash) {
        return selectOne(new LambdaQueryWrapperX<WeComContactOwnerDO>()
                .eq(WeComContactOwnerDO::getContactId, contactId)
                .eq(WeComContactOwnerDO::getOwnerUserIdHash, ownerHash));
    }

    default List<WeComContactOwnerDO> selectByOwnerHash(String ownerHash) {
        return selectList(new LambdaQueryWrapperX<WeComContactOwnerDO>()
                .eq(WeComContactOwnerDO::getOwnerUserIdHash, ownerHash));
    }
}
