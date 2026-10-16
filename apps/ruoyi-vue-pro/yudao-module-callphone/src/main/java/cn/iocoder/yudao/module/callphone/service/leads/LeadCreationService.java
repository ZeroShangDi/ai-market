package cn.iocoder.yudao.module.callphone.service.leads;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Shared PC/Work creation use case; preserves encryption and configured auto assignment. */
@Service
public class LeadCreationService {
    @Resource private LeadMapper leadMapper;
    @Resource private PiiCryptoService piiCryptoService;
    @Resource private LeadAssignmentService leadAssignmentService;
    @Transactional(rollbackFor = Exception.class)
    public Long create(String idempotencyKey, LeadSaveReqVO reqVO, Long actorId) {
        LeadDO prior = leadMapper.selectOne(new LambdaQueryWrapperX<LeadDO>().eq(LeadDO::getIdempotencyKey, idempotencyKey));
        if (prior != null) return prior.getId();
        String phone = reqVO.getPhone().replaceAll("[ -]", "");
        LeadDO lead = new LeadDO();
        lead.setId(IdUtil.getSnowflake().nextId());
        lead.setNameCiphertext(piiCryptoService.encrypt(reqVO.getName().trim()));
        lead.setPhoneCiphertext(piiCryptoService.encrypt(phone));
        lead.setPhoneDisplay(maskPhone(phone));
        lead.setSourceCode(reqVO.getSourceCode()); lead.setScore(reqVO.getScore() == null ? 0 : reqVO.getScore());
        lead.setStatus("new"); lead.setIdempotencyKey(idempotencyKey);
        leadMapper.insert(lead);
        leadAssignmentService.autoAssignNewLead(lead.getId(), actorId);
        return lead.getId();
    }
    private String maskPhone(String phone) { return phone.length() > 7 ? phone.substring(0, 3) + " **** " + phone.substring(phone.length() - 4) : "****"; }
}
