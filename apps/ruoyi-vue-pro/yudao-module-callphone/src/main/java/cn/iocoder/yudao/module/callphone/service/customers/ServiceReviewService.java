package cn.iocoder.yudao.module.callphone.service.customers;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.ServiceReviewPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.ServiceReviewPageRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.ServiceReviewRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.ServiceReviewSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.customers.ServiceReviewDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.customers.ServiceReviewMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class ServiceReviewService {

    @Resource private ServiceReviewMapper reviewMapper;
    @Resource private CallRecordMapper callRecordMapper;
    @Resource private PiiCryptoService cryptoService;

    public List<ServiceReviewRespVO> getAvailableCalls(Long userId) {
        Set<Long> reviewed = reviewMapper.selectByOwner(userId).stream()
                .map(ServiceReviewDO::getCallRecordId).collect(Collectors.toSet());
        LambdaQueryWrapperX<CallRecordDO> query = new LambdaQueryWrapperX<>();
        query.eq(CallRecordDO::getOwnerUserId, userId).isNotNull(CallRecordDO::getEndedAt);
        query.orderByDesc(CallRecordDO::getEndedAt);
        if (!reviewed.isEmpty()) query.notIn(CallRecordDO::getId, reviewed);
        query.last("LIMIT 100");
        return callRecordMapper.selectList(query).stream().map(this::toAvailable).toList();
    }

    public ServiceReviewPageRespVO getPage(ServiceReviewPageReqVO reqVO, Long userId) {
        PageResult<ServiceReviewDO> result = reviewMapper.selectPage(reqVO, userId);
        Set<Long> callIds = result.getList().stream().map(ServiceReviewDO::getCallRecordId).collect(Collectors.toSet());
        Map<Long, CallRecordDO> calls = callIds.isEmpty() ? Map.of() : callRecordMapper.selectBatchIds(callIds).stream()
                .filter(call -> userId.equals(call.getOwnerUserId()))
                .collect(Collectors.toMap(CallRecordDO::getId, Function.identity(), (left, right) -> left));
        ServiceReviewPageRespVO resp = new ServiceReviewPageRespVO();
        resp.setList(result.getList().stream().map(row -> toResp(row, calls.get(row.getCallRecordId())))
                .filter(java.util.Objects::nonNull).toList());
        resp.setTotal(result.getTotal());
        List<ServiceReviewDO> all = reviewMapper.selectByOwner(userId);
        List<ServiceReviewDO> passed = all.stream().filter(row -> "pass".equals(row.getReviewStatus())).toList();
        List<ServiceReviewDO> needsWork = all.stream().filter(row -> "needs_improvement".equals(row.getReviewStatus())).toList();
        resp.setPassCount((long) passed.size());
        resp.setImproveCount((long) needsWork.size());
        resp.setAverageScore(all.isEmpty() ? 0 : (int) Math.round(all.stream().mapToInt(ServiceReviewDO::getScore).average().orElse(0)));
        return resp;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(ServiceReviewSaveReqVO reqVO, Long userId) {
        CallRecordDO call = callRecordMapper.selectById(reqVO.getCallRecordId());
        if (call == null || !userId.equals(call.getOwnerUserId()) || call.getEndedAt() == null) {
            throw exception(ErrorCodeConstants.SERVICE_REVIEW_CALL_UNAVAILABLE);
        }
        int score = score(reqVO);
        String status = score >= 80 ? "pass" : "needs_improvement";
        String note = reqVO.getNote() == null ? "" : reqVO.getNote().trim();
        if ("needs_improvement".equals(status) && note.length() < 4) {
            throw exception(ErrorCodeConstants.SERVICE_REVIEW_NOTE_REQUIRED);
        }
        ServiceReviewDO existing = reviewMapper.selectByCallRecordId(reqVO.getCallRecordId(), userId);
        if (existing == null) {
            if (reqVO.getExpectedVersion() != 0) throw exception(ErrorCodeConstants.SERVICE_REVIEW_STATE_CONFLICT);
            ServiceReviewDO row = new ServiceReviewDO();
            row.setId(IdUtil.getSnowflake().nextId());
            row.setCallRecordId(call.getId()); row.setOwnerUserId(userId); row.setScore(score);
            row.setReviewStatus(status); setChecklist(row, reqVO); row.setNoteCiphertext(encrypt(note));
            row.setReviewerId(userId); row.setReviewedAt(LocalDateTime.now()); row.setVersion(1);
            return reviewMapper.insert(row) > 0;
        }
        if (!existing.getVersion().equals(reqVO.getExpectedVersion())) throw exception(ErrorCodeConstants.SERVICE_REVIEW_STATE_CONFLICT);
        LambdaUpdateWrapper<ServiceReviewDO> update = new LambdaUpdateWrapper<ServiceReviewDO>()
                .eq(ServiceReviewDO::getId, existing.getId()).eq(ServiceReviewDO::getOwnerUserId, userId)
                .eq(ServiceReviewDO::getVersion, reqVO.getExpectedVersion())
                .set(ServiceReviewDO::getScore, score).set(ServiceReviewDO::getReviewStatus, status)
                .set(ServiceReviewDO::getIdentifyOk, reqVO.getIdentifyOk()).set(ServiceReviewDO::getConsentOk, reqVO.getConsentOk())
                .set(ServiceReviewDO::getNeedCaptured, reqVO.getNeedCaptured()).set(ServiceReviewDO::getResultAccurate, reqVO.getResultAccurate())
                .set(ServiceReviewDO::getNextStepClear, reqVO.getNextStepClear()).set(ServiceReviewDO::getNoteCiphertext, encrypt(note))
                .set(ServiceReviewDO::getReviewerId, userId).set(ServiceReviewDO::getReviewedAt, LocalDateTime.now())
                .set(ServiceReviewDO::getVersion, reqVO.getExpectedVersion() + 1);
        if (reviewMapper.update(null, update) == 0) throw exception(ErrorCodeConstants.SERVICE_REVIEW_STATE_CONFLICT);
        return true;
    }

    private int score(ServiceReviewSaveReqVO req) {
        return (req.getIdentifyOk() ? 20 : 0) + (req.getConsentOk() ? 20 : 0) + (req.getNeedCaptured() ? 20 : 0)
                + (req.getResultAccurate() ? 20 : 0) + (req.getNextStepClear() ? 20 : 0);
    }

    private void setChecklist(ServiceReviewDO row, ServiceReviewSaveReqVO req) {
        row.setIdentifyOk(req.getIdentifyOk()); row.setConsentOk(req.getConsentOk()); row.setNeedCaptured(req.getNeedCaptured());
        row.setResultAccurate(req.getResultAccurate()); row.setNextStepClear(req.getNextStepClear());
    }

    private String encrypt(String value) { return value.isBlank() ? null : cryptoService.encrypt(value); }

    private ServiceReviewRespVO toAvailable(CallRecordDO call) {
        ServiceReviewRespVO resp = new ServiceReviewRespVO();
        resp.setCallRecordId(call.getId()); resp.setCustomerName(cryptoService.decrypt(call.getCustomerNameCiphertext()));
        resp.setPhoneDisplay(call.getPhoneDisplay()); resp.setCallAt(call.getStartedAt()); resp.setDurationSeconds(call.getDurationSeconds());
        resp.setResult(resultLabel(call.getResultCode())); resp.setRecordingState(call.getRecordingState()); resp.setVersion(0);
        return resp;
    }

    private ServiceReviewRespVO toResp(ServiceReviewDO row, CallRecordDO call) {
        if (call == null) return null;
        ServiceReviewRespVO resp = toAvailable(call);
        resp.setId(row.getId()); resp.setScore(row.getScore()); resp.setReviewStatus(row.getReviewStatus());
        resp.setIdentifyOk(row.getIdentifyOk()); resp.setConsentOk(row.getConsentOk()); resp.setNeedCaptured(row.getNeedCaptured());
        resp.setResultAccurate(row.getResultAccurate()); resp.setNextStepClear(row.getNextStepClear());
        resp.setNote(cryptoService.decrypt(row.getNoteCiphertext())); resp.setReviewerName("当前成员");
        resp.setReviewedAt(row.getReviewedAt()); resp.setVersion(row.getVersion());
        return resp;
    }

    private String resultLabel(String value) {
        if (value == null) return "未记录";
        return switch (value) {
            case "connected" -> "已接通"; case "no_answer" -> "无人接听"; case "busy" -> "忙线";
            case "rejected" -> "拒接"; case "invalid_number" -> "号码无效"; default -> "其他";
        };
    }
}
