package cn.iocoder.yudao.module.callphone.service.customer;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONUtil;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerFieldDO;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import java.util.List;
import java.util.Objects;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

/** Protects encrypted customer values when an administrator edits a field definition. */
public final class CustomerFieldCompatibilityPolicy {

    private static final List<String> OPTION_TYPES = List.of("select", "multi_select");

    private CustomerFieldCompatibilityPolicy() {}

    public static void validateUpdate(CustomerFieldDO existing, String requestedType, String requestedOptionsJson) {
        if (!Objects.equals(existing.getValueType(), requestedType)) {
            throw exception(ErrorCodeConstants.CUSTOMER_FIELD_TYPE_IMMUTABLE);
        }
        if (!OPTION_TYPES.contains(existing.getValueType())) return;

        List<String> existingOptions = parseOptions(existing.getOptionsJson());
        List<String> requestedOptions = parseOptions(requestedOptionsJson);
        if (!requestedOptions.containsAll(existingOptions)) {
            throw exception(ErrorCodeConstants.CUSTOMER_FIELD_OPTIONS_IMMUTABLE);
        }
    }

    private static List<String> parseOptions(String optionsJson) {
        try {
            JSONArray options = JSONUtil.parseArray(optionsJson);
            if (options == null || options.isEmpty()
                    || options.stream().anyMatch(item -> !(item instanceof String text) || text.isBlank())
                    || options.stream().map(String::valueOf).distinct().count() != options.size()) {
                throw exception(ErrorCodeConstants.CUSTOMER_FIELD_OPTIONS_INVALID);
            }
            return options.stream().map(String::valueOf).toList();
        } catch (RuntimeException invalid) {
            throw exception(ErrorCodeConstants.CUSTOMER_FIELD_OPTIONS_INVALID);
        }
    }
}
