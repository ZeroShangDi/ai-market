package cn.iocoder.yudao.module.callphone.service.leads;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadAssignmentHistoryPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadAssignmentDO;
import java.util.List;

public interface LeadAssignmentService {

    boolean assign(Long leadId, Long toUserId, Long actorUserId, String reason);

    List<LeadBatchAssignmentResult> assignBatch(List<Long> leadIds, Long toUserId, Long actorUserId, String reason);

    List<LeadRoundRobinAssignmentResult> assignRoundRobin(List<Long> leadIds, List<Long> toUserIds,
                                                           Long actorUserId, String reason);

    PageResult<LeadAssignmentRuleView> getRulePage(int pageNo, int pageSize, String query);

    LeadAssignmentRuleView saveRule(Long id, Integer expectedVersion, String name, Boolean enabled,
                                    List<Long> memberIds);

    LeadAssignmentAutoConfigView getAutoAssignmentConfig();

    LeadAssignmentAutoConfigView saveAutoAssignmentConfig(Long ruleId, Boolean recycleEnabled,
                                                           Integer recycleAfterDays, Integer expectedVersion);

    int recycleExpiredLeads();

    boolean autoAssignNewLead(Long leadId, Long actorUserId);

    List<LeadAssignmentRulePreviewRow> previewRule(Long ruleId, Integer expectedVersion, List<Long> leadIds);

    List<LeadAssignmentRuleApplyResult> applyRule(Long ruleId, Integer expectedVersion, List<Long> leadIds,
                                                  Long actorUserId, String reason);

    boolean recycle(Long leadId, Long actorUserId, String reason);

    void recordAssignment(Long leadId, Long fromUserId, Long toUserId, Long actorUserId, String action, String reason);

    void recordAssignment(Long leadId, Long fromUserId, Long toUserId, Long actorUserId, Long ruleId,
                          String action, String reason);

    PageResult<LeadAssignmentDO> getHistory(LeadAssignmentHistoryPageReqVO reqVO);
}
