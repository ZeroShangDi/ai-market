package cn.iocoder.yudao.module.pay.dal.dataobject.app;

import cn.iocoder.yudao.framework.common.enums.CommonStatusEnum;
import cn.iocoder.yudao.framework.tenant.core.db.TenantBaseDO;
import com.baomidou.mybatisplus.annotation.KeySequence;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.*;

/** 支付应用拥有独立渠道配置；按租户隔离，不承载业务订单。 */
@TableName("pay_app")
@KeySequence("pay_app_seq") // 用于 Oracle、PostgreSQL、Kingbase、DB2、H2 数据库的主键自增。如果是 MySQL 等数据库，可不写。
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PayAppDO extends TenantBaseDO {

    /**
     * 应用编号，数据库自增
     */
    @TableId
    private Long id;
    /**
     * 应用标识
     */
    private String appKey;
    /**
     * 应用名
     */
    private String name;
    /**
     * 状态
     *
     * 枚举 {@link CommonStatusEnum}
     */
    private Integer status;
    /**
     * 备注
     */
    private String remark;
    /**
     * 支付结果的回调地址
     */
    private String orderNotifyUrl;
    /**
     * 退款结果的回调地址
     */
    private String refundNotifyUrl;

    /**
     * 转账结果的回调地址
     */
    private String transferNotifyUrl;

}
