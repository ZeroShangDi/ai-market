package cn.iocoder.yudao.module.callphone.dal.dataobject.wecom;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_wecom_campaign")
@Data
@EqualsAndHashCode(callSuper = true)
public class WeComCampaignDO extends TenantBaseDO {
    @TableId private Long id;
    private String campaignNameCiphertext;
    private String messageContentCiphertext;
    private String criteriaCiphertext;
    private Integer estimatedRecipientCount;
    private LocalDateTime estimatedAt;
    private String status;
    private Integer version;
}
