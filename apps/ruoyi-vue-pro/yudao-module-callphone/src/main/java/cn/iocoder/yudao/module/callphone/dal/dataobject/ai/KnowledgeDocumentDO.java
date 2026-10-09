package cn.iocoder.yudao.module.callphone.dal.dataobject.ai;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_knowledge_document")
@Data
@EqualsAndHashCode(callSuper = true)
public class KnowledgeDocumentDO extends TenantBaseDO {
    @TableId private Long id;
    private Long knowledgeBaseId;
    private String sourceName;
    private String storageUrl;
    private String contentType;
    private Long byteSize;
    private String checksum;
    private String parseStatus;
    private Integer chunkCount;
    private Integer retryCount;
    private String errorMessage;
    private String contentCiphertext;
}
