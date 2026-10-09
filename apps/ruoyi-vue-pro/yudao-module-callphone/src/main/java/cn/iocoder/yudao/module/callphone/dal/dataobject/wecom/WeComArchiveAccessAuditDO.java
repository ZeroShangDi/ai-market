package cn.iocoder.yudao.module.callphone.dal.dataobject.wecom;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_wecom_archive_access_audit")
@Data
@EqualsAndHashCode(callSuper = true)
public class WeComArchiveAccessAuditDO extends TenantBaseDO {
    @TableId private Long id;
    private Long messageId;
    private Long actorId;
    private String actorType;
    private String purposeCiphertext;
}
