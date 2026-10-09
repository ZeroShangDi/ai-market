package cn.iocoder.yudao.module.callphone.dal.mysql.ai;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.KnowledgeChunkDO;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface KnowledgeChunkMapper extends BaseMapperX<KnowledgeChunkDO> {
    default List<KnowledgeChunkDO> selectByDocumentId(Long documentId) {
        return selectList(new LambdaQueryWrapperX<KnowledgeChunkDO>()
                .eq(KnowledgeChunkDO::getDocumentId, documentId)
                .orderByAsc(KnowledgeChunkDO::getChunkNo));
    }
}
