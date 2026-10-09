package cn.iocoder.yudao.module.callphone.service.leads;

public record LeadRoundRobinAssignmentResult(Long id, Long toUserId, boolean success, String outcome) {
}
