package cn.iocoder.yudao.module.callphone.service.ai;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiReviewSuggestionDecisionReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiReviewSuggestionPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiReviewSuggestionPageRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiReviewSuggestionRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.AiReviewSuggestionDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.ai.AiReviewSuggestionMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DuplicateKeyException;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class AiReviewSuggestionService {

    @Resource private AiReviewSuggestionMapper mapper;
    @Resource private CallRecordMapper callRecordMapper;
    @Resource private CustomerMapper customerMapper;
    @Resource private PiiCryptoService cryptoService;
    @Resource private AdminUserApi adminUserApi;

    public AiReviewSuggestionPageRespVO getPage(AiReviewSuggestionPageReqVO reqVO, Long userId) {
        PageResult<AiReviewSuggestionDO> page = mapper.selectPage(reqVO, userId);
        AiReviewSuggestionPageRespVO resp = new AiReviewSuggestionPageRespVO();
        resp.setList(page.getList().stream().map(row -> toResp(row, requireOwnedCall(row.getCallRecordId(), userId))).toList());
        resp.setTotal(page.getTotal());
        resp.setPendingCount(mapper.countByStatus(userId, "pending"));
        resp.setHighRiskPendingCount(mapper.countPendingHighRisk(userId));
        resp.setReviewedCount(mapper.countByStatus(userId, "approved") + mapper.countByStatus(userId, "edited") + mapper.countByStatus(userId, "rejected"));
        return resp;
    }

    public AiReviewSuggestionRespVO get(Long id, Long userId) {
        AiReviewSuggestionDO row = requireOwned(id, userId);
        return toResp(row, requireOwnedCall(row.getCallRecordId(), userId));
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean review(AiReviewSuggestionDecisionReqVO reqVO, Long userId) {
        AiReviewSuggestionDO row = requireOwned(reqVO.getId(), userId);
        if (!"pending".equals(row.getReviewStatus()) || !Objects.equals(row.getVersion(), reqVO.getExpectedVersion())) {
            throw exception(ErrorCodeConstants.AI_REVIEW_SUGGESTION_STATE_CONFLICT);
        }
        if ("edited".equals(reqVO.getDecision()) && (reqVO.getSuggestion() == null || reqVO.getSuggestion().isBlank())) {
            throw exception(ErrorCodeConstants.AI_REVIEW_SUGGESTION_INVALID);
        }
        LambdaUpdateWrapper<AiReviewSuggestionDO> update = new LambdaUpdateWrapper<AiReviewSuggestionDO>()
                .eq(AiReviewSuggestionDO::getId, row.getId()).eq(AiReviewSuggestionDO::getOwnerUserId, userId)
                .eq(AiReviewSuggestionDO::getReviewStatus, "pending").eq(AiReviewSuggestionDO::getVersion, reqVO.getExpectedVersion())
                .set(AiReviewSuggestionDO::getReviewStatus, reqVO.getDecision())
                .set(AiReviewSuggestionDO::getReviewReasonCiphertext, cryptoService.encrypt(reqVO.getReason().trim()))
                .set(AiReviewSuggestionDO::getReviewerId, userId).set(AiReviewSuggestionDO::getReviewedAt, LocalDateTime.now())
                .set(AiReviewSuggestionDO::getVersion, reqVO.getExpectedVersion() + 1);
        if ("edited".equals(reqVO.getDecision())) {
            update.set(AiReviewSuggestionDO::getSuggestionCiphertext, cryptoService.encrypt(reqVO.getSuggestion().trim()));
        }
        if (mapper.update(null, update) == 0) throw exception(ErrorCodeConstants.AI_REVIEW_SUGGESTION_STATE_CONFLICT);
        return true;
    }

    /** Called by the customer-side AI orchestration after an explicitly authorized model run. */
    @Transactional(rollbackFor = Exception.class)
    public Long recordModelOutput(Long callRecordId, Long ownerUserId, String sourceRunId,
                                  String riskLevel, String suggestion, String evidence) {
        if (sourceRunId == null || sourceRunId.isBlank() || suggestion == null || suggestion.isBlank()
                || evidence == null || evidence.isBlank() || !"low".equals(riskLevel) && !"medium".equals(riskLevel) && !"high".equals(riskLevel)) {
            throw exception(ErrorCodeConstants.AI_REVIEW_SUGGESTION_INVALID);
        }
        AiReviewSuggestionDO existing = mapper.selectByRunId(sourceRunId);
        if (existing != null) return existing.getId();
        CallRecordDO call = requireOwnedCall(callRecordId, ownerUserId);
        if (call.getEndedAt() == null || call.getCustomerId() == null) throw exception(ErrorCodeConstants.AI_REVIEW_SUGGESTION_INVALID);
        CustomerDO customer = customerMapper.selectById(call.getCustomerId());
        if (customer == null || !Objects.equals(customer.getOwnerUserId(), ownerUserId)) throw exception(ErrorCodeConstants.AI_REVIEW_SUGGESTION_INVALID);
        AiReviewSuggestionDO row = new AiReviewSuggestionDO();
        row.setId(IdUtil.getSnowflake().nextId()); row.setCallRecordId(callRecordId); row.setCustomerId(call.getCustomerId());
        row.setOwnerUserId(ownerUserId); row.setSourceRunId(sourceRunId); row.setRiskLevel(riskLevel);
        row.setSuggestionCiphertext(cryptoService.encrypt(suggestion.trim())); row.setEvidenceCiphertext(cryptoService.encrypt(evidence.trim()));
        row.setReviewStatus("pending"); row.setVersion(1);
        try {
            mapper.insert(row);
            return row.getId();
        } catch (DuplicateKeyException duplicate) {
            AiReviewSuggestionDO alreadyRecorded = mapper.selectByRunId(sourceRunId);
            if (alreadyRecorded != null) return alreadyRecorded.getId();
            throw duplicate;
        }
    }

    private AiReviewSuggestionDO requireOwned(Long id, Long userId) {
        AiReviewSuggestionDO row = mapper.selectById(id);
        if (row == null || !Objects.equals(row.getOwnerUserId(), userId)) throw exception(ErrorCodeConstants.AI_REVIEW_SUGGESTION_NOT_FOUND);
        return row;
    }

    private CallRecordDO requireOwnedCall(Long id, Long userId) {
        CallRecordDO call = callRecordMapper.selectById(id);
        if (call == null || !Objects.equals(call.getOwnerUserId(), userId)) throw exception(ErrorCodeConstants.AI_REVIEW_SUGGESTION_NOT_FOUND);
        return call;
    }

    private AiReviewSuggestionRespVO toResp(AiReviewSuggestionDO row, CallRecordDO call) {
        CustomerDO customer = customerMapper.selectById(row.getCustomerId());
        AiReviewSuggestionRespVO resp = new AiReviewSuggestionRespVO();
        resp.setId(row.getId()); resp.setCallRecordId(row.getCallRecordId()); resp.setSourceRunId(row.getSourceRunId());
        resp.setCustomerName(customer == null ? cryptoService.decrypt(call.getCustomerNameCiphertext()) : cryptoService.decrypt(customer.getNameCiphertext()));
        resp.setCreatedAt(row.getCreateTime()); resp.setRiskLevel(row.getRiskLevel());
        resp.setSuggestion(cryptoService.decrypt(row.getSuggestionCiphertext())); resp.setEvidence(cryptoService.decrypt(row.getEvidenceCiphertext()));
        resp.setStatus(row.getReviewStatus());
        if (row.getReviewerId() != null) {
            AdminUserRespDTO reviewer = adminUserApi.getUser(row.getReviewerId());
            resp.setReviewerName(reviewer == null ? null : reviewer.getNickname());
        }
        resp.setReviewedAt(row.getReviewedAt()); resp.setReviewReason(cryptoService.decrypt(row.getReviewReasonCiphertext())); resp.setVersion(row.getVersion());
        return resp;
    }
}
