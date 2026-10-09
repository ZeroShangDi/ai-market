package cn.iocoder.yudao.module.callphone.job.lead;

import cn.iocoder.yudao.framework.quartz.core.handler.JobHandler;
import cn.iocoder.yudao.framework.tenant.core.job.TenantJob;
import cn.iocoder.yudao.module.callphone.service.leads.LeadAssignmentService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Component;

/** Recycles only tenant leads whose timeout policy is explicitly enabled. */
@Component("callPhoneLeadTimeoutRecycleJob")
public class LeadAssignmentTimeoutRecycleJob implements JobHandler {

    @Resource
    private LeadAssignmentService leadAssignmentService;

    @Override
    @TenantJob
    public String execute(String param) {
        int recycled = leadAssignmentService.recycleExpiredLeads();
        return "超时线索回收 " + recycled + " 条";
    }
}
