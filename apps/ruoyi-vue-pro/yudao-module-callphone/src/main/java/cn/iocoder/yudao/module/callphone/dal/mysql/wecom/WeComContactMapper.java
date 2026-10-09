package cn.iocoder.yudao.module.callphone.dal.mysql.wecom;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComContactPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComContactDO;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WeComContactMapper extends BaseMapperX<WeComContactDO> {
    default PageResult<WeComContactDO> selectPage(WeComContactPageReqVO reqVO, List<Long> contactIds, String exactNameHash) {
        LambdaQueryWrapperX<WeComContactDO> query = new LambdaQueryWrapperX<WeComContactDO>()
                .eqIfPresent(WeComContactDO::getExternalType, reqVO.getExternalType());
        if (contactIds != null) {
            if (contactIds.isEmpty()) return PageResult.empty();
            query.in(WeComContactDO::getId, contactIds);
        }
        if (exactNameHash != null && !exactNameHash.isBlank()) query.eq(WeComContactDO::getNameSearchHash, exactNameHash);
        query.orderByDesc(WeComContactDO::getLastSyncedAt);
        return selectPage(reqVO, query);
    }
}
