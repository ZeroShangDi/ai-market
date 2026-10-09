package cn.iocoder.yudao.module.callphone.service.wecom;

import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComArchiveAccessAuditDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComArchiveMessageDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComArchiveRetentionDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComArchiveAccessAuditMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComArchiveMessageMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComArchiveRetentionMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.ArgumentCaptor;

class WeComArchiveRetentionCleanupTest {

    private final WeComArchiveMessageMapper messageMapper = mock(WeComArchiveMessageMapper.class);
    private final WeComArchiveRetentionMapper retentionMapper = mock(WeComArchiveRetentionMapper.class);
    private final WeComArchiveAccessAuditMapper auditMapper = mock(WeComArchiveAccessAuditMapper.class);
    private final PiiCryptoService crypto = mock(PiiCryptoService.class);
    private final WeComArchiveService service = new WeComArchiveService();

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "messageMapper", messageMapper);
        ReflectionTestUtils.setField(service, "retentionMapper", retentionMapper);
        ReflectionTestUtils.setField(service, "auditMapper", auditMapper);
        ReflectionTestUtils.setField(service, "crypto", crypto);
        TenantContextHolder.setTenantId(9L);
        WeComArchiveRetentionDO retention = new WeComArchiveRetentionDO();
        retention.setRetentionDays(30);
        when(retentionMapper.selectCurrent()).thenReturn(retention);
        when(crypto.encrypt(any(String.class))).thenReturn("encrypted-purpose");
        when(messageMapper.selectExpiredForCleanup(org.mockito.ArgumentMatchers.eq(9L), any(), any(),
                org.mockito.ArgumentMatchers.eq(500)))
                .thenReturn(List.of(message(100L), message(101L)));
        when(messageMapper.hardDeleteExpiredMessages(org.mockito.ArgumentMatchers.eq(9L),
                any())).thenReturn(2);
        when(messageMapper.countExpiredForCleanup(org.mockito.ArgumentMatchers.eq(9L), any(), any())).thenReturn(4L);
    }

    @AfterEach
    void clearTenantContext() {
        TenantContextHolder.clear();
    }

    @Test
    void scheduledCleanupAuditsSystemActorAndDeletesOnlyOneCappedBatch() {
        var result = service.cleanupExpiredForSystem();

        assertEquals(2, result.getDeletedCount());
        assertEquals(4L, result.getRemainingCount());
        verify(messageMapper).hardDeleteExpiredMessages(9L, List.of(100L, 101L));
        ArgumentCaptor<WeComArchiveAccessAuditDO> audits = ArgumentCaptor.forClass(WeComArchiveAccessAuditDO.class);
        verify(auditMapper, times(2)).insert(audits.capture());
        assertEquals(List.of("system", "system"), audits.getAllValues().stream()
                .map(WeComArchiveAccessAuditDO::getActorType).toList());
        assertEquals(List.of(0L, 0L), audits.getAllValues().stream()
                .map(WeComArchiveAccessAuditDO::getActorId).toList());
    }

    @Test
    void manualCleanupAuditsTheRequestingUser() {
        service.cleanupExpired(27L);

        ArgumentCaptor<WeComArchiveAccessAuditDO> audits = ArgumentCaptor.forClass(WeComArchiveAccessAuditDO.class);
        verify(auditMapper, times(2)).insert(audits.capture());
        assertEquals(List.of("user", "user"), audits.getAllValues().stream()
                .map(WeComArchiveAccessAuditDO::getActorType).toList());
        assertEquals(List.of(27L, 27L), audits.getAllValues().stream()
                .map(WeComArchiveAccessAuditDO::getActorId).toList());
    }

    private WeComArchiveMessageDO message(Long id) {
        WeComArchiveMessageDO message = new WeComArchiveMessageDO();
        message.setId(id);
        return message;
    }
}
