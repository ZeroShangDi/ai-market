package cn.iocoder.yudao.module.callphone.service.leads;

public record LeadAssignmentRuleApplyResult(Long leadId, Long toUserId, boolean success, String outcome) {
}
