package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_customer_field")
@Data
@EqualsAndHashCode(callSuper = true)
public class CustomerFieldDO extends TenantBaseDO {
    @TableId private Long id;
    private String fieldKey;
    private String label;
    private String valueType;
    private Boolean required;
    private String optionsJson;
    private Boolean enabled;
    private Boolean listVisible;
    private String visibleRoleCodesJson;
    private Integer sort;
}
