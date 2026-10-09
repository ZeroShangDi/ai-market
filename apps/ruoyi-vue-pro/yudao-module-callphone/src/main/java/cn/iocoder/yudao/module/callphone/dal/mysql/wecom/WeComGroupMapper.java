package cn.iocoder.yudao.module.callphone.dal.mysql.wecom;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComGroupPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComGroupDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WeComGroupMapper extends BaseMapperX<WeComGroupDO> {
    default PageResult<WeComGroupDO> selectPage(WeComGroupPageReqVO req, String ownerHash, String nameHash) {
        LambdaQueryWrapperX<WeComGroupDO> query = new LambdaQueryWrapperX<WeComGroupDO>()
                .eqIfPresent(WeComGroupDO::getOwnerUserIdHash, ownerHash)
                .eqIfPresent(WeComGroupDO::getGroupStatus, req.getStatus());
        if (nameHash != null) query.eq(WeComGroupDO::getNameSearchHash, nameHash);
        query.orderByDesc(WeComGroupDO::getLastSyncedAt);
        return selectPage(req, query);
    }
}
