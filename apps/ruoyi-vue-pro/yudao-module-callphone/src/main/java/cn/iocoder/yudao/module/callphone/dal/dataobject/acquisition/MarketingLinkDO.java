package cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@TableName("cp_acquisition_marketing_link")
@Data
@EqualsAndHashCode(callSuper = true)
public class MarketingLinkDO extends TenantBaseDO {
    @TableId private Long id;
    private String publicCode;
    private String name;
    private String destinationUrl;
    private Long channelId;
    private String utmSource;
    private String status;
    private Long clickCount;
    private LocalDateTime lastClickedAt;
}
