package cn.iocoder.yudao.module.callphone.dal.dataobject.settings;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_integration_connection")
@Data
@EqualsAndHashCode(callSuper = true)
public class IntegrationConnectionDO extends TenantBaseDO {
    @TableId private Long id;
    private String provider;
    private String displayName;
    private String endpointUrl;
    private String scopesJson;
    private Integer syncIntervalMinutes;
    private String credentialCiphertext;
    private String status;
    private String lastErrorCode;
    private LocalDateTime lastCheckedAt;
    private Integer version;
}
