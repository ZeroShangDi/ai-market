package cn.iocoder.yudao.module.callphone.dal.dataobject.customers;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_service_review")
@Data
@EqualsAndHashCode(callSuper = true)
public class ServiceReviewDO extends TenantBaseDO {

    @TableId
    private Long id;
    private Long callRecordId;
    private Long ownerUserId;
    private Integer score;
    private String reviewStatus;
    private Boolean identifyOk;
    private Boolean consentOk;
    private Boolean needCaptured;
    private Boolean resultAccurate;
    private Boolean nextStepClear;
    private String noteCiphertext;
    private Long reviewerId;
    private LocalDateTime reviewedAt;
    private Integer version;
}
