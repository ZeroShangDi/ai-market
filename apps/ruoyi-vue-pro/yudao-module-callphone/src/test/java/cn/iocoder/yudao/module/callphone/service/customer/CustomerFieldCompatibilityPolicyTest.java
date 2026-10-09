package cn.iocoder.yudao.module.callphone.service.customer;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerFieldDO;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CustomerFieldCompatibilityPolicyTest {

    @Test
    void rejectsTypeChangesThatWouldInvalidateStoredCustomerValues() {
        CustomerFieldDO existing = field("text", null);

        ServiceException error = assertThrows(ServiceException.class,
                () -> CustomerFieldCompatibilityPolicy.validateUpdate(existing, "number", null));

        assertEquals(ErrorCodeConstants.CUSTOMER_FIELD_TYPE_IMMUTABLE.getCode(), error.getCode());
    }

    @Test
    void keepsExistingOptionValuesButAllowsAppendingOrReorderingOptions() {
        CustomerFieldDO existing = field("select", "[\"零售\",\"制造\"]");

        CustomerFieldCompatibilityPolicy.validateUpdate(existing, "select", "[\"制造\",\"零售\",\"医疗\"]");
    }

    @Test
    void rejectsRemovingAnOptionThatMayAlreadyBeStoredOnCustomers() {
        CustomerFieldDO existing = field("multi_select", "[\"A\",\"B\"]");

        ServiceException error = assertThrows(ServiceException.class,
                () -> CustomerFieldCompatibilityPolicy.validateUpdate(existing, "multi_select", "[\"A\"]"));

        assertEquals(ErrorCodeConstants.CUSTOMER_FIELD_OPTIONS_IMMUTABLE.getCode(), error.getCode());
    }

    @Test
    void failsClosedWhenTheExistingOptionDefinitionIsInvalid() {
        CustomerFieldDO existing = field("select", "not-json");

        ServiceException error = assertThrows(ServiceException.class,
                () -> CustomerFieldCompatibilityPolicy.validateUpdate(existing, "select", "[\"A\"]"));

        assertEquals(ErrorCodeConstants.CUSTOMER_FIELD_OPTIONS_INVALID.getCode(), error.getCode());
    }

    private CustomerFieldDO field(String type, String options) {
        CustomerFieldDO field = new CustomerFieldDO();
        field.setValueType(type);
        field.setOptionsJson(options);
        return field;
    }
}
