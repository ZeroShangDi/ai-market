package cn.iocoder.yudao.module.callphone.service.customer;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerOwnerChangeDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerOwnerChangeMapper;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CUSTOMER_BATCH_STATE_CONFLICT;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CUSTOMER_TAGS_INVALID;

@Service
public class CustomerBatchManagementServiceImpl implements CustomerBatchManagementService {

    @Resource private CustomerMapper customerMapper;
    @Resource private CustomerOwnerChangeMapper ownerChangeMapper;
    @Resource private AdminUserApi adminUserApi;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int assignOwners(List<Long> customerIds, Long ownerUserId, Long actorUserId) {
        validateIds(customerIds);
        if (ownerUserId == null) throw ServiceExceptionUtil.invalidParamException("请选择有效的负责人");
        adminUserApi.validateUser(ownerUserId);
        List<CustomerDO> customers = lockActiveCustomers(customerIds);
        int changed = 0;
        for (CustomerDO customer : customers) {
            Long previousOwner = customer.getOwnerUserId();
            if (Objects.equals(previousOwner, ownerUserId)) continue;
            customer.setOwnerUserId(ownerUserId);
            if (customerMapper.updateById(customer) != 1) throw exception(CUSTOMER_BATCH_STATE_CONFLICT);

            CustomerOwnerChangeDO event = new CustomerOwnerChangeDO();
            event.setId(IdUtil.getSnowflake().nextId());
            event.setCustomerId(customer.getId());
            event.setFromOwnerUserId(previousOwner);
            event.setToOwnerUserId(ownerUserId);
            event.setActorUserId(actorUserId);
            ownerChangeMapper.insert(event);
            changed++;
        }
        return changed;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int updateTags(List<Long> customerIds, String mode, List<String> requestedTags) {
        validateIds(customerIds);
        List<String> tags = normalizeTags(mode, requestedTags);
        List<CustomerDO> customers = lockActiveCustomers(customerIds);
        int changed = 0;
        for (CustomerDO customer : customers) {
            String updated = applyTags(customer.getTags(), mode, tags);
            if (updated.length() > 512) throw exception(CUSTOMER_TAGS_INVALID);
            if (Objects.equals(emptyToNull(customer.getTags()), emptyToNull(updated))) continue;
            customer.setTags(updated.isEmpty() ? null : updated);
            if (customerMapper.updateById(customer) != 1) throw exception(CUSTOMER_BATCH_STATE_CONFLICT);
            changed++;
        }
        return changed;
    }

    private List<CustomerDO> lockActiveCustomers(List<Long> customerIds) {
        List<CustomerDO> customers = customerMapper.selectList(new LambdaQueryWrapperX<CustomerDO>()
                .in(CustomerDO::getId, customerIds)
                .eq(CustomerDO::getStatus, "active")
                .orderByAsc(CustomerDO::getId)
                .last("FOR UPDATE"));
        // The owner data-permission rule and tenant interceptor apply to this lock read.
        // Reject the entire batch if even one selected record is missing, archived, or out of scope.
        if (customers.size() != customerIds.size()) throw exception(CUSTOMER_BATCH_STATE_CONFLICT);
        return customers;
    }

    private void validateIds(List<Long> customerIds) {
        if (customerIds == null || customerIds.isEmpty() || customerIds.size() > 100
                || customerIds.stream().anyMatch(Objects::isNull)
                || customerIds.stream().distinct().count() != customerIds.size()) {
            throw ServiceExceptionUtil.invalidParamException("客户列表必须包含 1 到 100 条不重复记录");
        }
    }

    private List<String> normalizeTags(String mode, List<String> requestedTags) {
        if (mode == null || !List.of("append", "replace", "clear").contains(mode)) {
            throw exception(CUSTOMER_TAGS_INVALID);
        }
        if ("clear".equals(mode)) {
            if (requestedTags != null && !requestedTags.isEmpty()) throw exception(CUSTOMER_TAGS_INVALID);
            return List.of();
        }
        if (requestedTags == null || requestedTags.isEmpty()) throw exception(CUSTOMER_TAGS_INVALID);
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String tag : requestedTags) {
            if (tag == null) throw exception(CUSTOMER_TAGS_INVALID);
            String value = tag.trim();
            if (value.isEmpty() || value.length() > 32) throw exception(CUSTOMER_TAGS_INVALID);
            normalized.add(value);
        }
        if (normalized.isEmpty()) throw exception(CUSTOMER_TAGS_INVALID);
        return List.copyOf(normalized);
    }

    private String applyTags(String existing, String mode, List<String> requestedTags) {
        if ("clear".equals(mode)) return "";
        if ("replace".equals(mode)) return String.join(",", requestedTags);
        LinkedHashSet<String> merged = new LinkedHashSet<>();
        if (existing != null && !existing.isBlank()) {
            for (String tag : existing.split("[,，]")) {
                String value = tag.trim();
                if (!value.isEmpty()) merged.add(value);
            }
        }
        merged.addAll(requestedTags);
        return String.join(",", new ArrayList<>(merged));
    }

    private String emptyToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }
}
