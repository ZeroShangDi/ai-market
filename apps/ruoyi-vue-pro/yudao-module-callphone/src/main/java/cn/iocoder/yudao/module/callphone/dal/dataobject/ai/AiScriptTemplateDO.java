package cn.iocoder.yudao.module.callphone.dal.dataobject.ai;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** Versioned customer-local call scripts. Published text is immutable and encrypted at rest. */
@TableName("cp_ai_script_template")
@Data
@EqualsAndHashCode(callSuper = true)
public class AiScriptTemplateDO extends TenantBaseDO {

    @TableId
    private Long id;
    private String templateKey;
    private Integer versionNo;
    private String name;
    private String stageCode;
    private String channel;
    private String tagsJson;
    private String contentCiphertext;
    private String variablesJson;
    private String status;
    private Integer usageCount;
    private Integer copyCount;
    private LocalDateTime lastUsedAt;
    private Long createdBy;
    private Long publishedBy;
    private LocalDateTime publishedAt;
}
