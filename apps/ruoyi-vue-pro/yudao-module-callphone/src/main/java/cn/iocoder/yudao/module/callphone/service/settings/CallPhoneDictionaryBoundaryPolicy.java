package cn.iocoder.yudao.module.callphone.service.settings;

import cn.iocoder.yudao.module.system.dal.dataobject.dict.DictDataDO;

import java.util.Objects;
import java.util.regex.Pattern;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.BUSINESS_DICTIONARY_ITEM_NOT_FOUND;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.BUSINESS_DICTIONARY_ITEM_TYPE_IMMUTABLE;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.BUSINESS_DICTIONARY_TYPE_INVALID;

/**
 * Enforces the Call Phone namespace when the module reuses Yudao's global dictionary tables.
 */
public final class CallPhoneDictionaryBoundaryPolicy {

    private static final Pattern CALLPHONE_TYPE = Pattern.compile("^callphone_[a-z0-9_]+$");

    private CallPhoneDictionaryBoundaryPolicy() {
    }

    public static boolean isCallPhoneType(String type) {
        return type != null && CALLPHONE_TYPE.matcher(type).matches();
    }

    public static void requireCallPhoneType(String type) {
        if (!isCallPhoneType(type)) {
            throw exception(BUSINESS_DICTIONARY_TYPE_INVALID);
        }
    }

    public static void requireCallPhoneItem(DictDataDO existing, Long requestedId, String requestedType) {
        if (existing == null || !isCallPhoneType(existing.getDictType())
                || !Objects.equals(existing.getId(), requestedId)) {
            throw exception(BUSINESS_DICTIONARY_ITEM_NOT_FOUND);
        }
        requireCallPhoneType(requestedType);
        if (!Objects.equals(existing.getDictType(), requestedType)) {
            throw exception(BUSINESS_DICTIONARY_ITEM_TYPE_IMMUTABLE);
        }
    }

}
