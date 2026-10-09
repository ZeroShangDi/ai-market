package cn.iocoder.yudao.module.callphone.service.customer;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONUtil;
import cn.iocoder.yudao.framework.common.biz.system.permission.PermissionCommonApi;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerFieldDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerFieldMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class CustomerCustomFieldService {
    private static final int MAX_PLAINTEXT_LENGTH = 16_000;

    @Resource private CustomerFieldMapper fieldMapper;
    @Resource private PiiCryptoService piiCryptoService;
    @Resource private PermissionCommonApi permissionCommonApi;
    @Resource private ObjectMapper objectMapper;

    public List<CustomerFieldDO> getVisibleFields(Long userId) {
        return fieldMapper.selectEnabledOrdered().stream().filter(field -> isVisibleTo(field, userId)).toList();
    }

    public List<CustomerFieldDO> getVisibleListFields(Long userId) {
        return getVisibleFields(userId).stream().filter(field -> Boolean.TRUE.equals(field.getListVisible())).toList();
    }

    public Map<String, Object> getListValues(String ciphertext, Long userId) {
        return getListValues(ciphertext, getVisibleListFields(userId));
    }

    public Map<String, Object> getListValues(String ciphertext, List<CustomerFieldDO> fields) {
        Map<String, Object> allValues = decrypt(ciphertext);
        Map<String, Object> visible = new LinkedHashMap<>();
        fields.stream()
                .forEach(field -> { if (allValues.containsKey(field.getFieldKey())) visible.put(field.getFieldKey(), allValues.get(field.getFieldKey())); });
        return visible;
    }

    public Map<String, Object> getDetailValues(String ciphertext, Long userId) {
        Map<String, Object> allValues = decrypt(ciphertext);
        Map<String, Object> visible = new LinkedHashMap<>();
        getVisibleFields(userId).forEach(field -> { if (allValues.containsKey(field.getFieldKey())) visible.put(field.getFieldKey(), allValues.get(field.getFieldKey())); });
        return visible;
    }

    public String validateAndEncrypt(String existingCiphertext, Map<String, Object> submitted, Long userId) {
        Map<String, Object> values = decrypt(existingCiphertext);
        Map<String, Object> requested = submitted == null ? Map.of() : submitted;
        if (requested.size() > 40) throw exception(ErrorCodeConstants.CUSTOMER_FIELD_VALUE_INVALID);
        List<CustomerFieldDO> visibleFields = getVisibleFields(userId);
        Map<String, CustomerFieldDO> accessibleByKey = new LinkedHashMap<>();
        visibleFields.forEach(field -> accessibleByKey.put(field.getFieldKey(), field));

        for (Map.Entry<String, Object> entry : requested.entrySet()) {
            CustomerFieldDO field = accessibleByKey.get(entry.getKey());
            if (field == null) throw exception(ErrorCodeConstants.CUSTOMER_FIELD_VALUE_INVALID);
            Object normalized = normalize(field, entry.getValue());
            if (normalized == null) values.remove(field.getFieldKey());
            else values.put(field.getFieldKey(), normalized);
        }
        for (CustomerFieldDO field : visibleFields) {
            if (Boolean.TRUE.equals(field.getRequired()) && isEmpty(values.get(field.getFieldKey()))) {
                throw exception(ErrorCodeConstants.CUSTOMER_FIELD_REQUIRED);
            }
        }
        if (values.isEmpty()) return null;
        try {
            String json = objectMapper.writeValueAsString(values);
            if (json.length() > MAX_PLAINTEXT_LENGTH) throw exception(ErrorCodeConstants.CUSTOMER_FIELD_VALUE_INVALID);
            return piiCryptoService.encrypt(json);
        } catch (Exception serializationError) {
            throw exception(ErrorCodeConstants.CUSTOMER_FIELD_VALUE_INVALID);
        }
    }

    private boolean isVisibleTo(CustomerFieldDO field, Long userId) {
        List<String> roleCodes = parseRoleCodes(field.getVisibleRoleCodesJson());
        return roleCodes.isEmpty() || permissionCommonApi.hasAnyRoles(userId, roleCodes.toArray(String[]::new));
    }

    private List<String> parseRoleCodes(String value) {
        if (value == null || value.isBlank()) return List.of();
        try {
            JSONArray values = JSONUtil.parseArray(value);
            if (values.stream().anyMatch(item -> !(item instanceof String))) return List.of("__invalid__");
            return values.stream().map(String::valueOf).distinct().toList();
        } catch (Exception parseError) {
            return List.of("__invalid__");
        }
    }

    private Map<String, Object> decrypt(String ciphertext) {
        if (ciphertext == null || ciphertext.isBlank()) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(piiCryptoService.decrypt(ciphertext), new TypeReference<>() { });
        } catch (Exception decryptError) {
            throw new IllegalStateException("Unable to read encrypted Call Phone customer custom fields", decryptError);
        }
    }

    private Object normalize(CustomerFieldDO field, Object value) {
        if (value == null || (value instanceof String text && text.isBlank())) return null;
        try {
            return switch (field.getValueType()) {
                case "text" -> normalizeText(value);
                case "number" -> new BigDecimal(String.valueOf(value)).stripTrailingZeros();
                case "date" -> LocalDate.parse(String.valueOf(value)).toString();
                case "select" -> normalizeSelect(field, value);
                case "multi_select" -> normalizeMultiSelect(field, value);
                case "boolean" -> value instanceof Boolean ? value : invalidValue();
                default -> invalidValue();
            };
        } catch (RuntimeException invalid) {
            throw exception(ErrorCodeConstants.CUSTOMER_FIELD_VALUE_INVALID);
        }
    }

    private String normalizeText(Object value) {
        if (!(value instanceof String text) || text.length() > 2_000) return invalidValue();
        return text;
    }

    private String normalizeSelect(CustomerFieldDO field, Object value) {
        if (!(value instanceof String text) || !getOptions(field).contains(text)) return invalidValue();
        return text;
    }

    private List<String> normalizeMultiSelect(CustomerFieldDO field, Object value) {
        if (!(value instanceof Collection<?> items) || items.size() > 20) return invalidValue();
        List<String> options = getOptions(field);
        List<String> selected = new ArrayList<>();
        for (Object item : items) {
            if (!(item instanceof String text) || !options.contains(text) || selected.contains(text)) return invalidValue();
            selected.add(text);
        }
        return selected.isEmpty() ? null : selected;
    }

    private List<String> getOptions(CustomerFieldDO field) {
        try {
            JSONArray array = JSONUtil.parseArray(field.getOptionsJson());
            return array.stream().filter(String.class::isInstance).map(String.class::cast).toList();
        } catch (Exception invalid) {
            return List.of();
        }
    }

    private boolean isEmpty(Object value) {
        return value == null || (value instanceof String text && text.isBlank())
                || (value instanceof Collection<?> items && items.isEmpty());
    }

    private <T> T invalidValue() {
        throw exception(ErrorCodeConstants.CUSTOMER_FIELD_VALUE_INVALID);
    }
}
