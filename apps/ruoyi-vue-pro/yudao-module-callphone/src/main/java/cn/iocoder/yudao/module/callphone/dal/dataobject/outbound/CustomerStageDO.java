package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_customer_stage")
@Data
@EqualsAndHashCode(callSuper = true)
public class CustomerStageDO extends TenantBaseDO {
    @TableId private Long id;
    private String stageCode;
    private String name;
    private String color;
    private Integer sort;
    private Boolean enabled;
    private Boolean systemDefault;
}
