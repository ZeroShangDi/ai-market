package cn.iocoder.yudao.module.callphone.dal.mysql.ai;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.KnowledgeDocumentDO;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface KnowledgeDocumentMapper extends BaseMapperX<KnowledgeDocumentDO> {
    default List<KnowledgeDocumentDO> selectByKnowledgeBaseId(Long knowledgeBaseId) {
        return selectList(new LambdaQueryWrapperX<KnowledgeDocumentDO>()
                .eq(KnowledgeDocumentDO::getKnowledgeBaseId, knowledgeBaseId)
                .orderByDesc(KnowledgeDocumentDO::getCreateTime));
    }

    default KnowledgeDocumentDO selectByBaseAndChecksum(Long knowledgeBaseId, String checksum) {
        return selectOne(new LambdaQueryWrapperX<KnowledgeDocumentDO>()
                .eq(KnowledgeDocumentDO::getKnowledgeBaseId, knowledgeBaseId)
                .eq(KnowledgeDocumentDO::getChecksum, checksum));
    }

    default KnowledgeDocumentDO selectByIdForUpdate(Long id) {
        return selectOne(new LambdaQueryWrapperX<KnowledgeDocumentDO>()
                .eq(KnowledgeDocumentDO::getId, id)
                .last("LIMIT 1 FOR UPDATE"));
    }
}
