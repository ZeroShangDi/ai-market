package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.time.LocalDateTime;

@TableName("cp_call_dispatch")
@Data
@EqualsAndHashCode(callSuper = true)
public class CallDispatchDO extends TenantBaseDO {
    @TableId private Long id;
    private Long customerId;
    private Long leadId;
    private Long deviceId;
    private Long requestedBy;
    private String phoneCiphertext;
    private String phoneDisplay;
    private String status;
    private String source;
    private String scriptCode;
    private String followUpStatus;
    private String requestNote;
    private LocalDateTime nextFollowUpAt;
    private String idempotencyKey;
    private Long callRecordId;
    private LocalDateTime expiresAt;
}
