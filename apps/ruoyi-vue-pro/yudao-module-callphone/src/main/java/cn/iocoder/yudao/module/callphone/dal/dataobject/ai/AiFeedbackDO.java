package cn.iocoder.yudao.module.callphone.dal.dataobject.ai;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_ai_feedback")
@Data
@EqualsAndHashCode(callSuper = true)
public class AiFeedbackDO extends TenantBaseDO {

    @TableId
    private Long id;
    private Long aiRunId;
    private Long actorUserId;
    private Integer rating;
    private String reasonCode;
    private String commentCiphertext;
    private LocalDateTime submittedAt;
}
