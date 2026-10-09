package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** Metadata for an encrypted, customer-side call recording object. */
@TableName("cp_call_recording_asset")
@Data
@EqualsAndHashCode(callSuper = true)
public class CallRecordingAssetDO extends TenantBaseDO {
    @TableId private Long id;
    private Long callRecordId;
    private Long deviceId;
    private Long ownerUserId;
    private String uploadId;
    private String objectKey;
    private String contentType;
    private Long sizeBytes;
    private String sha256;
}
