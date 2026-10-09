package cn.iocoder.yudao.module.callphone.dal.dataobject.wecom;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_wecom_archive_sync_cursor")
@Data
@EqualsAndHashCode(callSuper = true)
public class WeComArchiveSyncCursorDO extends TenantBaseDO {
    @TableId private Long id;
    private String cursorKeyHash;
    private String cursorCiphertext;
    private String status;
    private LocalDateTime lastSyncAt;
    private String errorCode;
}
