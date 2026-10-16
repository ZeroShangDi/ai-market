package cn.iocoder.yudao.module.callphone.service.leads;

import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.service.leads.LeadCreationService;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import jakarta.validation.Validation;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class LeadPluginImportServiceTest {
    @Test void createsReadsBackAndReplaysWithoutDuplicateWrite() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), LeadDO.class);
        LeadMapper mapper = mock(LeadMapper.class); LeadCreationService creation = mock(LeadCreationService.class);
        PiiCryptoService crypto = mock(PiiCryptoService.class);
        LeadPluginImportService service = new LeadPluginImportService();
        ReflectionTestUtils.setField(service, "leads", mapper); ReflectionTestUtils.setField(service, "creation", creation);
        ReflectionTestUtils.setField(service, "crypto", crypto);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            ReflectionTestUtils.setField(service, "validator", factory.getValidator());
            LeadSaveReqVO lead = new LeadSaveReqVO(); lead.setName("测试甲"); lead.setPhone("+12025550101"); lead.setScore(0);
            LeadDO saved = new LeadDO(); saved.setId(101L); saved.setNameCiphertext("name"); saved.setPhoneCiphertext("phone"); saved.setScore(0);
            when(mapper.selectOne(any())).thenReturn(null, saved, saved, saved);
            when(creation.create(anyString(), eq(lead), eq(7L))).thenReturn(101L);
            when(crypto.decrypt("name")).thenReturn("测试甲"); when(crypto.decrypt("phone")).thenReturn("+12025550101");
            var input = new LeadPluginImportService.Input("a".repeat(64), List.of(new LeadPluginImportService.Row(2, lead)));
            assertEquals("imported", service.execute(input, 7L).get(0).status());
            assertEquals("duplicate", service.execute(input, 7L).get(0).status());
            lead.setName("更改后"); assertEquals("failed", service.execute(input, 7L).get(0).status());
            verify(creation, times(1)).create(startsWith("wi:7:"), any(), eq(7L));
        }
    }
    @Test void invalidRowCannotReachPersistenceAndInvalidBatchIsRejected() {
        LeadPluginImportService service = new LeadPluginImportService(); LeadCreationService creation = mock(LeadCreationService.class);
        ReflectionTestUtils.setField(service, "creation", creation);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            ReflectionTestUtils.setField(service, "validator", factory.getValidator());
            var row = new LeadPluginImportService.Row(2, new LeadSaveReqVO());
            assertEquals("failed", service.execute(new LeadPluginImportService.Input("b".repeat(64), List.of(row)), 7L).get(0).status());
            assertThrows(IllegalArgumentException.class, () -> service.execute(new LeadPluginImportService.Input("bad", List.of(row)), 7L));
            assertThrows(IllegalArgumentException.class, () -> service.execute(new LeadPluginImportService.Input("b".repeat(64), List.of(row, row)), 7L));
            verifyNoInteractions(creation);
        }
    }
}
