package cn.iocoder.yudao.module.callphone.dal.mysql.ai;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiScriptPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.AiScriptTemplateDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AiScriptTemplateMapper extends BaseMapperX<AiScriptTemplateDO> {

    default PageResult<AiScriptTemplateDO> selectPage(AiScriptPageReqVO reqVO) {
        LambdaQueryWrapperX<AiScriptTemplateDO> query = new LambdaQueryWrapperX<>();
        query.eqIfPresent(AiScriptTemplateDO::getStageCode, reqVO.getStageCode())
                .eqIfPresent(AiScriptTemplateDO::getChannel, reqVO.getChannel())
                .eqIfPresent(AiScriptTemplateDO::getStatus, reqVO.getStatus());
        query.and(reqVO.getQuery() != null && !reqVO.getQuery().isBlank(), wrapper -> wrapper
                        .like(AiScriptTemplateDO::getName, reqVO.getQuery())
                        .or().like(AiScriptTemplateDO::getTemplateKey, reqVO.getQuery())
                        .or().like(AiScriptTemplateDO::getTagsJson, reqVO.getQuery()));
        query.orderByDesc(AiScriptTemplateDO::getUpdateTime).orderByDesc(AiScriptTemplateDO::getVersionNo);
        return selectPage(reqVO, query);
    }

    default AiScriptTemplateDO selectLatestVersion(String templateKey) {
        return selectOne(new LambdaQueryWrapperX<AiScriptTemplateDO>()
                .eq(AiScriptTemplateDO::getTemplateKey, templateKey)
                .orderByDesc(AiScriptTemplateDO::getVersionNo)
                .last("LIMIT 1 FOR UPDATE"));
    }

    default int recordUsage(Long id, boolean copied) {
        LambdaUpdateWrapper<AiScriptTemplateDO> update = new LambdaUpdateWrapper<AiScriptTemplateDO>()
                .setSql(copied ? "usage_count = usage_count + 1, copy_count = copy_count + 1" : "usage_count = usage_count + 1")
                .set(AiScriptTemplateDO::getLastUsedAt, java.time.LocalDateTime.now())
                .eq(AiScriptTemplateDO::getId, id)
                .eq(AiScriptTemplateDO::getStatus, "published");
        return update(null, update);
    }
}
