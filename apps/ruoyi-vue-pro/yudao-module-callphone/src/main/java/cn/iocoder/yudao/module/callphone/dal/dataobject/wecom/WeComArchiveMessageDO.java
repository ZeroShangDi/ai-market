package cn.iocoder.yudao.module.callphone.dal.dataobject.wecom;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("cp_wecom_archive_message")
@Data
@EqualsAndHashCode(callSuper = true)
public class WeComArchiveMessageDO extends TenantBaseDO {
    @TableId private Long id;
    private String messageIdHash;
    private String conversationIdHash;
    private String conversationIdCiphertext;
    private String conversationType;
    private String messageType;
    private LocalDateTime messageTime;
    private Integer participantCount;
    private String participantHashesCiphertext;
    private String customerIdHash;
    private String customerIdCiphertext;
    private String contentCiphertext;
    private LocalDateTime expiresAt;
}
