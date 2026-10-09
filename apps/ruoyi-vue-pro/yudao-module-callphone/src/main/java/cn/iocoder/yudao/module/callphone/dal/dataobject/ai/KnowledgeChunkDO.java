package cn.iocoder.yudao.module.callphone.dal.dataobject.ai;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_knowledge_chunk")
@Data
@EqualsAndHashCode(callSuper = true)
public class KnowledgeChunkDO extends TenantBaseDO {
    @TableId private Long id;
    private Long knowledgeBaseId;
    private Long documentId;
    private Integer chunkNo;
    private Integer charCount;
    private String contentCiphertext;
}
