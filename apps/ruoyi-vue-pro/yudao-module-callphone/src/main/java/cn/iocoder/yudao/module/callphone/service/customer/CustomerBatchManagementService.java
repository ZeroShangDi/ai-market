package cn.iocoder.yudao.module.callphone.service.customer;

import java.util.List;

public interface CustomerBatchManagementService {
    int assignOwners(List<Long> customerIds, Long ownerUserId, Long actorUserId);

    int updateTags(List<Long> customerIds, String mode, List<String> tags);
}
