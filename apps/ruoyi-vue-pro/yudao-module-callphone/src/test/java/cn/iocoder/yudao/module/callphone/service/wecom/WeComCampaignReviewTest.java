package cn.iocoder.yudao.module.callphone.service.wecom;

import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComCampaignReviewReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComCampaignAuditDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComCampaignDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComCampaignAuditMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.wecom.WeComCampaignMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WeComCampaignReviewTest {
    @Mock private WeComCampaignMapper campaignMapper;
    @Mock private WeComCampaignAuditMapper auditMapper;
    @Mock private PiiCryptoService crypto;

    private WeComCampaignService service;

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), WeComCampaignDO.class);
        service = new WeComCampaignService();
        ReflectionTestUtils.setField(service, "campaignMapper", campaignMapper);
        ReflectionTestUtils.setField(service, "auditMapper", auditMapper);
        ReflectionTestUtils.setField(service, "crypto", crypto);
        lenient().when(crypto.decrypt(any(String.class))).thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(crypto.encrypt(any(String.class))).thenAnswer(invocation -> "encrypted:" + invocation.getArgument(0));
    }

    @Test
    void shouldApprovePendingCampaignAndWriteAuditWithoutSending() {
        WeComCampaignDO row = pendingCampaign();
        when(campaignMapper.selectById(41L)).thenReturn(row, row);
        when(campaignMapper.update(isNull(), any())).thenAnswer(invocation -> {
            row.setStatus("approved");
            row.setVersion(5);
            return 1;
        });
        WeComCampaignReviewReqVO req = request(4, "");

        var result = service.approve(req, 9L);

        assertEquals("approved", result.getStatus());
        assertEquals(5, result.getVersion());
        ArgumentCaptor<WeComCampaignAuditDO> event = ArgumentCaptor.forClass(WeComCampaignAuditDO.class);
        verify(auditMapper).insert(event.capture());
        assertEquals("approved", event.getValue().getAction());
        assertEquals(9L, event.getValue().getActorId());
        assertEquals(5, event.getValue().getCampaignVersion());
        assertNull(event.getValue().getNoteCiphertext());
    }

    @Test
    void shouldRequireAnEncryptedReasonWhenRejecting() {
        WeComCampaignDO row = pendingCampaign();
        when(campaignMapper.selectById(41L)).thenReturn(row, row);
        when(campaignMapper.update(isNull(), any())).thenAnswer(invocation -> {
            row.setStatus("rejected");
            row.setVersion(5);
            return 1;
        });
        WeComCampaignReviewReqVO req = request(4, "  需修正文案  ");

        var result = service.reject(req, 10L);

        assertEquals("rejected", result.getStatus());
        ArgumentCaptor<WeComCampaignAuditDO> event = ArgumentCaptor.forClass(WeComCampaignAuditDO.class);
        verify(auditMapper).insert(event.capture());
        assertEquals("rejected", event.getValue().getAction());
        assertEquals("encrypted:需修正文案", event.getValue().getNoteCiphertext());
    }

    @Test
    void shouldNotAllowBlankRejectionReasonOrReviewStaleState() {
        assertThrows(RuntimeException.class, () -> service.reject(request(4, "  "), 10L));
        verify(campaignMapper, never()).selectById(any());
        verify(auditMapper, never()).insert(any(WeComCampaignAuditDO.class));

        WeComCampaignDO row = pendingCampaign();
        when(campaignMapper.selectById(41L)).thenReturn(row);
        when(campaignMapper.update(isNull(), any())).thenReturn(0);
        assertThrows(RuntimeException.class, () -> service.approve(request(4, ""), 10L));
        verify(auditMapper, never()).insert(any(WeComCampaignAuditDO.class));
    }

    private WeComCampaignDO pendingCampaign() {
        WeComCampaignDO row = new WeComCampaignDO();
        row.setId(41L);
        row.setStatus("pending_review");
        row.setVersion(4);
        row.setCampaignNameCiphertext("campaign");
        row.setMessageContentCiphertext("copy");
        row.setCriteriaCiphertext("{\"ownerKey\":\"owner\",\"tag\":\"\"}");
        return row;
    }

    private WeComCampaignReviewReqVO request(int version, String note) {
        WeComCampaignReviewReqVO req = new WeComCampaignReviewReqVO();
        req.setId(41L);
        req.setExpectedVersion(version);
        req.setNote(note);
        return req;
    }
}
