package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@TableName("cp_desktop_pairing_code")
@Data
@EqualsAndHashCode(callSuper = true)
public class DesktopPairingCodeDO extends TenantBaseDO {
    @TableId private Long id;
    private Long ownerUserId;
    private String codeHash;
    private String status;
    private Long deviceId;
    private LocalDateTime expiresAt;
}
