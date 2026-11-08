package cn.iocoder.yudao.module.pay.framework.guard;

import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.*;
import org.springframework.web.servlet.config.annotation.*;
import jakarta.servlet.http.*;
import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception0;

/** 支付模块可装配，但不因抽离而启用真实资金动作。 */
@Aspect
@Component
public class PayActivationGuard {
    @Value("${yudao.pay.transactions-enabled:false}") private boolean enabled;
    @Before("execution(public * cn.iocoder.yudao.module.pay.service..*(..)) && !within(cn.iocoder.yudao.module.pay.service.app..*) && !within(cn.iocoder.yudao.module.pay.service.channel..*) && !execution(* get*(..)) && !execution(* validate*(..))")
    public void financialOperation(JoinPoint point) {
        if (!enabled) throw exception0(503,"支付资金处理未启用，请先完成独立商户与渠道验收");
    }
    public boolean enabled(){return enabled;}
}
