package cn.iocoder.yudao.module.callphone.service.agent;

import cn.iocoder.yudao.framework.security.core.service.SecurityFrameworkService;
import cn.iocoder.yudao.module.callphone.dal.dataobject.agent.AgentFollowUpReceiptDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.FollowUpTaskDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.agent.AgentFollowUpReceiptMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.FollowUpTaskMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AgentFollowUpServiceTest {
    private final String taskId = "b1bfce16-1bfc-4f00-8407-3aef4278ead2";
    private final AgentActor actor = new AgentActor(1L, 7L, "10");
    private final AgentFollowUpService service = new AgentFollowUpService();
    private final CustomerMapper customers = mock(CustomerMapper.class);
    private final FollowUpTaskMapper followUps = mock(FollowUpTaskMapper.class);
    private final AgentFollowUpReceiptMapper receipts = mock(AgentFollowUpReceiptMapper.class);
    private final SecurityFrameworkService permissions = mock(SecurityFrameworkService.class);
    private final PiiCryptoService crypto = mock(PiiCryptoService.class);
    private final TransactionTemplate transactions = mock(TransactionTemplate.class);
    private final ObjectMapper json = new ObjectMapper();
    private CustomerDO customer;

    @BeforeEach void setup() {
        ReflectionTestUtils.setField(service, "customerMapper", customers); ReflectionTestUtils.setField(service, "followUpTaskMapper", followUps);
        ReflectionTestUtils.setField(service, "receiptMapper", receipts); ReflectionTestUtils.setField(service, "security", permissions);
        ReflectionTestUtils.setField(service, "crypto", crypto); ReflectionTestUtils.setField(service, "transactions", transactions);
        customer = new CustomerDO(); customer.setId(456L); customer.setTenantId(1L); customer.setOwnerUserId(7L); customer.setStatus("active");
        when(customers.selectOne(any())).thenReturn(customer);
        when(permissions.hasPermission("callphone:followup:save")).thenReturn(true);
        when(crypto.encrypt(anyString())).thenAnswer(call -> "encrypted:" + call.getArgument(0));
        when(transactions.execute(any())).thenAnswer(call -> ((TransactionCallback<?>) call.getArgument(0)).doInTransaction(null));
    }

    private ObjectNode task(String status) {
        ObjectNode task = json.createObjectNode().put("id", taskId).put("customer_id", "456").put("status", status);
        task.set("proposal", json.createObjectNode().put("title", "跟进方案").put("content", "确认需求")
                .put("due_at", "2026-10-15T10:00:00+08:00"));
        return task;
    }

    @Test void createsEncryptedBusinessRowAndReceiptWithinTransaction() {
        Long id = service.confirm(taskId, task("awaiting_confirmation"), actor);
        var captured = ArgumentCaptor.forClass(FollowUpTaskDO.class); verify(followUps).insert(captured.capture());
        FollowUpTaskDO row = captured.getValue(); assertEquals(id, row.getId()); assertEquals(7L, row.getOwnerUserId());
        assertEquals(1L, row.getTenantId()); assertEquals("pending", row.getStatus());
        assertEquals("encrypted:跟进方案", row.getTitleCiphertext()); assertEquals("encrypted:确认需求", row.getContentCiphertext());
        assertEquals(java.time.OffsetDateTime.parse("2026-10-15T10:00:00+08:00").toInstant(),
                row.getDueAt().atZone(java.time.ZoneId.systemDefault()).toInstant());
        var receipt = ArgumentCaptor.forClass(AgentFollowUpReceiptDO.class); verify(receipts).insert(receipt.capture());
        assertEquals(id, receipt.getValue().getFollowUpTaskId()); assertEquals(taskId, receipt.getValue().getAgentTaskId());
        verify(transactions).execute(any());
    }
    @Test void proposalTimeMatchesBusinessApiTimestampInShanghaiTimezone() {
        var previous=java.util.TimeZone.getDefault(); java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
        try {
            service.confirm(taskId,task("awaiting_confirmation"),actor);
            var captured=ArgumentCaptor.forClass(FollowUpTaskDO.class); verify(followUps).insert(captured.capture());
            var expected=java.time.OffsetDateTime.parse("2026-10-15T10:00:00+08:00").toInstant().toEpochMilli();
            assertEquals(expected,captured.getValue().getDueAt().atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli());
        } finally {java.util.TimeZone.setDefault(previous);}
    }

    @Test void committedReceiptReconcilesCancelledTaskWithoutRepeatingBusinessWrite() {
        AgentFollowUpReceiptDO receipt = new AgentFollowUpReceiptDO(); receipt.setCustomerId(456L); receipt.setFollowUpTaskId(999L);
        when(receipts.find(taskId, 1L, 7L)).thenReturn(receipt);
        assertEquals(999L, service.confirm(taskId, task("cancelled"), actor));
        assertEquals(999L, service.confirm(taskId, task("completed"), actor));
        customer.setOwnerUserId(8L);
        assertEquals(999L, service.confirm(taskId, task("cancelled"), actor));
        assertEquals(999L, service.committedReceipt(taskId, task("cancelled"), actor));
        verifyNoInteractions(followUps, transactions); verify(receipts, never()).insert(any(AgentFollowUpReceiptDO.class));
    }

    @Test void deniesNewCancelledWriteWrongOwnerAndMissingPermission() {
        assertThrows(AgentTaskRelay.Failure.class, () -> service.confirm(taskId, task("cancelled"), actor));
        customer.setOwnerUserId(8L);
        assertThrows(AgentTaskRelay.Failure.class, () -> service.customerSnapshot(456L, actor));
        customer.setOwnerUserId(7L); when(permissions.hasPermission("callphone:followup:save")).thenReturn(false);
        assertThrows(AgentTaskRelay.Failure.class, () -> service.confirm(taskId, task("awaiting_confirmation"), actor));
        verifyNoInteractions(followUps, transactions);
    }

    @Test void rejectsForgedTaskIdAndInvalidDueAtBeforeBusinessWrite() {
        ObjectNode wrong = task("awaiting_confirmation").put("id", "different-task");
        assertThrows(AgentTaskRelay.Failure.class, () -> service.confirm(taskId, wrong, actor));
        ObjectNode badDate = task("awaiting_confirmation"); ((ObjectNode) badDate.path("proposal")).put("due_at", "tomorrow");
        assertThrows(AgentTaskRelay.Failure.class, () -> service.confirm(taskId, badDate, actor));
        verifyNoInteractions(followUps, transactions);
    }

    @Test void rejectsCiphertextOverflowBeforeOpeningBusinessTransaction() {
        when(crypto.encrypt("确认需求")).thenReturn("x".repeat(4097));
        assertThrows(AgentTaskRelay.Failure.class, () -> service.confirm(taskId, task("awaiting_confirmation"), actor));
        verifyNoInteractions(followUps, transactions);
        verify(receipts, never()).insert(any(AgentFollowUpReceiptDO.class));
    }
}
