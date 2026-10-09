package cn.iocoder.yudao.module.callphone.service.leads;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadAssignmentHistoryPageReqVO;
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
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LeadAssignmentServiceImplTest {

    @BeforeAll
    static void initTableInfo() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), LeadDO.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), LeadAssignmentDO.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), LeadAssignmentAutoConfigDO.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), LeadAssignmentRuleDO.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), LeadAssignmentRuleMemberDO.class);
    }

    @Mock private LeadMapper leadMapper;
    @Mock private LeadActivityMapper leadActivityMapper;
    @Mock private CallDispatchMapper callDispatchMapper;
    @Mock private LeadAssignmentMapper leadAssignmentMapper;
    @Mock private LeadAssignmentRuleMapper leadAssignmentRuleMapper;
    @Mock private LeadAssignmentAutoConfigMapper leadAssignmentAutoConfigMapper;
    @Mock private LeadAssignmentRuleMemberMapper leadAssignmentRuleMemberMapper;
    @Mock private AdminUserApi adminUserApi;
    private LeadAssignmentServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new LeadAssignmentServiceImpl(leadMapper, leadActivityMapper, callDispatchMapper,
                leadAssignmentMapper, leadAssignmentRuleMapper, leadAssignmentAutoConfigMapper,
                leadAssignmentRuleMemberMapper, adminUserApi);
    }

    @AfterEach
    void clearTenantContext() {
        TenantContextHolder.clear();
    }

    @Test
    void batchAssignmentReturnsPerLeadOutcomesAndAuditsOnlySuccessfulUpdates() {
        when(leadMapper.selectById(1L)).thenReturn(lead(1L, "new", null));
        when(leadMapper.selectById(2L)).thenReturn(lead(2L, "claimed", 5L));
        when(leadMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<LeadDO>>any())).thenReturn(1, 0);

        List<LeadBatchAssignmentResult> results = service.assignBatch(List.of(1L, 2L), 8L, 9L, "  工作量平衡  ");

        assertEquals(List.of("assigned", "conflict"), results.stream().map(LeadBatchAssignmentResult::outcome).toList());
        assertTrue(results.get(0).success());
        assertFalse(results.get(1).success());
        ArgumentCaptor<LeadAssignmentDO> event = ArgumentCaptor.forClass(LeadAssignmentDO.class);
        verify(leadAssignmentMapper).insert(event.capture());
        assertEquals(1L, event.getValue().getLeadId());
        assertEquals(8L, event.getValue().getToUserId());
        assertEquals(9L, event.getValue().getActorUserId());
        assertEquals("assign", event.getValue().getAction());
        assertEquals("工作量平衡", event.getValue().getReason());
    }

    @Test
    void roundRobinAssignmentDistributesInRequestedOrderAndAuditsOnlySuccessfulRows() {
        when(leadMapper.selectById(21L)).thenReturn(lead(21L, "new", null));
        when(leadMapper.selectById(22L)).thenReturn(lead(22L, "claimed", 5L));
        when(leadMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<LeadDO>>any())).thenReturn(1, 0);

        List<LeadRoundRobinAssignmentResult> results = service.assignRoundRobin(
                List.of(21L, 22L), List.of(8L, 10L), 9L, "  轮转试分配  ");

        assertEquals(List.of(8L, 10L), results.stream().map(LeadRoundRobinAssignmentResult::toUserId).toList());
        assertEquals(List.of("assigned", "conflict"), results.stream().map(LeadRoundRobinAssignmentResult::outcome).toList());
        assertTrue(results.get(0).success());
        assertFalse(results.get(1).success());
        verify(adminUserApi).validateUser(8L);
        verify(adminUserApi).validateUser(10L);
        ArgumentCaptor<LeadAssignmentDO> events = ArgumentCaptor.forClass(LeadAssignmentDO.class);
        verify(leadAssignmentMapper).insert(events.capture());
        assertEquals(21L, events.getValue().getLeadId());
        assertEquals(8L, events.getValue().getToUserId());
        assertEquals("轮转分配：轮转试分配", events.getValue().getReason());
    }

    @Test
    void roundRobinAssignmentRejectsDuplicateTargetsBeforeTouchingLeads() {
        org.junit.jupiter.api.Assertions.assertThrows(cn.iocoder.yudao.framework.common.exception.ServiceException.class,
                () -> service.assignRoundRobin(List.of(21L), List.of(8L, 8L), 9L, "无效成员列表"));

        verify(leadMapper, never()).selectById(any());
        verify(leadAssignmentMapper, never()).insert(any(LeadAssignmentDO.class));
    }

    @Test
    void savedRuleAdvancesItsCursorAndLinksSuccessfulAuditRows() {
        TenantContextHolder.setTenantId(1L);
        LeadAssignmentRuleDO rule = new LeadAssignmentRuleDO();
        rule.setId(50L);
        rule.setRuleName("销售组轮转");
        rule.setEnabled(true);
        rule.setCursorIndex(1);
        rule.setVersion(4);
        when(leadAssignmentRuleMapper.selectById(50L)).thenReturn(rule);
        when(leadAssignmentRuleMemberMapper.selectByRuleIds(1L, List.of(50L)))
                .thenReturn(List.of(ruleMember(50L, 8L, 0), ruleMember(50L, 10L, 1)));
        when(leadAssignmentRuleMapper.update(isNull(),
                org.mockito.ArgumentMatchers.<Wrapper<LeadAssignmentRuleDO>>any())).thenReturn(1);
        when(leadMapper.selectById(21L)).thenReturn(lead(21L, "new", null));
        when(leadMapper.selectById(22L)).thenReturn(lead(22L, "claimed", 5L));
        when(leadMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<LeadDO>>any())).thenReturn(1, 0);

        List<LeadAssignmentRuleApplyResult> results = service.applyRule(50L, 4, List.of(21L, 22L), 9L,
                "组内均衡");

        assertEquals(List.of(10L, 8L), results.stream().map(LeadAssignmentRuleApplyResult::toUserId).toList());
        assertEquals(List.of("assigned", "conflict"), results.stream().map(LeadAssignmentRuleApplyResult::outcome).toList());
        ArgumentCaptor<LeadAssignmentDO> event = ArgumentCaptor.forClass(LeadAssignmentDO.class);
        verify(leadAssignmentMapper).insert(event.capture());
        assertEquals(50L, event.getValue().getRuleId());
        assertEquals("分配规则「销售组轮转」：组内均衡", event.getValue().getReason());
        verify(leadAssignmentRuleMapper).update(isNull(),
                org.mockito.ArgumentMatchers.<Wrapper<LeadAssignmentRuleDO>>any());
        verify(adminUserApi).validateUser(8L);
        verify(adminUserApi).validateUser(10L);
    }

    @Test
    void savedRuleRejectsStaleVersionBeforeUpdatingCursorOrLeads() {
        LeadAssignmentRuleDO rule = new LeadAssignmentRuleDO();
        rule.setId(51L);
        rule.setEnabled(true);
        rule.setVersion(5);
        when(leadAssignmentRuleMapper.selectById(51L)).thenReturn(rule);

        org.junit.jupiter.api.Assertions.assertThrows(cn.iocoder.yudao.framework.common.exception.ServiceException.class,
                () -> service.applyRule(51L, 4, List.of(21L), 9L, "过期版本"));

        verify(leadAssignmentRuleMemberMapper, never()).selectByRuleIds(any(), any());
        verify(leadAssignmentRuleMapper, never()).update(any(), any());
        verify(leadMapper, never()).selectById(any());
    }

    @Test
    void automaticIntakeUsesTenantRuleCursorAndWritesLinkedAudit() {
        TenantContextHolder.setTenantId(1L);
        LeadAssignmentAutoConfigDO config = new LeadAssignmentAutoConfigDO();
        config.setId(70L);
        config.setRuleId(50L);
        config.setVersion(2);
        LeadAssignmentRuleDO rule = new LeadAssignmentRuleDO();
        rule.setId(50L);
        rule.setRuleName("自动轮转");
        rule.setEnabled(true);
        rule.setCursorIndex(1);
        rule.setVersion(4);
        when(leadAssignmentAutoConfigMapper.selectByCurrentTenant()).thenReturn(config);
        when(leadAssignmentRuleMapper.selectById(50L)).thenReturn(rule);
        when(leadAssignmentRuleMemberMapper.selectByRuleIds(1L, List.of(50L)))
                .thenReturn(List.of(ruleMember(50L, 8L, 0), ruleMember(50L, 10L, 1)));
        when(leadAssignmentRuleMapper.update(isNull(),
                org.mockito.ArgumentMatchers.<Wrapper<LeadAssignmentRuleDO>>any())).thenReturn(1);
        when(leadMapper.selectById(99L)).thenReturn(lead(99L, "new", null));
        when(leadMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<LeadDO>>any())).thenReturn(1);

        assertTrue(service.autoAssignNewLead(99L, 12L));

        ArgumentCaptor<LeadAssignmentDO> event = ArgumentCaptor.forClass(LeadAssignmentDO.class);
        verify(leadAssignmentMapper).insert(event.capture());
        assertEquals(99L, event.getValue().getLeadId());
        assertEquals(10L, event.getValue().getToUserId());
        assertEquals(12L, event.getValue().getActorUserId());
        assertEquals(50L, event.getValue().getRuleId());
        assertEquals("分配规则「自动轮转」：新线索自动分配", event.getValue().getReason());
    }

    @Test
    void automaticIntakeLeavesLeadInPoolWhenTenantHasNoAutoRule() {
        TenantContextHolder.setTenantId(1L);
        when(leadAssignmentAutoConfigMapper.selectByCurrentTenant()).thenReturn(null);

        assertFalse(service.autoAssignNewLead(99L, 12L));

        verify(leadAssignmentRuleMapper, never()).selectById(any());
        verify(leadMapper, never()).update(any(), any());
        verify(leadAssignmentMapper, never()).insert(any(LeadAssignmentDO.class));
    }

    @Test
    void savesTenantRecyclePolicyWithVersionedAutoConfig() {
        TenantContextHolder.setTenantId(1L);
        when(leadAssignmentAutoConfigMapper.selectByCurrentTenant()).thenReturn(null);

        LeadAssignmentAutoConfigView saved = service.saveAutoAssignmentConfig(null, true, 14, 0);

        assertEquals(1, saved.version());
        assertTrue(saved.recycleEnabled());
        assertEquals(14, saved.recycleAfterDays());
        ArgumentCaptor<LeadAssignmentAutoConfigDO> config = ArgumentCaptor.forClass(LeadAssignmentAutoConfigDO.class);
        verify(leadAssignmentAutoConfigMapper).insert(config.capture());
        assertTrue(config.getValue().getRecycleEnabled());
        assertEquals(14, config.getValue().getRecycleAfterDays());
        assertEquals(1, config.getValue().getVersion());
    }

    @Test
    void rejectsInvalidTenantRecycleTimeout() {
        org.junit.jupiter.api.Assertions.assertThrows(cn.iocoder.yudao.framework.common.exception.ServiceException.class,
                () -> service.saveAutoAssignmentConfig(null, true, 91, 0));

        verify(leadAssignmentAutoConfigMapper, never()).selectByCurrentTenant();
        verify(leadAssignmentAutoConfigMapper, never()).insert(any(LeadAssignmentAutoConfigDO.class));
    }

    @Test
    void timeoutRecycleUsesTenantPolicyAndAuditsOnlySuccessfulCas() {
        TenantContextHolder.setTenantId(1L);
        LeadAssignmentAutoConfigDO config = new LeadAssignmentAutoConfigDO();
        config.setRecycleEnabled(true);
        config.setRecycleAfterDays(7);
        when(leadAssignmentAutoConfigMapper.selectByCurrentTenant()).thenReturn(config);
        LeadDO expired = lead(101L, "claimed", 12L);
        expired.setUpdateTime(LocalDateTime.now().minusDays(8));
        when(leadMapper.selectExpiredClaimed(any(LocalDateTime.class), org.mockito.ArgumentMatchers.eq(100)))
                .thenReturn(List.of(expired));
        org.mockito.Mockito.doReturn(java.util.Set.of()).when(leadActivityMapper)
                .selectLeadIdsWithActivityAfter(any(), any(LocalDateTime.class));
        org.mockito.Mockito.doReturn(List.of()).when(callDispatchMapper).selectLeadIdsWithActiveDispatch(any());
        when(leadMapper.recycleExpiredClaimed(org.mockito.ArgumentMatchers.eq(1L),
                org.mockito.ArgumentMatchers.eq(101L), org.mockito.ArgumentMatchers.eq(12L),
                org.mockito.ArgumentMatchers.eq(expired.getUpdateTime()), any(LocalDateTime.class),
                any(LocalDateTime.class))).thenReturn(1);

        assertEquals(1, service.recycleExpiredLeads());

        verify(leadMapper).selectExpiredClaimed(any(LocalDateTime.class), org.mockito.ArgumentMatchers.eq(100));
        verify(leadMapper).recycleExpiredClaimed(org.mockito.ArgumentMatchers.eq(1L),
                org.mockito.ArgumentMatchers.eq(101L), org.mockito.ArgumentMatchers.eq(12L),
                org.mockito.ArgumentMatchers.eq(expired.getUpdateTime()), any(LocalDateTime.class),
                any(LocalDateTime.class));
        ArgumentCaptor<LeadAssignmentDO> event = ArgumentCaptor.forClass(LeadAssignmentDO.class);
        verify(leadAssignmentMapper).insert(event.capture());
        assertEquals(101L, event.getValue().getLeadId());
        assertEquals(12L, event.getValue().getFromUserId());
        assertEquals(0L, event.getValue().getActorUserId());
        assertEquals("recycle", event.getValue().getAction());
        assertTrue(event.getValue().getReason().contains("7 天"));
    }

    @Test
    void timeoutRecycleDoesNothingUntilTenantEnablesIt() {
        TenantContextHolder.setTenantId(1L);
        LeadAssignmentAutoConfigDO config = new LeadAssignmentAutoConfigDO();
        config.setRecycleEnabled(false);
        config.setRecycleAfterDays(7);
        when(leadAssignmentAutoConfigMapper.selectByCurrentTenant()).thenReturn(config);

        assertEquals(0, service.recycleExpiredLeads());

        verify(leadMapper, never()).selectExpiredClaimed(any(LocalDateTime.class), org.mockito.ArgumentMatchers.eq(100));
        verify(leadAssignmentMapper, never()).insert(any(LeadAssignmentDO.class));
    }

    @Test
    void timeoutRecycleSkipsRecentActivityAndActivePhoneDispatch() {
        TenantContextHolder.setTenantId(1L);
        LeadAssignmentAutoConfigDO config = new LeadAssignmentAutoConfigDO();
        config.setRecycleEnabled(true);
        config.setRecycleAfterDays(7);
        when(leadAssignmentAutoConfigMapper.selectByCurrentTenant()).thenReturn(config);
        LeadDO recentActivity = lead(102L, "claimed", 12L);
        recentActivity.setUpdateTime(LocalDateTime.now().minusDays(8));
        LeadDO pendingDispatch = lead(103L, "claimed", 13L);
        pendingDispatch.setUpdateTime(LocalDateTime.now().minusDays(8));
        when(leadMapper.selectExpiredClaimed(any(LocalDateTime.class), org.mockito.ArgumentMatchers.eq(100)))
                .thenReturn(List.of(recentActivity, pendingDispatch));
        org.mockito.Mockito.doReturn(java.util.Set.of(102L)).when(leadActivityMapper)
                .selectLeadIdsWithActivityAfter(any(), any(LocalDateTime.class));
        org.mockito.Mockito.doReturn(List.of(103L)).when(callDispatchMapper)
                .selectLeadIdsWithActiveDispatch(any());

        assertEquals(0, service.recycleExpiredLeads());

        verify(leadMapper, never()).recycleExpiredClaimed(any(), any(), any(), any(), any(), any());
        verify(leadAssignmentMapper, never()).insert(any(LeadAssignmentDO.class));
    }

    @Test
    void batchAssignmentSkipsMissingClosedAndAlreadyAssignedRows() {
        when(leadMapper.selectById(10L)).thenReturn(null);
        when(leadMapper.selectById(11L)).thenReturn(lead(11L, "converted", 3L));
        when(leadMapper.selectById(12L)).thenReturn(lead(12L, "claimed", 8L));

        List<LeadBatchAssignmentResult> results = service.assignBatch(List.of(10L, 11L, 12L), 8L, 9L, "无需变更");

        assertEquals(List.of("not_found", "not_assignable", "already_assigned"),
                results.stream().map(LeadBatchAssignmentResult::outcome).toList());
        assertFalse(results.get(0).success());
        assertFalse(results.get(1).success());
        assertTrue(results.get(2).success());
        verify(leadMapper, never()).update(any(), any());
        verify(leadAssignmentMapper, never()).insert(any(LeadAssignmentDO.class));
    }

    @Test
    void assigningToCurrentOwnerIsIdempotentWithoutDuplicateAudit() {
        when(leadMapper.selectById(3L)).thenReturn(lead(3L, "claimed", 8L));

        assertTrue(service.assign(3L, 8L, 9L, "重复请求"));

        verify(leadMapper, never()).update(any(), any());
        verify(leadAssignmentMapper, never()).insert(any(LeadAssignmentDO.class));
    }

    @Test
    void recycleUsesConditionalUpdateAndRecordsPreviousOwner() {
        when(leadMapper.selectById(4L)).thenReturn(lead(4L, "claimed", 5L));
        when(leadMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<LeadDO>>any())).thenReturn(1);

        assertTrue(service.recycle(4L, 9L, "  超期未跟进  "));

        ArgumentCaptor<LeadAssignmentDO> event = ArgumentCaptor.forClass(LeadAssignmentDO.class);
        verify(leadAssignmentMapper).insert(event.capture());
        assertEquals(5L, event.getValue().getFromUserId());
        assertNull(event.getValue().getToUserId());
        assertEquals("recycle", event.getValue().getAction());
        assertEquals("超期未跟进", event.getValue().getReason());
    }

    @Test
    void recycleConflictDoesNotWriteAudit() {
        when(leadMapper.selectById(4L)).thenReturn(lead(4L, "claimed", 5L));
        when(leadMapper.update(isNull(), org.mockito.ArgumentMatchers.<Wrapper<LeadDO>>any())).thenReturn(0);

        assertFalse(service.recycle(4L, 9L, "状态冲突"));
        verify(leadAssignmentMapper, never()).insert(any(LeadAssignmentDO.class));
    }

    @Test
    void assignmentHistoryDoesNotReadAuditForMissingOrOutOfScopeLead() {
        LeadAssignmentHistoryPageReqVO reqVO = new LeadAssignmentHistoryPageReqVO();
        reqVO.setLeadId(77L);
        when(leadMapper.selectById(77L)).thenReturn(null);

        PageResult<LeadAssignmentDO> result = service.getHistory(reqVO);

        assertEquals(0L, result.getTotal());
        verify(leadAssignmentMapper, never()).selectPage(any(PageParam.class), any(Wrapper.class));
    }

    @Test
    void assignmentHistoryReadsOnlyAfterLeadPassesOwnerScope() {
        LeadAssignmentHistoryPageReqVO reqVO = new LeadAssignmentHistoryPageReqVO();
        reqVO.setLeadId(78L);
        LeadDO visibleLead = lead(78L, "claimed", 5L);
        when(leadMapper.selectById(78L)).thenReturn(visibleLead);
        PageResult<LeadAssignmentDO> expected = new PageResult<>(List.of(new LeadAssignmentDO()), 1L);
        org.mockito.Mockito.doReturn(expected).when(leadAssignmentMapper)
                .selectPage(any(PageParam.class), any(Wrapper.class));

        PageResult<LeadAssignmentDO> result = service.getHistory(reqVO);

        assertSame(expected, result);
        verify(leadAssignmentMapper).selectPage(any(PageParam.class), any(Wrapper.class));
    }

    private static LeadDO lead(Long id, String status, Long ownerUserId) {
        LeadDO lead = new LeadDO();
        lead.setId(id);
        lead.setStatus(status);
        lead.setOwnerUserId(ownerUserId);
        return lead;
    }

    private static LeadAssignmentRuleMemberDO ruleMember(Long ruleId, Long userId, int sortNo) {
        LeadAssignmentRuleMemberDO member = new LeadAssignmentRuleMemberDO();
        member.setRuleId(ruleId);
        member.setUserId(userId);
        member.setSortNo(sortNo);
        return member;
    }
}
