package cn.iocoder.yudao.module.pay.framework.guard;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.module.pay.service.order.PayOrderServiceImpl;
import cn.iocoder.yudao.module.pay.service.refund.PayRefundServiceImpl;
import cn.iocoder.yudao.module.pay.service.transfer.PayTransferServiceImpl;
import cn.iocoder.yudao.module.pay.dal.mysql.order.PayOrderMapper;
import cn.iocoder.yudao.module.pay.dal.dataobject.order.PayOrderDO;
import org.junit.jupiter.api.Test;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PayActivationGuardTest {
    private <T> T guarded(T target) {
        AspectJProxyFactory factory=new AspectJProxyFactory(target);
        factory.setProxyTargetClass(true);
        factory.addAspect(new PayActivationGuard());
        return factory.getProxy();
    }
    @Test void javaApiCannotCreateOrderWhenFundsAreOff() {
        ServiceException ex=assertThrows(ServiceException.class,()->guarded(new PayOrderServiceImpl()).createOrder(null));
        assertEquals(503,ex.getCode());
    }
    @Test void javaApiCannotRefundOrTransferWhenFundsAreOff() {
        assertEquals(503,assertThrows(ServiceException.class,()->guarded(new PayRefundServiceImpl()).createRefund(null)).getCode());
        assertEquals(503,assertThrows(ServiceException.class,()->guarded(new PayTransferServiceImpl()).createTransfer(null)).getCode());
    }
    @Test void reconciliationCannotTriggerProviderRequestsWhenFundsAreOff() {
        assertEquals(503,assertThrows(ServiceException.class,()->guarded(new PayRefundServiceImpl()).syncRefund()).getCode());
        assertEquals(503,assertThrows(ServiceException.class,()->guarded(new PayTransferServiceImpl()).syncTransfer()).getCode());
    }
    @Test void readOnlyRecordLookupStillWorks() {
        PayOrderMapper mapper=mock(PayOrderMapper.class);PayOrderDO order=new PayOrderDO().setId(7L);
        when(mapper.selectById(7L)).thenReturn(order);
        PayOrderServiceImpl target=new PayOrderServiceImpl();ReflectionTestUtils.setField(target,"orderMapper",mapper);
        assertSame(order,guarded(target).getOrder(7L));verify(mapper).selectById(7L);
    }
}
