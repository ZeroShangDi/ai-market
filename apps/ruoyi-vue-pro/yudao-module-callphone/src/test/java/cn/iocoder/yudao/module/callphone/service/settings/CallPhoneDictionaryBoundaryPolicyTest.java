package cn.iocoder.yudao.module.callphone.service.settings;

import cn.iocoder.yudao.module.system.dal.dataobject.dict.DictDataDO;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import org.junit.jupiter.api.Test;

import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.BUSINESS_DICTIONARY_ITEM_NOT_FOUND;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.BUSINESS_DICTIONARY_ITEM_TYPE_IMMUTABLE;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.BUSINESS_DICTIONARY_TYPE_INVALID;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;

class CallPhoneDictionaryBoundaryPolicyTest {

    @Test
    void allowsOnlyWellFormedCallPhoneDictionaryTypes() {
        assertDoesNotThrow(() -> CallPhoneDictionaryBoundaryPolicy.requireCallPhoneType("callphone_call_result"));
        assertError(BUSINESS_DICTIONARY_TYPE_INVALID.getCode(),
                () -> CallPhoneDictionaryBoundaryPolicy.requireCallPhoneType("system_common_status"));
        assertError(BUSINESS_DICTIONARY_TYPE_INVALID.getCode(),
                () -> CallPhoneDictionaryBoundaryPolicy.requireCallPhoneType("callphone_Invalid"));
    }

    @Test
    void preventsEditingAnotherModulesDictionaryItem() {
        DictDataDO existing = item(7L, "system_common_status");
        assertError(BUSINESS_DICTIONARY_ITEM_NOT_FOUND.getCode(),
                () -> CallPhoneDictionaryBoundaryPolicy.requireCallPhoneItem(existing, 7L, "callphone_result"));
    }

    @Test
    void preventsMovingCallPhoneItemToAnotherDictionaryType() {
        DictDataDO existing = item(8L, "callphone_call_result");
        assertError(BUSINESS_DICTIONARY_ITEM_TYPE_IMMUTABLE.getCode(),
                () -> CallPhoneDictionaryBoundaryPolicy.requireCallPhoneItem(existing, 8L, "callphone_lead_source"));
    }

    @Test
    void allowsUpdatingAnItemWithinItsOriginalCallPhoneDictionary() {
        DictDataDO existing = item(9L, "callphone_call_result");
        assertDoesNotThrow(() -> CallPhoneDictionaryBoundaryPolicy.requireCallPhoneItem(
                existing, 9L, "callphone_call_result"));
    }

    private DictDataDO item(Long id, String type) {
        DictDataDO item = new DictDataDO();
        item.setId(id);
        item.setDictType(type);
        return item;
    }

    private void assertError(int expectedCode, org.junit.jupiter.api.function.Executable executable) {
        ServiceException error = assertThrows(ServiceException.class, executable);
        assertEquals(expectedCode, error.getCode());
    }

}
