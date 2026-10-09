package cn.iocoder.yudao.module.callphone.dal.dataobject.ai;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** AI request metadata stored in the customer's own data plane. Never stores prompt or response text. */
@TableName("cp_ai_run")
@Data
@EqualsAndHashCode(callSuper = true)
public class AiRunDO extends TenantBaseDO {

    @TableId
    private Long id;
    private Long actorUserId;
    private String feature;
    private String sourceType;
    private Long sourceId;
    private String modelKey;
    private String promptVersion;
    private String status;
    private Integer latencyMs;
    private Integer inputTokens;
    private Integer outputTokens;
    private BigDecimal estimatedCost;
    private String errorCode;
    private LocalDateTime completedAt;
}
