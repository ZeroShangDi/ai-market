package cn.iocoder.yudao.module.callphone.dal.dataobject.ai;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_knowledge_base")
@Data
@EqualsAndHashCode(callSuper = true)
public class KnowledgeBaseDO extends TenantBaseDO {
    @TableId private Long id;
    private String name;
    private String description;
    private String visibility;
    private String visibleDepartmentIdsJson;
    private String status;
    private Integer documentCount;
    private Integer chunkCount;
}
