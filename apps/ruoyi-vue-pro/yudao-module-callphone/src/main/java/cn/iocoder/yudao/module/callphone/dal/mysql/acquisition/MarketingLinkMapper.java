package cn.iocoder.yudao.module.callphone.dal.mysql.acquisition;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.MarketingLinkPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.MarketingLinkDO;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;

@Mapper
public interface MarketingLinkMapper extends BaseMapperX<MarketingLinkDO> {
    default MarketingLinkDO selectByPublicCode(String publicCode) {
        return selectOne(new LambdaQueryWrapper<MarketingLinkDO>()
                .eq(MarketingLinkDO::getPublicCode, publicCode));
    }

    default int incrementClicks(String publicCode, LocalDateTime clickedAt) {
        return update(null, new LambdaUpdateWrapper<MarketingLinkDO>()
                .eq(MarketingLinkDO::getPublicCode, publicCode)
                .eq(MarketingLinkDO::getStatus, "active")
                .set(MarketingLinkDO::getLastClickedAt, clickedAt)
                .setSql("click_count = click_count + 1"));
    }

    default PageResult<MarketingLinkDO> selectPage(MarketingLinkPageReqVO reqVO) {
        LambdaQueryWrapperX<MarketingLinkDO> query = new LambdaQueryWrapperX<>();
        query.eqIfPresent(MarketingLinkDO::getStatus, reqVO.getStatus())
                .likeIfPresent(MarketingLinkDO::getName, reqVO.getQuery());
        query.orderByDesc(MarketingLinkDO::getCreateTime).orderByDesc(MarketingLinkDO::getId);
        return selectPage(reqVO, query);
    }
}
