package cn.iocoder.yudao.module.callphone.dal.dataobject.ai;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** Customer-local suggestion extracted from a reviewed call summary. */
@TableName("cp_ai_recommendation")
@Data
@EqualsAndHashCode(callSuper = true)
public class FollowUpRecommendationDO extends TenantBaseDO {

    @TableId private Long id;
    private Long callRecordId;
    private Long sourceSummaryId;
    private Integer sourceSummaryVersion;
    private Long customerId;
    private Long ownerUserId;
    private String sourceSummaryOrigin;
    private String contentCiphertext;
    private String reviewStatus;
    private String reviewReasonCiphertext;
    private Long reviewerId;
    private LocalDateTime reviewedAt;
    private Long followUpTaskId;
    private LocalDateTime dueAt;
    private Integer version;
}
