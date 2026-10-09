package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_mobile_call_event")
@Data
@EqualsAndHashCode(callSuper = true)
public class MobileCallEventDO extends TenantBaseDO {
    @TableId private Long id;
    private Long deviceId;
    private String deviceEventId;
    private String eventType;
    /** Device-keyed HMAC of the canonical completion request; never stores note text. */
    private String requestFingerprint;
    private Long dispatchId;
    private Long callRecordId;
}
