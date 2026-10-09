package cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDate;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_acquisition_tracking_scan_daily")
@Data
@EqualsAndHashCode(callSuper = true)
public class TrackingCodeScanDailyDO extends TenantBaseDO {
    @TableId private Long id;
    private Long trackingCodeId;
    private Long channelId;
    private LocalDate eventDay;
    private Integer counterBucket;
    private Long scanCount;
}
