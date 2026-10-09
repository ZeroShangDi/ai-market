package cn.iocoder.yudao.module.callphone.service.leads;

import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadArchiveEventDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadConversionDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadArchiveEventMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadConversionMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LeadLifecycleServiceImplTest {

    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        List.of(LeadDO.class, LeadConversionDO.class, LeadArchiveEventDO.class, CustomerDO.class)
                .forEach(entity -> TableInfoHelper.initTableInfo(assistant, entity));
    }

    @Mock private LeadMapper leadMapper;
    @Mock private LeadConversionMapper leadConversionMapper;
    @Mock private LeadArchiveEventMapper leadArchiveEventMapper;
    @Mock private CustomerMapper customerMapper;
    @Mock private PiiCryptoService piiCryptoService;
    @Mock private LeadAssignmentService leadAssignmentService;
    private LeadLifecycleServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new LeadLifecycleServiceImpl(leadMapper, leadConversionMapper, leadArchiveEventMapper,
                customerMapper, piiCryptoService, leadAssignmentService);
    }

    @Test
    void conversionCreatesCustomerSnapshotAndAuditInOneWorkflow() {
        LeadDO lead = lead(1L, "claimed", 8L);
        when(leadConversionMapper.selectOne(any())).thenReturn(null).thenReturn(null);
        when(leadMapper.selectById(1L)).thenReturn(lead);
        when(leadMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<LeadDO>>any())).thenReturn(1);
        when(piiCryptoService.encrypt("qualified")).thenReturn("note-cipher");

        Long customerId = service.convert(1L, "convert-key", 8L, "  qualified  ");

        assertNotNull(customerId);
        ArgumentCaptor<CustomerDO> customer = ArgumentCaptor.forClass(CustomerDO.class);
        verify(customerMapper).insert(customer.capture());
        assertEquals(customerId, customer.getValue().getId());
        assertEquals("claimed", lead.getStatus()); // The mapper performs the persisted CAS; the read snapshot stays unchanged.
        ArgumentCaptor<LeadConversionDO> conversion = ArgumentCaptor.forClass(LeadConversionDO.class);
        verify(leadConversionMapper).insert(conversion.capture());
        assertEquals(customerId, conversion.getValue().getCustomerId());
        assertEquals("note-cipher", conversion.getValue().getNoteCiphertext());
        verify(leadAssignmentService).recordAssignment(1L, 8L, 8L, 8L, "convert", "转为客户");
    }

    @Test
    void conversionReplayReturnsExistingCustomerWithoutCreatingAnother() {
        LeadConversionDO existing = new LeadConversionDO();
        existing.setLeadId(2L);
        existing.setCustomerId(22L);
        when(leadConversionMapper.selectOne(any())).thenReturn(existing);

        assertEquals(22L, service.convert(2L, "same-key", 8L, null));

        verify(leadMapper, never()).selectById(any());
        verify(customerMapper, never()).insert(any(CustomerDO.class));
        verify(leadConversionMapper, never()).insert(any(LeadConversionDO.class));
    }

    @Test
    void archiveStoresEncryptedReasonAndPreviousOwnerForRestore() {
        when(leadArchiveEventMapper.selectOne(any())).thenReturn(null);
        when(leadMapper.selectById(3L)).thenReturn(lead(3L, "claimed", 8L));
        when(piiCryptoService.encrypt("not qualified")).thenReturn("reason-cipher");
        when(leadMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<LeadDO>>any())).thenReturn(1);

        Long eventId = service.archive(3L, "invalid", null, "  not qualified  ", "archive-key", 8L);

        ArgumentCaptor<LeadArchiveEventDO> event = ArgumentCaptor.forClass(LeadArchiveEventDO.class);
        verify(leadArchiveEventMapper).insert(event.capture());
        assertEquals(eventId, event.getValue().getId());
        assertEquals("reason-cipher", event.getValue().getReasonCiphertext());
        assertEquals(8L, event.getValue().getPreviousOwnerUserId());
        assertEquals("claimed", event.getValue().getPreviousStatus());
        verify(leadAssignmentService).recordAssignment(3L, 8L, null, 8L, "archive", "invalid");
    }

    @Test
    void restoreConflictDoesNotMarkEventRestoredOrWriteAudit() {
        LeadArchiveEventDO event = new LeadArchiveEventDO();
        event.setId(4L);
        event.setLeadId(4L);
        event.setArchivedBy(8L);
        event.setPreviousStatus("new");
        when(leadArchiveEventMapper.selectById(4L)).thenReturn(event);
        when(leadMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<LeadDO>>any())).thenReturn(0);

        assertFalse(service.restore(4L, "误归档", 8L));

        verify(leadArchiveEventMapper, never()).updateById(any(LeadArchiveEventDO.class));
        verify(leadAssignmentService, never()).recordAssignment(any(), any(), any(), any(), any(), any());
    }

    private static LeadDO lead(Long id, String status, Long ownerId) {
        LeadDO lead = new LeadDO();
        lead.setId(id);
        lead.setStatus(status);
        lead.setOwnerUserId(ownerId);
        lead.setNameCiphertext("name-cipher");
        lead.setPhoneCiphertext("phone-cipher");
        lead.setPhoneDisplay("138****1234");
        lead.setSourceCode("web");
        return lead;
    }
}
