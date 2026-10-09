package cn.iocoder.yudao.module.callphone.service.ai;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.KnowledgeBasePageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.KnowledgeBaseSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.KnowledgeBaseDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.KnowledgeDocumentDO;
import org.springframework.web.multipart.MultipartFile;

public interface KnowledgeBaseService {
    PageResult<KnowledgeBaseDO> getPage(KnowledgeBasePageReqVO reqVO);
    Long save(KnowledgeBaseSaveReqVO reqVO);
    boolean setStatus(Long id, String status);
    java.util.List<KnowledgeDocumentDO> getDocuments(Long knowledgeBaseId);
    KnowledgeDocumentDO upload(Long knowledgeBaseId, MultipartFile file) throws java.io.IOException;
    boolean retryDocument(Long id);
}
