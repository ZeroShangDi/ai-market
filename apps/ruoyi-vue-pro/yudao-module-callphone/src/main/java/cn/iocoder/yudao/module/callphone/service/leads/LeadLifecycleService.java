package cn.iocoder.yudao.module.callphone.service.leads;

public interface LeadLifecycleService {

    Long convert(Long leadId, String idempotencyKey, Long userId, String note);

    Long archive(Long leadId, String archiveType, Long targetLeadId, String reason,
                 String idempotencyKey, Long userId);

    boolean restore(Long archiveEventId, String reason, Long userId);
}
