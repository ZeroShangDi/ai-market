package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** Records who played a locally stored call recording and the page purpose. */
@TableName("cp_call_recording_access_audit")
@Data
@EqualsAndHashCode(callSuper = true)
public class CallRecordingAccessAuditDO extends TenantBaseDO {
    @TableId private Long id;
    private Long callRecordId;
    private Long actorId;
    private String accessPurpose;
}
