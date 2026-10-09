package cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_acquisition_tracking_code")
@Data
@EqualsAndHashCode(callSuper = true)
public class TrackingCodeDO extends TenantBaseDO {
    @TableId private Long id;
    private String publicCode;
    private String name;
    private String codeType;
    private Long channelId;
    private Long employeeId;
    private String storeName;
    private String matchRule;
    private String welcomeText;
    private String landingUrl;
    private String status;
    @TableField(exist = false)
    private Long scans;
    @TableField(exist = false)
    private Long leads;
}
