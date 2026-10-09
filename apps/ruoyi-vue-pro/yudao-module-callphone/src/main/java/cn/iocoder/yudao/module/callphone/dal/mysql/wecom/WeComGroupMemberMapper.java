package cn.iocoder.yudao.module.callphone.dal.mysql.wecom;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComGroupMemberDO;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WeComGroupMemberMapper extends BaseMapperX<WeComGroupMemberDO> {
    default List<WeComGroupMemberDO> selectByGroupId(Long groupId) {
        return selectList(new LambdaQueryWrapperX<WeComGroupMemberDO>()
                .eq(WeComGroupMemberDO::getGroupId, groupId).eq(WeComGroupMemberDO::getIsActive, true)
                .orderByAsc(WeComGroupMemberDO::getJoinTime));
    }
    default WeComGroupMemberDO selectByGroupAndHash(Long groupId, String memberHash) {
        return selectOne(new LambdaQueryWrapperX<WeComGroupMemberDO>()
                .eq(WeComGroupMemberDO::getGroupId, groupId).eq(WeComGroupMemberDO::getMemberIdHash, memberHash));
    }
}
