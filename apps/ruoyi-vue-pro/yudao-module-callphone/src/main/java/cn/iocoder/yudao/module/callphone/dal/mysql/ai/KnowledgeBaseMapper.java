package cn.iocoder.yudao.module.callphone.dal.mysql.ai;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.KnowledgeBasePageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.KnowledgeBaseDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface KnowledgeBaseMapper extends BaseMapperX<KnowledgeBaseDO> {
    default PageResult<KnowledgeBaseDO> selectPage(KnowledgeBasePageReqVO reqVO) {
        LambdaQueryWrapperX<KnowledgeBaseDO> query = new LambdaQueryWrapperX<>();
        query.eqIfPresent(KnowledgeBaseDO::getStatus, reqVO.getStatus());
        query.and(reqVO.getQuery() != null && !reqVO.getQuery().isBlank(), wrapper -> wrapper
                        .like(KnowledgeBaseDO::getName, reqVO.getQuery())
                        .or().like(KnowledgeBaseDO::getDescription, reqVO.getQuery()));
        query.orderByDesc(KnowledgeBaseDO::getUpdateTime).orderByDesc(KnowledgeBaseDO::getId);
        return selectPage(reqVO, query);
    }

    default int updateCounts(Long id, int documents, int chunks) {
        return update(null, new LambdaUpdateWrapper<KnowledgeBaseDO>()
                .setSql("document_count = document_count + " + documents + ", chunk_count = chunk_count + " + chunks)
                .eq(KnowledgeBaseDO::getId, id));
    }
}
