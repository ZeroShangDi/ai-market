package cn.iocoder.yudao.module.callphone.dal.dataobject.ai;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** Customer-local call summary fields. Text is encrypted at rest. */
@TableName("cp_call_summary")
@Data
@EqualsAndHashCode(callSuper = true)
public class CallSummaryDO extends TenantBaseDO {

    @TableId private Long id;
    private Long callRecordId;
    private Long ownerUserId;
    private String summaryCiphertext;
    private String customerNeedsCiphertext;
    private String objectionsCiphertext;
    private String nextStepCiphertext;
    private String origin;
    private String reviewStatus;
    private Integer version;
    private LocalDateTime reviewedAt;
    private Long reviewedBy;
}
