package cn.iocoder.yudao.module.callphone.dal.mysql.wecom;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComCampaignDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WeComCampaignMapper extends BaseMapperX<WeComCampaignDO> {
    default PageResult<WeComCampaignDO> selectPage(WeComCampaignPageReqVO req) {
        LambdaQueryWrapperX<WeComCampaignDO> query = new LambdaQueryWrapperX<WeComCampaignDO>()
                .eqIfPresent(WeComCampaignDO::getStatus, req.getStatus())
                .orderByDesc(WeComCampaignDO::getUpdateTime);
        return selectPage(req, query);
    }
}
