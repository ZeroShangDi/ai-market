package cn.iocoder.yudao.module.callphone.service.outbound;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo.CallRecordPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo.CallRecordSummaryRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.framework.datapermission.CallPhoneOwnerScope;
import cn.iocoder.yudao.module.callphone.framework.datapermission.CallPhoneOwnerScopeService;
import cn.iocoder.yudao.module.callphone.util.CallPhoneTimeUtils;
import jakarta.annotation.Resource;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class CallRecordServiceImpl implements CallRecordService {

    @Resource
    private CallRecordMapper callRecordMapper;
    @Resource
    private JdbcTemplate jdbc;
    @Resource
    private CallPhoneOwnerScopeService ownerScopeService;

    @Override
    public PageResult<CallRecordDO> getCallRecordPage(CallRecordPageReqVO reqVO) {
        return callRecordMapper.selectPage(reqVO);
    }

    @Override
    public CallRecordDO getCallRecord(Long id) {
        return callRecordMapper.selectById(id);
    }

    @Override
    public CallRecordSummaryRespVO getSummary(CallRecordPageReqVO reqVO) {
        Long tenantId = TenantContextHolder.getRequiredTenantId();
        CallPhoneOwnerScope scope = ownerScopeService.getCurrentUserScope();
        StringBuilder where = new StringBuilder("tenant_id = ? AND deleted = b'0'");
        List<Object> args = new ArrayList<>();
        args.add(tenantId);
        appendOwnerScope(where, args, scope, reqVO.getOwnerUserId());
        if (reqVO.getFromUtc() != null) { where.append(" AND started_at >= ?"); args.add(reqVO.getFromUtc()); }
        if (reqVO.getToUtc() != null) { where.append(" AND started_at < ?"); args.add(reqVO.getToUtc()); }
        if (reqVO.getDirection() != null && !reqVO.getDirection().isBlank()) {
            where.append(" AND direction = ?"); args.add(reqVO.getDirection());
        }
        if (reqVO.getResultCode() != null && !reqVO.getResultCode().isBlank()) {
            where.append(" AND result_code = ?"); args.add(reqVO.getResultCode());
        }
        if (reqVO.getRecordingState() != null && !reqVO.getRecordingState().isBlank()) {
            where.append(" AND recording_state = ?"); args.add(reqVO.getRecordingState());
        }
        if (reqVO.getQuery() != null && !reqVO.getQuery().isBlank()) {
            where.append(" AND phone_display LIKE ?"); args.add("%" + reqVO.getQuery().trim() + "%");
        }
        Map<String, Object> aggregate = jdbc.queryForMap("SELECT "
                + "COALESCE(SUM(direction = 'outbound'), 0) AS outbound_count, "
                + "COALESCE(SUM(direction = 'outbound' AND status = 'ended' AND result_code = 'connected'), 0) AS connected_count, "
                + "COALESCE(SUM(direction = 'outbound' AND status = 'ended'), 0) AS completed_outbound_count, "
                + "COALESCE(SUM(CASE WHEN status = 'ended' THEN duration_seconds ELSE 0 END), 0) AS duration_seconds, "
                + "COALESCE(SUM(status = 'ended'), 0) AS completed_count "
                + "FROM cp_call_record WHERE " + where, args.toArray());

        CallRecordSummaryRespVO summary = new CallRecordSummaryRespVO();
        long outboundCount = asLong(aggregate.get("outbound_count"));
        long completedOutbound = asLong(aggregate.get("completed_outbound_count"));
        long durationSeconds = asLong(aggregate.get("duration_seconds"));
        long completedCount = asLong(aggregate.get("completed_count"));
        long connectedCount = asLong(aggregate.get("connected_count"));
        summary.setOutboundCount(outboundCount);
        summary.setOutboundConnectRate(completedOutbound == 0 ? 0d : connectedCount * 100d / completedOutbound);
        summary.setDurationSeconds(durationSeconds);
        summary.setAverageDurationSeconds(completedCount == 0 ? 0L : durationSeconds / completedCount);

        LocalDate businessDate = LocalDate.now(java.time.ZoneId.of("Asia/Shanghai"));
        LocalDateTime todayStart = CallPhoneTimeUtils.businessDayStartUtc(businessDate);
        LocalDateTime tomorrowStart = CallPhoneTimeUtils.businessDayStartUtc(businessDate.plusDays(1));
        StringBuilder todayCallWhere = new StringBuilder("tenant_id = ? AND deleted = b'0' AND direction = 'outbound' AND started_at >= ? AND started_at < ?");
        List<Object> todayCallArgs = new ArrayList<>(List.of(tenantId, todayStart, tomorrowStart));
        appendOwnerScope(todayCallWhere, todayCallArgs, scope, reqVO.getOwnerUserId());
        Long todayOutbound = jdbc.queryForObject("SELECT COUNT(*) FROM cp_call_record WHERE " + todayCallWhere,
                Long.class, todayCallArgs.toArray());

        StringBuilder pendingWhere = new StringBuilder("tenant_id = ? AND deleted = b'0' AND status = 'pending'");
        List<Object> pendingArgs = new ArrayList<>(List.of(tenantId));
        appendOwnerScope(pendingWhere, pendingArgs, scope, reqVO.getOwnerUserId());
        Long pending = jdbc.queryForObject("SELECT COUNT(*) FROM cp_follow_up_task WHERE " + pendingWhere,
                Long.class, pendingArgs.toArray());

        StringBuilder dueTodayWhere = new StringBuilder("tenant_id = ? AND deleted = b'0' AND status = 'pending' AND due_at >= ? AND due_at < ?");
        List<Object> dueTodayArgs = new ArrayList<>(List.of(tenantId, todayStart, tomorrowStart));
        appendOwnerScope(dueTodayWhere, dueTodayArgs, scope, reqVO.getOwnerUserId());
        Long dueToday = jdbc.queryForObject("SELECT COUNT(*) FROM cp_follow_up_task WHERE " + dueTodayWhere,
                Long.class, dueTodayArgs.toArray());
        summary.setTodayOutboundCount(todayOutbound == null ? 0L : todayOutbound);
        summary.setPendingFollowUpCount(pending == null ? 0L : pending);
        summary.setDueTodayFollowUpCount(dueToday == null ? 0L : dueToday);
        return summary;
    }

    private void appendOwnerScope(StringBuilder where, List<Object> args, CallPhoneOwnerScope scope,
                                  Long requestedOwnerUserId) {
        if (requestedOwnerUserId != null) {
            if (!scope.all() && !scope.ownerUserIds().contains(requestedOwnerUserId)) {
                where.append(" AND 1 = 0");
                return;
            }
            where.append(" AND owner_user_id = ?");
            args.add(requestedOwnerUserId);
            return;
        }
        if (scope.all()) {
            return;
        }
        if (scope.ownerUserIds().isEmpty()) {
            where.append(" AND 1 = 0");
            return;
        }
        where.append(" AND owner_user_id IN (")
                .append(String.join(",", java.util.Collections.nCopies(scope.ownerUserIds().size(), "?")))
                .append(')');
        args.addAll(scope.ownerUserIds());
    }

    private long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }
}
