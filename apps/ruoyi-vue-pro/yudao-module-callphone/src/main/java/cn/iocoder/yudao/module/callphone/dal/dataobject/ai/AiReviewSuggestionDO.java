package cn.iocoder.yudao.module.callphone.dal.dataobject.ai;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

/** Customer-local AI recommendation awaiting a human review decision. */
@TableName("cp_ai_review_suggestion")
@Data
@EqualsAndHashCode(callSuper = true)
public class AiReviewSuggestionDO extends TenantBaseDO {

    @TableId private Long id;
    private Long callRecordId;
    private Long customerId;
    private Long ownerUserId;
    private String sourceRunId;
    private String riskLevel;
    private String suggestionCiphertext;
    private String evidenceCiphertext;
    private String reviewStatus;
    private String reviewReasonCiphertext;
    private Long reviewerId;
    private LocalDateTime reviewedAt;
    private Integer version;
}
