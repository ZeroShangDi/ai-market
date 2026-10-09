package cn.iocoder.yudao.module.callphone.job.wecom;

import cn.iocoder.yudao.framework.quartz.core.handler.JobHandler;
import cn.iocoder.yudao.framework.tenant.core.job.TenantJob;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchiveCleanupRespVO;
import cn.iocoder.yudao.module.callphone.service.wecom.WeComArchiveService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Component;

/** Deletes at most one tenant-local batch of expired archive messages per scheduler run. */
@Component("callPhoneWeComArchiveRetentionCleanupJob")
public class WeComArchiveRetentionCleanupJob implements JobHandler {

    @Resource
    private WeComArchiveService archiveService;

    @Override
    @TenantJob
    public String execute(String param) {
        WeComArchiveCleanupRespVO result = archiveService.cleanupExpiredForSystem();
        return "自动清理过期会话存档 " + result.getDeletedCount() + " 条，剩余 " + result.getRemainingCount() + " 条";
    }
}
