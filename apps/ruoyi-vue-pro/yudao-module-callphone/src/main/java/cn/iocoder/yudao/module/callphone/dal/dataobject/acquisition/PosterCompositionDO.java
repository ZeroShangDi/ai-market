package cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_acquisition_poster")
@Data
@EqualsAndHashCode(callSuper = true)
public class PosterCompositionDO extends TenantBaseDO {
    @TableId private Long id;
    private String name;
    private String title;
    private String templateId;
    private Long trackingCodeId;
    private String status;
}
