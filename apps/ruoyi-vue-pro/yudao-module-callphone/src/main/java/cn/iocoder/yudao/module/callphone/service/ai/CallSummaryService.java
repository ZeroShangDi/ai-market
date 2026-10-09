package cn.iocoder.yudao.module.callphone.service.ai;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.CallSummaryPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.CallSummaryRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.CallSummaryReviewReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.CallSummarySaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.CallSummaryDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.ai.CallSummaryMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class CallSummaryService {

    @Resource private CallSummaryMapper summaryMapper;
    @Resource private CallRecordMapper callRecordMapper;
    @Resource private PiiCryptoService cryptoService;

    public PageResult<CallSummaryRespVO> getPage(CallSummaryPageReqVO reqVO, Long userId) {
        PageResult<CallSummaryDO> page = summaryMapper.selectPage(reqVO, userId);
        List<CallSummaryRespVO> rows = page.getList().stream().map(row -> toResp(row, requireAccessibleCall(row.getCallRecordId(), userId))).toList();
        return new PageResult<>(rows, page.getTotal());
    }

    public CallSummaryRespVO get(Long callRecordId, Long userId) {
        CallSummaryDO summary = summaryMapper.selectByCallRecordId(callRecordId, userId);
        if (summary == null) return null;
        return toResp(summary, requireAccessibleCall(callRecordId, userId));
    }

    public List<CallSummaryRespVO> getAvailableCalls(Long userId) {
        Set<Long> covered = summaryMapper.selectByOwner(userId).stream()
                .map(CallSummaryDO::getCallRecordId).collect(Collectors.toSet());
        LambdaQueryWrapperX<CallRecordDO> query = new LambdaQueryWrapperX<>();
        query.eq(CallRecordDO::getOwnerUserId, userId).isNotNull(CallRecordDO::getEndedAt);
        query.orderByDesc(CallRecordDO::getStartedAt);
        if (!covered.isEmpty()) query.notIn(CallRecordDO::getId, covered);
        query.last("LIMIT 100");
        return callRecordMapper.selectList(query).stream().map(this::toAvailableCall).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(CallSummarySaveReqVO reqVO, Long userId) {
        CallRecordDO call = requireAccessibleCall(reqVO.getCallRecordId(), userId);
        if (call.getEndedAt() == null) throw exception(ErrorCodeConstants.AI_SUMMARY_CALL_UNAVAILABLE);
        CallSummaryDO existing = summaryMapper.selectByCallRecordId(reqVO.getCallRecordId(), userId);
        if (existing == null) {
            if (reqVO.getExpectedVersion() != 0) throw exception(ErrorCodeConstants.AI_SUMMARY_VERSION_CONFLICT);
            CallSummaryDO row = new CallSummaryDO();
            row.setId(IdUtil.getSnowflake().nextId());
            row.setCallRecordId(reqVO.getCallRecordId());
            row.setOwnerUserId(userId);
            row.setVersion(1);
            row.setOrigin("manual");
            row.setReviewStatus("draft");
            setContent(row, reqVO);
            return summaryMapper.insert(row) > 0;
        }
        if (!existing.getVersion().equals(reqVO.getExpectedVersion())) throw exception(ErrorCodeConstants.AI_SUMMARY_VERSION_CONFLICT);
        LambdaUpdateWrapper<CallSummaryDO> update = new LambdaUpdateWrapper<CallSummaryDO>()
                .eq(CallSummaryDO::getId, existing.getId())
                .eq(CallSummaryDO::getVersion, reqVO.getExpectedVersion())
                .set(CallSummaryDO::getSummaryCiphertext, encrypt(reqVO.getSummary()))
                .set(CallSummaryDO::getCustomerNeedsCiphertext, encrypt(reqVO.getCustomerNeeds()))
                .set(CallSummaryDO::getObjectionsCiphertext, encrypt(reqVO.getObjections()))
                .set(CallSummaryDO::getNextStepCiphertext, encrypt(reqVO.getNextStep()))
                .set(CallSummaryDO::getOrigin, "manual")
                .set(CallSummaryDO::getReviewStatus, "draft")
                .set(CallSummaryDO::getReviewedAt, null)
                .set(CallSummaryDO::getReviewedBy, null)
                .set(CallSummaryDO::getVersion, reqVO.getExpectedVersion() + 1);
        if (summaryMapper.update(null, update) == 0) throw exception(ErrorCodeConstants.AI_SUMMARY_VERSION_CONFLICT);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean review(CallSummaryReviewReqVO reqVO, Long userId) {
        CallSummaryDO summary = summaryMapper.selectByCallRecordId(reqVO.getCallRecordId(), userId);
        if (summary == null || !summary.getVersion().equals(reqVO.getExpectedVersion())
                || !"draft".equals(summary.getReviewStatus())) {
            throw exception(ErrorCodeConstants.AI_SUMMARY_VERSION_CONFLICT);
        }
        LocalDateTime reviewedAt = LocalDateTime.now();
        int updated = summaryMapper.update(null, new LambdaUpdateWrapper<CallSummaryDO>()
                .eq(CallSummaryDO::getId, summary.getId())
                .eq(CallSummaryDO::getOwnerUserId, userId)
                .eq(CallSummaryDO::getVersion, reqVO.getExpectedVersion())
                .eq(CallSummaryDO::getReviewStatus, "draft")
                .set(CallSummaryDO::getReviewStatus, "reviewed")
                .set(CallSummaryDO::getReviewedAt, reviewedAt)
                .set(CallSummaryDO::getReviewedBy, userId)
                .set(CallSummaryDO::getVersion, reqVO.getExpectedVersion() + 1));
        if (updated == 0) throw exception(ErrorCodeConstants.AI_SUMMARY_VERSION_CONFLICT);
        return true;
    }

    private CallRecordDO requireAccessibleCall(Long callRecordId, Long userId) {
        CallRecordDO call = callRecordMapper.selectById(callRecordId);
        if (call == null || !userId.equals(call.getOwnerUserId())) throw exception(ErrorCodeConstants.AI_SUMMARY_CALL_UNAVAILABLE);
        return call;
    }

    private void setContent(CallSummaryDO row, CallSummarySaveReqVO reqVO) {
        row.setSummaryCiphertext(encrypt(reqVO.getSummary()));
        row.setCustomerNeedsCiphertext(encrypt(reqVO.getCustomerNeeds()));
        row.setObjectionsCiphertext(encrypt(reqVO.getObjections()));
        row.setNextStepCiphertext(encrypt(reqVO.getNextStep()));
    }

    private String encrypt(String value) { return value == null || value.isBlank() ? null : cryptoService.encrypt(value.trim()); }

    private CallSummaryRespVO toResp(CallSummaryDO row, CallRecordDO call) {
        CallSummaryRespVO resp = new CallSummaryRespVO();
        resp.setId(row.getId()); resp.setCallRecordId(row.getCallRecordId()); resp.setOwnerUserId(row.getOwnerUserId());
        resp.setCustomerName(cryptoService.decrypt(call.getCustomerNameCiphertext()));
        resp.setCallAt(call.getStartedAt()); resp.setDurationSeconds(call.getDurationSeconds()); resp.setResult(resultLabel(call.getResultCode()));
        resp.setSummary(cryptoService.decrypt(row.getSummaryCiphertext()));
        resp.setCustomerNeeds(cryptoService.decrypt(row.getCustomerNeedsCiphertext()));
        resp.setObjections(cryptoService.decrypt(row.getObjectionsCiphertext()));
        resp.setNextStep(cryptoService.decrypt(row.getNextStepCiphertext()));
        resp.setOrigin(row.getOrigin()); resp.setReviewStatus(row.getReviewStatus()); resp.setVersion(row.getVersion());
        resp.setUpdateTime(row.getUpdateTime() == null ? LocalDateTime.now() : row.getUpdateTime());
        return resp;
    }

    private CallSummaryRespVO toAvailableCall(CallRecordDO call) {
        CallSummaryRespVO resp = new CallSummaryRespVO();
        resp.setCallRecordId(call.getId());
        resp.setCustomerName(cryptoService.decrypt(call.getCustomerNameCiphertext()));
        resp.setCallAt(call.getStartedAt()); resp.setDurationSeconds(call.getDurationSeconds());
        resp.setResult(resultLabel(call.getResultCode())); resp.setOrigin("manual");
        resp.setReviewStatus("draft"); resp.setVersion(0);
        return resp;
    }

    private String resultLabel(String resultCode) {
        if (resultCode == null) return "未记录";
        return switch (resultCode) {
            case "connected" -> "已接通";
            case "no_answer" -> "无人接听";
            case "busy" -> "忙线";
            case "rejected" -> "拒接";
            case "invalid_number" -> "号码无效";
            default -> "其他";
        };
    }
}
