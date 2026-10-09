package cn.iocoder.yudao.module.callphone.service.ai;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationAdoptReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationDismissReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationPageRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationSourceRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.RecommendationUpdateReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.CallSummaryDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.FollowUpRecommendationDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.FollowUpTaskDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.ai.CallSummaryMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.ai.FollowUpRecommendationMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.FollowUpTaskMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class FollowUpRecommendationService {

    @Resource private FollowUpRecommendationMapper recommendationMapper;
    @Resource private CallSummaryMapper summaryMapper;
    @Resource private CallRecordMapper callRecordMapper;
    @Resource private CustomerMapper customerMapper;
    @Resource private FollowUpTaskMapper taskMapper;
    @Resource private PiiCryptoService cryptoService;

    public RecommendationPageRespVO getPage(RecommendationPageReqVO reqVO, Long userId) {
        PageResult<FollowUpRecommendationDO> page = recommendationMapper.selectPage(reqVO, userId);
        RecommendationPageRespVO resp = new RecommendationPageRespVO();
        resp.setList(page.getList().stream().map(row -> toResp(row, requireOwnedCall(row.getCallRecordId(), userId))).toList());
        resp.setTotal(page.getTotal()); resp.setPendingCount(recommendationMapper.countByStatus(userId, "pending"));
        resp.setAdoptedCount(recommendationMapper.countByStatus(userId, "adopted")); resp.setDismissedCount(recommendationMapper.countByStatus(userId, "dismissed"));
        return resp;
    }

    public List<RecommendationSourceRespVO> getAvailableSources(Long userId) {
        return summaryMapper.selectReviewedWithNextStep(userId).stream()
                .filter(summary -> recommendationMapper.selectByCallAndSummary(summary.getCallRecordId(), summary.getId(), summary.getVersion(), userId) == null)
                .map(summary -> toSource(summary, userId)).filter(Objects::nonNull).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public Long prepare(Long callRecordId, Long userId) {
        CallSummaryDO summary = summaryMapper.selectByCallRecordId(callRecordId, userId);
        if (summary == null || !"reviewed".equals(summary.getReviewStatus()) || summary.getNextStepCiphertext() == null) {
            throw exception(ErrorCodeConstants.AI_RECOMMENDATION_SOURCE_INVALID);
        }
        if (recommendationMapper.selectByCallAndSummary(callRecordId, summary.getId(), summary.getVersion(), userId) != null) {
            throw exception(ErrorCodeConstants.AI_RECOMMENDATION_STATE_CONFLICT);
        }
        CallRecordDO call = requireOwnedCall(callRecordId, userId);
        if (call.getEndedAt() == null || call.getCustomerId() == null) throw exception(ErrorCodeConstants.AI_RECOMMENDATION_SOURCE_INVALID);
        requireOwnedActiveCustomer(call.getCustomerId(), userId);
        FollowUpRecommendationDO row = new FollowUpRecommendationDO();
        row.setId(IdUtil.getSnowflake().nextId());
        row.setCallRecordId(callRecordId); row.setSourceSummaryId(summary.getId()); row.setSourceSummaryVersion(summary.getVersion());
        row.setCustomerId(call.getCustomerId()); row.setOwnerUserId(userId); row.setSourceSummaryOrigin(summary.getOrigin());
        row.setContentCiphertext(cryptoService.encrypt(cryptoService.decrypt(summary.getNextStepCiphertext())));
        row.setReviewStatus("pending"); row.setDueAt(LocalDateTime.now().plusDays(1).withHour(10).withMinute(0).withSecond(0).withNano(0)); row.setVersion(1);
        recommendationMapper.insert(row);
        return row.getId();
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean update(RecommendationUpdateReqVO reqVO, Long userId) {
        FollowUpRecommendationDO row = requirePending(reqVO.getId(), reqVO.getExpectedVersion(), userId);
        int updated = recommendationMapper.update(null, new LambdaUpdateWrapper<FollowUpRecommendationDO>()
                .eq(FollowUpRecommendationDO::getId, row.getId()).eq(FollowUpRecommendationDO::getOwnerUserId, userId)
                .eq(FollowUpRecommendationDO::getVersion, reqVO.getExpectedVersion()).eq(FollowUpRecommendationDO::getReviewStatus, "pending")
                .set(FollowUpRecommendationDO::getContentCiphertext, cryptoService.encrypt(reqVO.getContent().trim()))
                .set(FollowUpRecommendationDO::getDueAt, reqVO.getDueAt()).set(FollowUpRecommendationDO::getVersion, reqVO.getExpectedVersion() + 1));
        if (updated == 0) throw exception(ErrorCodeConstants.AI_RECOMMENDATION_STATE_CONFLICT);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public Long adopt(RecommendationAdoptReqVO reqVO, Long userId) {
        FollowUpRecommendationDO row = recommendationMapper.selectById(reqVO.getId());
        if (row != null && Objects.equals(row.getOwnerUserId(), userId) && "adopted".equals(row.getReviewStatus()) && row.getFollowUpTaskId() != null) return row.getFollowUpTaskId();
        row = requirePending(reqVO.getId(), reqVO.getExpectedVersion(), userId);
        CallRecordDO call = requireOwnedCall(row.getCallRecordId(), userId);
        CustomerDO customer = requireOwnedActiveCustomer(row.getCustomerId(), userId);
        Long taskId = IdUtil.getSnowflake().nextId();
        LocalDateTime now = LocalDateTime.now();
        FollowUpTaskDO task = new FollowUpTaskDO();
        task.setId(taskId); task.setCustomerId(customer.getId()); task.setOwnerUserId(userId);
        task.setTitleCiphertext(cryptoService.encrypt(reqVO.getTitle().trim())); task.setContentCiphertext(row.getContentCiphertext());
        task.setDueAt(reqVO.getDueAt()); task.setStatus("pending"); task.setSourceCallRecordId(call.getId()); taskMapper.insert(task);
        int updated = recommendationMapper.update(null, new LambdaUpdateWrapper<FollowUpRecommendationDO>()
                .eq(FollowUpRecommendationDO::getId, row.getId()).eq(FollowUpRecommendationDO::getOwnerUserId, userId)
                .eq(FollowUpRecommendationDO::getVersion, reqVO.getExpectedVersion()).eq(FollowUpRecommendationDO::getReviewStatus, "pending")
                .set(FollowUpRecommendationDO::getReviewStatus, "adopted").set(FollowUpRecommendationDO::getFollowUpTaskId, taskId)
                .set(FollowUpRecommendationDO::getReviewerId, userId).set(FollowUpRecommendationDO::getReviewedAt, now)
                .set(FollowUpRecommendationDO::getDueAt, reqVO.getDueAt()).set(FollowUpRecommendationDO::getVersion, reqVO.getExpectedVersion() + 1));
        if (updated == 0) throw exception(ErrorCodeConstants.AI_RECOMMENDATION_STATE_CONFLICT);
        return taskId;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean dismiss(RecommendationDismissReqVO reqVO, Long userId) {
        FollowUpRecommendationDO row = requirePending(reqVO.getId(), reqVO.getExpectedVersion(), userId);
        int updated = recommendationMapper.update(null, new LambdaUpdateWrapper<FollowUpRecommendationDO>()
                .eq(FollowUpRecommendationDO::getId, row.getId()).eq(FollowUpRecommendationDO::getOwnerUserId, userId)
                .eq(FollowUpRecommendationDO::getVersion, reqVO.getExpectedVersion()).eq(FollowUpRecommendationDO::getReviewStatus, "pending")
                .set(FollowUpRecommendationDO::getReviewStatus, "dismissed")
                .set(FollowUpRecommendationDO::getReviewReasonCiphertext, cryptoService.encrypt(reqVO.getReason().trim()))
                .set(FollowUpRecommendationDO::getReviewerId, userId).set(FollowUpRecommendationDO::getReviewedAt, LocalDateTime.now())
                .set(FollowUpRecommendationDO::getVersion, reqVO.getExpectedVersion() + 1));
        if (updated == 0) throw exception(ErrorCodeConstants.AI_RECOMMENDATION_STATE_CONFLICT);
        return true;
    }

    private FollowUpRecommendationDO requirePending(Long id, Integer version, Long userId) {
        FollowUpRecommendationDO row = recommendationMapper.selectById(id);
        if (row == null || !Objects.equals(row.getOwnerUserId(), userId) || !"pending".equals(row.getReviewStatus()) || !Objects.equals(row.getVersion(), version)) {
            throw exception(ErrorCodeConstants.AI_RECOMMENDATION_STATE_CONFLICT);
        }
        return row;
    }

    private CallRecordDO requireOwnedCall(Long callRecordId, Long userId) {
        CallRecordDO call = callRecordMapper.selectById(callRecordId);
        if (call == null || !Objects.equals(call.getOwnerUserId(), userId)) throw exception(ErrorCodeConstants.AI_RECOMMENDATION_SOURCE_INVALID);
        return call;
    }

    private CustomerDO requireOwnedActiveCustomer(Long customerId, Long userId) {
        CustomerDO customer = customerMapper.selectById(customerId);
        if (customer == null || !Objects.equals(customer.getOwnerUserId(), userId) || !"active".equals(customer.getStatus())) {
            throw exception(ErrorCodeConstants.AI_RECOMMENDATION_CUSTOMER_INVALID);
        }
        return customer;
    }

    private RecommendationSourceRespVO toSource(CallSummaryDO summary, Long userId) {
        CallRecordDO call = requireOwnedCall(summary.getCallRecordId(), userId);
        if (call.getEndedAt() == null || call.getCustomerId() == null) return null;
        CustomerDO customer = customerMapper.selectById(call.getCustomerId());
        if (customer == null || !Objects.equals(customer.getOwnerUserId(), userId) || !"active".equals(customer.getStatus())) return null;
        RecommendationSourceRespVO vo = new RecommendationSourceRespVO();
        vo.setCallRecordId(call.getId()); vo.setCustomerName(cryptoService.decrypt(customer.getNameCiphertext())); vo.setCallAt(call.getStartedAt());
        vo.setSummaryOrigin(summary.getOrigin()); vo.setNextStep(cryptoService.decrypt(summary.getNextStepCiphertext())); vo.setSummaryVersion(summary.getVersion());
        return vo;
    }

    private RecommendationRespVO toResp(FollowUpRecommendationDO row, CallRecordDO call) {
        CustomerDO customer = customerMapper.selectById(row.getCustomerId());
        RecommendationRespVO vo = new RecommendationRespVO();
        vo.setId(row.getId()); vo.setCustomerId(row.getCustomerId());
        vo.setCustomerName(customer == null ? cryptoService.decrypt(call.getCustomerNameCiphertext()) : cryptoService.decrypt(customer.getNameCiphertext()));
        vo.setCallRecordId(row.getCallRecordId()); vo.setCallAt(call.getStartedAt()); vo.setSourceSummaryOrigin(row.getSourceSummaryOrigin());
        vo.setContent(cryptoService.decrypt(row.getContentCiphertext())); vo.setStatus(row.getReviewStatus()); vo.setDueAt(row.getDueAt());
        vo.setReviewReason(cryptoService.decrypt(row.getReviewReasonCiphertext()));
        vo.setFollowUpTaskId(row.getFollowUpTaskId()); vo.setVersion(row.getVersion()); vo.setUpdateTime(row.getUpdateTime());
        return vo;
    }
}
