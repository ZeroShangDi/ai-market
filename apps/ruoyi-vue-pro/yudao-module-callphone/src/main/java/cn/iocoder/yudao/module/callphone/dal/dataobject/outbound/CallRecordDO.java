package cn.iocoder.yudao.module.callphone.dal.dataobject.outbound;

import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/** Call Phone 通话记录。客户姓名与号码展示值是创建时经授权形成的快照。 */
@TableName("cp_call_record")
@Data
@EqualsAndHashCode(callSuper = true)
public class CallRecordDO extends TenantBaseDO {

    @TableId
    private Long id;
    private Long customerId;
    private Long leadId;
    private Long callDispatchId;
    private String customerNameCiphertext;
    /** 加密后的原号码；普通列表只使用 phoneDisplay。 */
    private String phoneCiphertext;
    private String phoneDisplay;
    private String direction;
    private Long ownerUserId;
    private Long deviceId;
    private String status;
    private String resultCode;
    private LocalDateTime startedAt;
    private LocalDateTime endedAt;
    private Integer durationSeconds;
    private String recordingState;
    private String summaryState;
    private String nextStepCiphertext;
    private String noteCiphertext;
    private Integer version;
}
