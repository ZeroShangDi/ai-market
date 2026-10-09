package cn.iocoder.yudao.module.callphone.controller.app.outbound;

import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.FollowUpTaskDO;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CallPhoneMobileFollowUpTaskTest {

    @Test
    void buildsEncryptedFollowUpTaskLinkedToCustomerAndCall() {
        PiiCryptoService crypto = mock(PiiCryptoService.class);
        when(crypto.encrypt(anyString())).thenAnswer(invocation -> "encrypted:" + invocation.getArgument(0));
        CallRecordDO record = new CallRecordDO();
        record.setId(71L);
        record.setCustomerId(91L);
        record.setOwnerUserId(7L);
        CallDispatchDO dispatch = new CallDispatchDO();
        dispatch.setCustomerId(91L);
        dispatch.setNextFollowUpAt(LocalDateTime.of(2026, 10, 8, 10, 30));
        CallPhoneMobileController.CompleteCallReqVO result = new CallPhoneMobileController.CompleteCallReqVO();
        result.setResultCode("callback");
        result.setNote("  明天下午再联系  ");

        FollowUpTaskDO task = CallPhoneMobileController.buildCustomerFollowUpTask(
                101L, record, dispatch, result, crypto);

        assertEquals(101L, task.getId());
        assertEquals(91L, task.getCustomerId());
        assertEquals(7L, task.getOwnerUserId());
        assertEquals("encrypted:外呼后续跟进", task.getTitleCiphertext());
        assertEquals("encrypted:由外呼结果自动创建。通话结果：callback\n通话备注：明天下午再联系",
                task.getContentCiphertext());
        assertEquals(LocalDateTime.of(2026, 10, 8, 10, 30), task.getDueAt());
        assertEquals("pending", task.getStatus());
        assertEquals(71L, task.getSourceCallRecordId());
    }
}
