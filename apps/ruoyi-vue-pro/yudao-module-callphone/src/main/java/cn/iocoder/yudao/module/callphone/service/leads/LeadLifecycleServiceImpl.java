package cn.iocoder.yudao.module.callphone.service.leads;

import cn.hutool.core.util.IdUtil;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadArchiveEventDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadConversionDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadArchiveEventMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadConversionMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Set;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class LeadLifecycleServiceImpl implements LeadLifecycleService {

    private final LeadMapper leadMapper;
    private final LeadConversionMapper leadConversionMapper;
    private final LeadArchiveEventMapper leadArchiveEventMapper;
    private final CustomerMapper customerMapper;
    private final PiiCryptoService piiCryptoService;
    private final LeadAssignmentService leadAssignmentService;

    public LeadLifecycleServiceImpl(LeadMapper leadMapper, LeadConversionMapper leadConversionMapper,
                                    LeadArchiveEventMapper leadArchiveEventMapper, CustomerMapper customerMapper,
                                    PiiCryptoService piiCryptoService, LeadAssignmentService leadAssignmentService) {
        this.leadMapper = leadMapper;
        this.leadConversionMapper = leadConversionMapper;
        this.leadArchiveEventMapper = leadArchiveEventMapper;
        this.customerMapper = customerMapper;
        this.piiCryptoService = piiCryptoService;
        this.leadAssignmentService = leadAssignmentService;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long convert(Long leadId, String idempotencyKey, Long userId, String note) {
        LeadConversionDO prior = leadConversionMapper.selectOne(new LambdaQueryWrapperX<LeadConversionDO>()
                .eq(LeadConversionDO::getIdempotencyKey, idempotencyKey));
        if (prior != null) {
            if (!Objects.equals(prior.getLeadId(), leadId)) throw exception(ErrorCodeConstants.LEAD_IDEMPOTENCY_CONFLICT);
            return prior.getCustomerId();
        }
        LeadDO lead = leadMapper.selectById(leadId);
        if (lead == null || !"claimed".equals(lead.getStatus()) || !Objects.equals(lead.getOwnerUserId(), userId)) {
            return null;
        }
        LeadConversionDO priorConversion = leadConversionMapper.selectOne(new LambdaQueryWrapperX<LeadConversionDO>()
                .eq(LeadConversionDO::getLeadId, leadId));
        if (priorConversion != null) return priorConversion.getCustomerId();

        Long customerId = IdUtil.getSnowflake().nextId();
        CustomerDO customer = new CustomerDO();
        customer.setId(customerId);
        customer.setNameCiphertext(lead.getNameCiphertext());
        customer.setPhoneCiphertext(lead.getPhoneCiphertext());
        customer.setPhoneDisplay(lead.getPhoneDisplay());
        customer.setStage("new");
        customer.setSource(lead.getSourceCode());
        customer.setOwnerUserId(userId);
        customer.setStatus("active");
        customerMapper.insert(customer);

        LocalDateTime convertedAt = LocalDateTime.now();
        LeadConversionDO conversion = new LeadConversionDO();
        conversion.setId(IdUtil.getSnowflake().nextId());
        conversion.setLeadId(lead.getId());
        conversion.setCustomerId(customerId);
        conversion.setLeadNameCiphertext(lead.getNameCiphertext());
        conversion.setCustomerNameCiphertext(lead.getNameCiphertext());
        conversion.setPhoneDisplay(lead.getPhoneDisplay());
        conversion.setSourceCode(lead.getSourceCode());
        conversion.setConvertedBy(userId);
        conversion.setNoteCiphertext(note == null || note.isBlank() ? null : piiCryptoService.encrypt(note.trim()));
        conversion.setIdempotencyKey(idempotencyKey);
        conversion.setConvertedAt(convertedAt);
        leadConversionMapper.insert(conversion);

        int updated = leadMapper.update(null, new LambdaUpdateWrapper<LeadDO>()
                .set(LeadDO::getStatus, "converted")
                .set(LeadDO::getUpdateTime, LocalDateTime.now())
                .eq(LeadDO::getId, leadId)
                .eq(LeadDO::getOwnerUserId, userId)
                .eq(LeadDO::getStatus, "claimed"));
        if (updated != 1) throw new IllegalStateException("线索状态已变化，转换已回滚");
        leadAssignmentService.recordAssignment(leadId, userId, userId, userId, "convert", "转为客户");
        return customerId;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long archive(Long leadId, String archiveType, Long targetLeadId, String reason,
                        String idempotencyKey, Long userId) {
        LeadArchiveEventDO prior = leadArchiveEventMapper.selectOne(new LambdaQueryWrapperX<LeadArchiveEventDO>()
                .eq(LeadArchiveEventDO::getIdempotencyKey, idempotencyKey));
        if (prior != null) {
            if (!Objects.equals(prior.getLeadId(), leadId)) throw exception(ErrorCodeConstants.LEAD_IDEMPOTENCY_CONFLICT);
            return prior.getId();
        }
        LeadDO lead = leadMapper.selectById(leadId);
        if (lead == null || !Set.of("new", "claimed").contains(lead.getStatus())
                || (lead.getOwnerUserId() != null && !Objects.equals(lead.getOwnerUserId(), userId))) return null;
        if ("duplicate".equals(archiveType)) {
            LeadDO target = targetLeadId == null ? null : leadMapper.selectById(targetLeadId);
            if (target == null || Objects.equals(target.getId(), leadId)
                    || !Set.of("new", "claimed").contains(target.getStatus())) {
                throw exception(ErrorCodeConstants.LEAD_ARCHIVE_TARGET_INVALID);
            }
        }

        LocalDateTime now = LocalDateTime.now();
        LeadArchiveEventDO event = new LeadArchiveEventDO();
        event.setId(IdUtil.getSnowflake().nextId());
        event.setLeadId(leadId);
        event.setLeadNameCiphertext(lead.getNameCiphertext());
        event.setPhoneDisplay(lead.getPhoneDisplay());
        event.setArchiveType(archiveType);
        event.setReasonCiphertext(piiCryptoService.encrypt(reason.trim()));
        event.setTargetLeadId(targetLeadId);
        event.setPreviousOwnerUserId(lead.getOwnerUserId());
        event.setPreviousStatus(lead.getStatus());
        event.setArchivedBy(userId);
        event.setArchivedAt(now);
        event.setIdempotencyKey(idempotencyKey);
        leadArchiveEventMapper.insert(event);

        LambdaUpdateWrapper<LeadDO> update = new LambdaUpdateWrapper<LeadDO>()
                .set(LeadDO::getStatus, "archived")
                .set(LeadDO::getUpdateTime, now)
                .eq(LeadDO::getId, leadId)
                .eq(LeadDO::getStatus, lead.getStatus());
        if (lead.getOwnerUserId() == null) update.isNull(LeadDO::getOwnerUserId);
        else update.eq(LeadDO::getOwnerUserId, lead.getOwnerUserId());
        if (leadMapper.update(null, update) != 1) throw exception(ErrorCodeConstants.LEAD_STATE_CONFLICT);
        leadAssignmentService.recordAssignment(leadId, lead.getOwnerUserId(), null, userId, "archive", archiveType);
        return event.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean restore(Long archiveEventId, String reason, Long userId) {
        LeadArchiveEventDO event = leadArchiveEventMapper.selectById(archiveEventId);
        if (event == null || !Objects.equals(event.getArchivedBy(), userId) || event.getRestoredAt() != null) return false;
        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<LeadDO> update = new LambdaUpdateWrapper<LeadDO>()
                .set(LeadDO::getStatus, event.getPreviousStatus())
                .set(LeadDO::getOwnerUserId, event.getPreviousOwnerUserId())
                .set(LeadDO::getUpdateTime, now)
                .eq(LeadDO::getId, event.getLeadId())
                .eq(LeadDO::getStatus, "archived");
        if (leadMapper.update(null, update) != 1) return false;
        event.setRestoredAt(now);
        leadArchiveEventMapper.updateById(event);
        leadAssignmentService.recordAssignment(event.getLeadId(), null, event.getPreviousOwnerUserId(), userId,
                "restore", reason.trim());
        return true;
    }
}
