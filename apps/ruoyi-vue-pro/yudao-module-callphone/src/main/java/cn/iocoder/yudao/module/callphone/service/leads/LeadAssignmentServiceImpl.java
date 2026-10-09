package cn.iocoder.yudao.module.callphone.service.leads;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil;
import cn.iocoder.yudao.framework.common.pojo.PageParam;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadAssignmentHistoryPageReqVO;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadAssignmentDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadAssignmentAutoConfigDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadAssignmentRuleDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadAssignmentRuleMemberDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadAssignmentMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadAssignmentAutoConfigMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadAssignmentRuleMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadAssignmentRuleMemberMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadActivityMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallDispatchMapper;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.extern.slf4j.Slf4j;

import java.time.LocalDateTime;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.LEAD_ASSIGNMENT_RULE_NAME_DUPLICATED;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.LEAD_ASSIGNMENT_RULE_NOT_FOUND;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.LEAD_ASSIGNMENT_RULE_VERSION_CONFLICT;

@Service
@Slf4j
public class LeadAssignmentServiceImpl implements LeadAssignmentService {

    private static final int DEFAULT_RECYCLE_AFTER_DAYS = 7;
    private static final int RECYCLE_BATCH_SIZE = 100;

    private final LeadMapper leadMapper;
    private final LeadActivityMapper leadActivityMapper;
    private final CallDispatchMapper callDispatchMapper;
    private final LeadAssignmentMapper leadAssignmentMapper;
    private final LeadAssignmentRuleMapper leadAssignmentRuleMapper;
    private final LeadAssignmentAutoConfigMapper leadAssignmentAutoConfigMapper;
    private final LeadAssignmentRuleMemberMapper leadAssignmentRuleMemberMapper;
    private final AdminUserApi adminUserApi;

    public LeadAssignmentServiceImpl(LeadMapper leadMapper, LeadActivityMapper leadActivityMapper,
                                     CallDispatchMapper callDispatchMapper, LeadAssignmentMapper leadAssignmentMapper,
                                     LeadAssignmentRuleMapper leadAssignmentRuleMapper,
                                     LeadAssignmentAutoConfigMapper leadAssignmentAutoConfigMapper,
                                     LeadAssignmentRuleMemberMapper leadAssignmentRuleMemberMapper,
                                     AdminUserApi adminUserApi) {
        this.leadMapper = leadMapper;
        this.leadActivityMapper = leadActivityMapper;
        this.callDispatchMapper = callDispatchMapper;
        this.leadAssignmentMapper = leadAssignmentMapper;
        this.leadAssignmentRuleMapper = leadAssignmentRuleMapper;
        this.leadAssignmentAutoConfigMapper = leadAssignmentAutoConfigMapper;
        this.leadAssignmentRuleMemberMapper = leadAssignmentRuleMemberMapper;
        this.adminUserApi = adminUserApi;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean assign(Long leadId, Long toUserId, Long actorUserId, String reason) {
        adminUserApi.validateUser(toUserId);
        LeadDO lead = leadMapper.selectById(leadId);
        if (!isAssignable(lead)) return false;
        Long oldOwnerId = lead.getOwnerUserId();
        if (Objects.equals(oldOwnerId, toUserId)) return true;
        if (updateOwner(lead, toUserId) != 1) return false;
        recordAssignment(leadId, oldOwnerId, toUserId, actorUserId,
                oldOwnerId == null ? "assign" : "reassign", reason);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<LeadBatchAssignmentResult> assignBatch(List<Long> leadIds, Long toUserId,
                                                      Long actorUserId, String reason) {
        adminUserApi.validateUser(toUserId);
        return leadIds.stream().map(id -> assignOne(id, toUserId, actorUserId, reason.trim())).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<LeadRoundRobinAssignmentResult> assignRoundRobin(List<Long> leadIds, List<Long> toUserIds,
                                                                 Long actorUserId, String reason) {
        if (leadIds == null || leadIds.isEmpty() || leadIds.size() > 100
                || leadIds.stream().anyMatch(Objects::isNull) || leadIds.stream().distinct().count() != leadIds.size()) {
            throw ServiceExceptionUtil.invalidParamException("线索列表必须包含 1 到 100 条不重复记录");
        }
        if (toUserIds == null || toUserIds.size() < 2 || toUserIds.size() > 20
                || toUserIds.stream().anyMatch(Objects::isNull) || toUserIds.stream().distinct().count() != toUserIds.size()) {
            throw ServiceExceptionUtil.invalidParamException("轮转成员必须为 2 到 20 位不重复成员");
        }
        toUserIds.forEach(adminUserApi::validateUser);
        String auditReason = "轮转分配：" + reason.trim();
        java.util.ArrayList<LeadRoundRobinAssignmentResult> results = new java.util.ArrayList<>(leadIds.size());
        for (int index = 0; index < leadIds.size(); index++) {
            Long leadId = leadIds.get(index);
            Long toUserId = toUserIds.get(index % toUserIds.size());
            LeadBatchAssignmentResult result = assignOne(leadId, toUserId, actorUserId, auditReason);
            results.add(new LeadRoundRobinAssignmentResult(result.id(), toUserId, result.success(), result.outcome()));
        }
        return results;
    }

    @Override
    public PageResult<LeadAssignmentRuleView> getRulePage(int pageNo, int pageSize, String query) {
        PageParam pageParam = new PageParam();
        pageParam.setPageNo(pageNo);
        pageParam.setPageSize(pageSize);
        PageResult<LeadAssignmentRuleDO> page = leadAssignmentRuleMapper.selectPage(pageParam,
                new LambdaQueryWrapperX<LeadAssignmentRuleDO>()
                        .likeIfPresent(LeadAssignmentRuleDO::getRuleName, query)
                        .orderByDesc(LeadAssignmentRuleDO::getUpdateTime)
                        .orderByDesc(LeadAssignmentRuleDO::getId));
        List<Long> ruleIds = page.getList().stream().map(LeadAssignmentRuleDO::getId).toList();
        if (ruleIds.isEmpty()) return new PageResult<>(List.of(), page.getTotal());
        List<LeadAssignmentRuleMemberDO> members = leadAssignmentRuleMemberMapper.selectByRuleIds(
                TenantContextHolder.getRequiredTenantId(), ruleIds);
        Map<Long, List<LeadAssignmentRuleMemberDO>> membersByRule = members.stream()
                .collect(Collectors.groupingBy(LeadAssignmentRuleMemberDO::getRuleId));
        Set<Long> userIds = members.stream().map(LeadAssignmentRuleMemberDO::getUserId).collect(Collectors.toSet());
        Map<Long, AdminUserRespDTO> users = userIds.isEmpty() ? Map.of() : adminUserApi.getUserMap(userIds);
        List<LeadAssignmentRuleView> rows = page.getList().stream().map(rule -> toRuleView(rule,
                membersByRule.getOrDefault(rule.getId(), List.of()), users)).toList();
        return new PageResult<>(rows, page.getTotal());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public LeadAssignmentRuleView saveRule(Long id, Integer expectedVersion, String name, Boolean enabled,
                                           List<Long> memberIds) {
        validateRuleMemberIds(memberIds);
        String normalizedName = name.trim();
        LeadAssignmentRuleDO duplicate = leadAssignmentRuleMapper.selectOne(new LambdaQueryWrapperX<LeadAssignmentRuleDO>()
                .eq(LeadAssignmentRuleDO::getRuleName, normalizedName)
                .neIfPresent(LeadAssignmentRuleDO::getId, id));
        if (duplicate != null) throw exception(LEAD_ASSIGNMENT_RULE_NAME_DUPLICATED);

        LeadAssignmentRuleDO rule;
        List<Long> oldMemberIds = List.of();
        if (id == null) {
            memberIds.forEach(adminUserApi::validateUser);
            rule = new LeadAssignmentRuleDO();
            rule.setId(IdUtil.getSnowflake().nextId());
            rule.setRuleName(normalizedName);
            rule.setEnabled(enabled == null || enabled);
            rule.setCursorIndex(0);
            rule.setVersion(1);
            leadAssignmentRuleMapper.insert(rule);
        } else {
            rule = getRule(id);
            if (expectedVersion == null || !Objects.equals(rule.getVersion(), expectedVersion)) {
                throw exception(LEAD_ASSIGNMENT_RULE_VERSION_CONFLICT);
            }
            oldMemberIds = getRuleMembers(id).stream().map(LeadAssignmentRuleMemberDO::getUserId).toList();
            boolean membersChanged = !oldMemberIds.equals(memberIds);
            if (membersChanged || !Boolean.FALSE.equals(enabled)) memberIds.forEach(adminUserApi::validateUser);
            int nextVersion = rule.getVersion() + 1;
            LambdaUpdateWrapper<LeadAssignmentRuleDO> update = new LambdaUpdateWrapper<LeadAssignmentRuleDO>()
                    .set(LeadAssignmentRuleDO::getRuleName, normalizedName)
                    .set(LeadAssignmentRuleDO::getEnabled, enabled == null ? rule.getEnabled() : enabled)
                    .set(LeadAssignmentRuleDO::getVersion, nextVersion)
                    .set(LeadAssignmentRuleDO::getUpdateTime, LocalDateTime.now())
                    .eq(LeadAssignmentRuleDO::getId, id)
                    .eq(LeadAssignmentRuleDO::getVersion, expectedVersion);
            if (membersChanged) update.set(LeadAssignmentRuleDO::getCursorIndex, 0);
            if (leadAssignmentRuleMapper.update(null, update) != 1) {
                throw exception(LEAD_ASSIGNMENT_RULE_VERSION_CONFLICT);
            }
            rule.setRuleName(normalizedName);
            rule.setEnabled(enabled == null ? rule.getEnabled() : enabled);
            if (membersChanged) rule.setCursorIndex(0);
            rule.setVersion(nextVersion);
        }

        if (id == null || !oldMemberIds.equals(memberIds)) {
            leadAssignmentRuleMemberMapper.deleteByRuleId(TenantContextHolder.getRequiredTenantId(), rule.getId());
            for (int index = 0; index < memberIds.size(); index++) {
                LeadAssignmentRuleMemberDO member = new LeadAssignmentRuleMemberDO();
                member.setId(IdUtil.getSnowflake().nextId());
                member.setRuleId(rule.getId());
                member.setUserId(memberIds.get(index));
                member.setSortNo(index);
                leadAssignmentRuleMemberMapper.insert(member);
            }
        }
        return toRuleView(rule, getRuleMembers(rule.getId()), userMapFor(memberIds));
    }

    @Override
    public LeadAssignmentAutoConfigView getAutoAssignmentConfig() {
        LeadAssignmentAutoConfigDO config = leadAssignmentAutoConfigMapper.selectByCurrentTenant();
        return config == null ? new LeadAssignmentAutoConfigView(null, 0, false, DEFAULT_RECYCLE_AFTER_DAYS)
                : new LeadAssignmentAutoConfigView(config.getRuleId(), config.getVersion(),
                        Boolean.TRUE.equals(config.getRecycleEnabled()), normalizeRecycleDays(config.getRecycleAfterDays()));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public LeadAssignmentAutoConfigView saveAutoAssignmentConfig(Long ruleId, Boolean recycleEnabled,
                                                                  Integer recycleAfterDays, Integer expectedVersion) {
        if (expectedVersion == null || expectedVersion < 0) {
            throw ServiceExceptionUtil.invalidParamException("请刷新自动分配配置后重试");
        }
        if (recycleEnabled == null || recycleAfterDays == null || recycleAfterDays < 1 || recycleAfterDays > 90) {
            throw ServiceExceptionUtil.invalidParamException("自动回收时限须为 1 到 90 天");
        }
        if (ruleId != null) {
            LeadAssignmentRuleDO rule = getRule(ruleId);
            if (!Boolean.TRUE.equals(rule.getEnabled())) {
                throw exception(LEAD_ASSIGNMENT_RULE_NOT_FOUND);
            }
            List<Long> userIds = getRuleMembers(ruleId).stream().map(LeadAssignmentRuleMemberDO::getUserId).toList();
            validateRuleMemberIds(userIds);
            userIds.forEach(adminUserApi::validateUser);
        }

        LeadAssignmentAutoConfigDO current = leadAssignmentAutoConfigMapper.selectByCurrentTenant();
        if (current == null) {
            if (expectedVersion != 0) throw exception(LEAD_ASSIGNMENT_RULE_VERSION_CONFLICT);
            LeadAssignmentAutoConfigDO created = new LeadAssignmentAutoConfigDO();
            created.setId(IdUtil.getSnowflake().nextId());
            created.setRuleId(ruleId);
            created.setVersion(1);
            created.setRecycleEnabled(recycleEnabled);
            created.setRecycleAfterDays(recycleAfterDays);
            try {
                leadAssignmentAutoConfigMapper.insert(created);
            } catch (org.springframework.dao.DuplicateKeyException conflict) {
                throw exception(LEAD_ASSIGNMENT_RULE_VERSION_CONFLICT);
            }
            return new LeadAssignmentAutoConfigView(ruleId, 1, recycleEnabled, recycleAfterDays);
        }
        if (!Objects.equals(current.getVersion(), expectedVersion)) {
            throw exception(LEAD_ASSIGNMENT_RULE_VERSION_CONFLICT);
        }
        int nextVersion = current.getVersion() + 1;
        int updated = leadAssignmentAutoConfigMapper.update(null, new LambdaUpdateWrapper<LeadAssignmentAutoConfigDO>()
                .set(LeadAssignmentAutoConfigDO::getRuleId, ruleId)
                .set(LeadAssignmentAutoConfigDO::getRecycleEnabled, recycleEnabled)
                .set(LeadAssignmentAutoConfigDO::getRecycleAfterDays, recycleAfterDays)
                .set(LeadAssignmentAutoConfigDO::getVersion, nextVersion)
                .set(LeadAssignmentAutoConfigDO::getUpdateTime, LocalDateTime.now())
                .eq(LeadAssignmentAutoConfigDO::getId, current.getId())
                .eq(LeadAssignmentAutoConfigDO::getVersion, expectedVersion));
        if (updated != 1) throw exception(LEAD_ASSIGNMENT_RULE_VERSION_CONFLICT);
        return new LeadAssignmentAutoConfigView(ruleId, nextVersion, recycleEnabled, recycleAfterDays);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int recycleExpiredLeads() {
        LeadAssignmentAutoConfigDO config = leadAssignmentAutoConfigMapper.selectByCurrentTenant();
        if (config == null || !Boolean.TRUE.equals(config.getRecycleEnabled())) return 0;
        int afterDays = normalizeRecycleDays(config.getRecycleAfterDays());
        LocalDateTime cutoff = LocalDateTime.now().minusDays(afterDays);
        List<LeadDO> expiredLeads = leadMapper.selectExpiredClaimed(cutoff, RECYCLE_BATCH_SIZE);
        Set<Long> expiredIds = expiredLeads.stream().map(LeadDO::getId).collect(Collectors.toSet());
        Set<Long> recentlyActiveLeadIds = leadActivityMapper.selectLeadIdsWithActivityAfter(
                List.copyOf(expiredIds), cutoff);
        Set<Long> activeDispatchLeadIds = Set.copyOf(callDispatchMapper.selectLeadIdsWithActiveDispatch(
                List.copyOf(expiredIds)));
        int recycled = 0;
        for (LeadDO lead : expiredLeads) {
            if (lead.getUpdateTime() == null || lead.getOwnerUserId() == null
                    || recentlyActiveLeadIds.contains(lead.getId())
                    || activeDispatchLeadIds.contains(lead.getId())) continue;
            int updated = leadMapper.recycleExpiredClaimed(TenantContextHolder.getRequiredTenantId(),
                    lead.getId(), lead.getOwnerUserId(), lead.getUpdateTime(), cutoff, LocalDateTime.now());
            if (updated != 1) continue;
            recordAssignment(lead.getId(), lead.getOwnerUserId(), null, 0L, "recycle",
                    "超过 " + afterDays + " 天未更新，系统自动回收到公共池");
            recycled++;
        }
        return recycled;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean autoAssignNewLead(Long leadId, Long actorUserId) {
        // Concurrent lead intake requests share the rule's existing optimistic cursor. Retry a few
        // times so a burst of imports still distributes records rather than silently racing.
        for (int attempt = 0; attempt < 5; attempt++) {
            LeadAssignmentAutoConfigDO config = leadAssignmentAutoConfigMapper.selectByCurrentTenant();
            if (config == null || config.getRuleId() == null) return false;
            LeadAssignmentRuleDO rule = leadAssignmentRuleMapper.selectById(config.getRuleId());
            if (rule == null || !Boolean.TRUE.equals(rule.getEnabled())) return false;
            try {
                List<LeadAssignmentRuleApplyResult> results = applyRule(rule.getId(), rule.getVersion(),
                        List.of(leadId), actorUserId, "新线索自动分配");
                return !results.isEmpty() && results.get(0).success();
            } catch (ServiceException e) {
                if (Objects.equals(e.getCode(), LEAD_ASSIGNMENT_RULE_VERSION_CONFLICT.getCode())) continue;
                // A stale/disabled member must not make the intake endpoint lose the new lead.
                log.warn("Automatic lead assignment skipped: ruleId={}, leadId={}, code={}",
                        rule.getId(), leadId, e.getCode());
                return false;
            }
        }
        log.warn("Automatic lead assignment deferred after concurrent rule updates: leadId={}", leadId);
        return false;
    }

    @Override
    public List<LeadAssignmentRulePreviewRow> previewRule(Long ruleId, Integer expectedVersion, List<Long> leadIds) {
        validateRuleLeadIds(leadIds);
        LeadAssignmentRuleDO rule = getRule(ruleId);
        if (!Objects.equals(rule.getVersion(), expectedVersion)) {
            throw exception(LEAD_ASSIGNMENT_RULE_VERSION_CONFLICT);
        }
        List<LeadAssignmentRuleMemberDO> members = getRuleMembers(ruleId);
        if (members.size() < 2) throw exception(LEAD_ASSIGNMENT_RULE_NOT_FOUND);
        List<Long> userIds = members.stream().map(LeadAssignmentRuleMemberDO::getUserId).toList();
        userIds.forEach(adminUserApi::validateUser);
        Map<Long, AdminUserRespDTO> users = userMapFor(userIds);
        int start = Math.floorMod(rule.getCursorIndex(), members.size());
        List<LeadAssignmentRulePreviewRow> preview = new ArrayList<>(leadIds.size());
        for (int index = 0; index < leadIds.size(); index++) {
            Long userId = userIds.get((start + index) % userIds.size());
            AdminUserRespDTO user = users.get(userId);
            preview.add(new LeadAssignmentRulePreviewRow(leadIds.get(index), userId,
                    user == null ? "成员已停用" : user.getNickname()));
        }
        return preview;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<LeadAssignmentRuleApplyResult> applyRule(Long ruleId, Integer expectedVersion, List<Long> leadIds,
                                                         Long actorUserId, String reason) {
        validateRuleLeadIds(leadIds);
        LeadAssignmentRuleDO rule = getRule(ruleId);
        if (!Objects.equals(rule.getVersion(), expectedVersion)) {
            throw exception(LEAD_ASSIGNMENT_RULE_VERSION_CONFLICT);
        }
        if (!Boolean.TRUE.equals(rule.getEnabled())) throw exception(LEAD_ASSIGNMENT_RULE_NOT_FOUND);
        List<Long> userIds = getRuleMembers(ruleId).stream().map(LeadAssignmentRuleMemberDO::getUserId).toList();
        if (userIds.size() < 2) throw exception(LEAD_ASSIGNMENT_RULE_NOT_FOUND);
        userIds.forEach(adminUserApi::validateUser);

        int start = Math.floorMod(rule.getCursorIndex(), userIds.size());
        int nextCursor = (start + leadIds.size()) % userIds.size();
        int nextVersion = rule.getVersion() + 1;
        int updated = leadAssignmentRuleMapper.update(null, new LambdaUpdateWrapper<LeadAssignmentRuleDO>()
                .set(LeadAssignmentRuleDO::getCursorIndex, nextCursor)
                .set(LeadAssignmentRuleDO::getVersion, nextVersion)
                .set(LeadAssignmentRuleDO::getUpdateTime, LocalDateTime.now())
                .eq(LeadAssignmentRuleDO::getId, ruleId)
                .eq(LeadAssignmentRuleDO::getVersion, expectedVersion)
                .eq(LeadAssignmentRuleDO::getEnabled, true));
        if (updated != 1) throw exception(LEAD_ASSIGNMENT_RULE_VERSION_CONFLICT);

        String auditReason = "分配规则「" + rule.getRuleName() + "」：" + reason.trim();
        List<LeadAssignmentRuleApplyResult> results = new ArrayList<>(leadIds.size());
        for (int index = 0; index < leadIds.size(); index++) {
            Long leadId = leadIds.get(index);
            Long userId = userIds.get((start + index) % userIds.size());
            LeadBatchAssignmentResult outcome = assignOne(leadId, userId, actorUserId, auditReason, ruleId);
            results.add(new LeadAssignmentRuleApplyResult(leadId, userId, outcome.success(), outcome.outcome()));
        }
        return results;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean recycle(Long leadId, Long actorUserId, String reason) {
        LeadDO lead = leadMapper.selectById(leadId);
        if (lead == null || lead.getOwnerUserId() == null || !"claimed".equals(lead.getStatus())) return false;
        int updated = leadMapper.update(null, new LambdaUpdateWrapper<LeadDO>()
                .set(LeadDO::getOwnerUserId, null).set(LeadDO::getStatus, "new")
                .set(LeadDO::getUpdateTime, LocalDateTime.now())
                .eq(LeadDO::getId, leadId).eq(LeadDO::getOwnerUserId, lead.getOwnerUserId())
                .eq(LeadDO::getStatus, "claimed"));
        if (updated != 1) return false;
        recordAssignment(leadId, lead.getOwnerUserId(), null, actorUserId, "recycle", reason);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void recordAssignment(Long leadId, Long fromUserId, Long toUserId, Long actorUserId,
                                 String action, String reason) {
        recordAssignment(leadId, fromUserId, toUserId, actorUserId, null, action, reason);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void recordAssignment(Long leadId, Long fromUserId, Long toUserId, Long actorUserId,
                                 Long ruleId, String action, String reason) {
        LeadAssignmentDO event = new LeadAssignmentDO();
        event.setId(IdUtil.getSnowflake().nextId());
        event.setLeadId(leadId);
        event.setFromUserId(fromUserId);
        event.setToUserId(toUserId);
        event.setActorUserId(actorUserId);
        event.setRuleId(ruleId);
        event.setAction(action);
        event.setReason(reason.trim());
        leadAssignmentMapper.insert(event);
    }

    @Override
    public PageResult<LeadAssignmentDO> getHistory(LeadAssignmentHistoryPageReqVO reqVO) {
        // The lead lookup applies tenant and Yudao owner-scope rules before the separate audit table is read.
        if (leadMapper.selectById(reqVO.getLeadId()) == null) return PageResult.empty();
        return leadAssignmentMapper.selectPage(reqVO, new LambdaQueryWrapperX<LeadAssignmentDO>()
                .eq(LeadAssignmentDO::getLeadId, reqVO.getLeadId())
                .orderByDesc(LeadAssignmentDO::getCreateTime)
                .orderByDesc(LeadAssignmentDO::getId));
    }

    private LeadBatchAssignmentResult assignOne(Long leadId, Long toUserId, Long actorUserId, String reason) {
        return assignOne(leadId, toUserId, actorUserId, reason, null);
    }

    private LeadBatchAssignmentResult assignOne(Long leadId, Long toUserId, Long actorUserId,
                                                String reason, Long ruleId) {
        LeadDO lead = leadMapper.selectById(leadId);
        if (lead == null) return batchAssignResult(leadId, false, "not_found");
        if (!isAssignable(lead)) return batchAssignResult(leadId, false, "not_assignable");
        Long oldOwnerId = lead.getOwnerUserId();
        if (Objects.equals(oldOwnerId, toUserId)) return batchAssignResult(leadId, true, "already_assigned");
        if (updateOwner(lead, toUserId) != 1) return batchAssignResult(leadId, false, "conflict");
        recordAssignment(leadId, oldOwnerId, toUserId, actorUserId, ruleId,
                oldOwnerId == null ? "assign" : "reassign", reason);
        return batchAssignResult(leadId, true, "assigned");
    }

    private int updateOwner(LeadDO lead, Long toUserId) {
        LambdaUpdateWrapper<LeadDO> update = new LambdaUpdateWrapper<LeadDO>()
                .set(LeadDO::getOwnerUserId, toUserId).set(LeadDO::getStatus, "claimed")
                .set(LeadDO::getUpdateTime, LocalDateTime.now())
                .eq(LeadDO::getId, lead.getId()).eq(LeadDO::getStatus, lead.getStatus());
        if (lead.getOwnerUserId() == null) update.isNull(LeadDO::getOwnerUserId);
        else update.eq(LeadDO::getOwnerUserId, lead.getOwnerUserId());
        return leadMapper.update(null, update);
    }

    private boolean isAssignable(LeadDO lead) {
        return lead != null && ("new".equals(lead.getStatus()) || "claimed".equals(lead.getStatus()));
    }

    private LeadBatchAssignmentResult batchAssignResult(Long leadId, boolean success, String outcome) {
        return new LeadBatchAssignmentResult(leadId, success, outcome);
    }

    private LeadAssignmentRuleDO getRule(Long id) {
        LeadAssignmentRuleDO rule = leadAssignmentRuleMapper.selectById(id);
        if (rule == null) throw exception(LEAD_ASSIGNMENT_RULE_NOT_FOUND);
        return rule;
    }

    private List<LeadAssignmentRuleMemberDO> getRuleMembers(Long ruleId) {
        return leadAssignmentRuleMemberMapper.selectByRuleIds(TenantContextHolder.getRequiredTenantId(), List.of(ruleId));
    }

    private Map<Long, AdminUserRespDTO> userMapFor(List<Long> userIds) {
        return userIds.isEmpty() ? Map.of() : adminUserApi.getUserMap(Set.copyOf(userIds));
    }

    private LeadAssignmentRuleView toRuleView(LeadAssignmentRuleDO rule, List<LeadAssignmentRuleMemberDO> members,
                                              Map<Long, AdminUserRespDTO> users) {
        List<Long> memberIds = members.stream().map(LeadAssignmentRuleMemberDO::getUserId).toList();
        List<String> memberNames = memberIds.stream().map(id -> {
            AdminUserRespDTO user = users.get(id);
            return user == null ? "成员已停用" : user.getNickname();
        }).toList();
        return new LeadAssignmentRuleView(rule.getId(), rule.getRuleName(), Boolean.TRUE.equals(rule.getEnabled()),
                rule.getCursorIndex(), rule.getVersion(), memberIds, memberNames, rule.getUpdateTime());
    }

    private void validateRuleMemberIds(List<Long> memberIds) {
        if (memberIds == null || memberIds.size() < 2 || memberIds.size() > 20
                || memberIds.stream().anyMatch(Objects::isNull) || memberIds.stream().distinct().count() != memberIds.size()) {
            throw ServiceExceptionUtil.invalidParamException("分配规则成员必须为 2 到 20 位不重复成员");
        }
    }

    private void validateRuleLeadIds(List<Long> leadIds) {
        if (leadIds == null || leadIds.isEmpty() || leadIds.size() > 100
                || leadIds.stream().anyMatch(Objects::isNull) || leadIds.stream().distinct().count() != leadIds.size()) {
            throw ServiceExceptionUtil.invalidParamException("线索列表必须包含 1 到 100 条不重复记录");
        }
    }

    private int normalizeRecycleDays(Integer days) {
        return days == null || days < 1 || days > 90 ? DEFAULT_RECYCLE_AFTER_DAYS : days;
    }
}
